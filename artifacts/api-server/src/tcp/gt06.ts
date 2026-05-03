/**
 * Protocolo GT06 / Concox (binário) — usado pelo rastreador J14 e similares.
 *
 * Estrutura do pacote (short packet):
 *   [0x78 0x78] [length] [protocol] [content...] [serial_hi] [serial_lo] [crc_hi] [crc_lo] [0x0D 0x0A]
 *   length = conta do protocol até o CRC (inclusive)
 *   total  = length + 5 bytes
 *
 * Protocolos suportados:
 *   0x01 → Login (IMEI em BCD, 8 bytes)   → responde com o mesmo protocol number
 *   0x22 → GPS Location                   → responde com o mesmo protocol number
 *   0x23 → Heartbeat                      → responde com o mesmo protocol number
 *   outros → responde para manter conexão
 */

import net from "node:net";
import { logger } from "../lib/logger";
import { saveLocalizacao } from "./supabase";

// ── CRC-16/CCITT (xmodem) ────────────────────────────────────────────────────

function crc16(buf: Buffer, start: number, end: number): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= (buf[i]! << 8);
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// ── Resposta ao rastreador ────────────────────────────────────────────────────

function buildResponse(protocol: number, serialHi: number, serialLo: number): Buffer {
  // CRC calculado sobre: [0x05, protocol, serialHi, serialLo]
  const forCrc = Buffer.from([0x05, protocol, serialHi, serialLo]);
  const checksum = crc16(forCrc, 0, forCrc.length);
  return Buffer.from([
    0x78, 0x78,
    0x05,
    protocol,
    serialHi, serialLo,
    (checksum >> 8) & 0xff, checksum & 0xff,
    0x0d, 0x0a,
  ]);
}

// ── IMEI em BCD (8 bytes → 15 dígitos) ───────────────────────────────────────

function parseImeiFromBcd(buf: Buffer, offset: number): string {
  let imei = "";
  for (let i = 0; i < 8; i++) {
    const byte = buf[offset + i]!;
    imei += ((byte >> 4) & 0x0f).toString();
    imei += (byte & 0x0f).toString();
  }
  // BCD gera 16 dígitos; IMEI tem 15 — remove o zero inicial
  return imei.startsWith("0") ? imei.slice(1) : imei;
}

// ── Constantes de protocolo ───────────────────────────────────────────────────

const PROTOCOL_LOGIN       = 0x01;
const PROTOCOL_GPS         = 0x22;
const PROTOCOL_HEARTBEAT   = 0x23;
const PROTOCOL_STATUS_INFO = 0x13; // bateria, sinal GSM, alarme
const PROTOCOL_GPS_LBS_1   = 0x10; // GPS+LBS (variante)
const PROTOCOL_GPS_LBS_2   = 0x11; // GPS+LBS (variante)
const PROTOCOL_ALARM       = 0x16; // alarme/alerta
const PROTOCOL_GPS_2       = 0x26; // GPS (variante de alguns firmwares)

// ── Estado por conexão ────────────────────────────────────────────────────────

export interface GT06State {
  imei: string;
  binBuf: Buffer;
}

export function createGT06State(): GT06State {
  return { imei: "", binBuf: Buffer.alloc(0) };
}

// ── Handler principal ─────────────────────────────────────────────────────────

export function handleGT06Data(
  socket: net.Socket,
  remoteAddr: string,
  chunk: Buffer,
  state: GT06State
): void {
  state.binBuf = Buffer.concat([state.binBuf, chunk]);

  while (state.binBuf.length >= 4) {
    if (state.binBuf[0] !== 0x78 || state.binBuf[1] !== 0x78) {
      logger.warn(
        { remoteAddr, hex: state.binBuf.slice(0, 4).toString("hex") },
        "GT06: bytes iniciais inválidos — limpando buffer"
      );
      state.binBuf = Buffer.alloc(0);
      break;
    }

    const length   = state.binBuf[2]!;
    const totalLen = length + 5; // start(2) + len(1) + content(length) + end(2)

    if (state.binBuf.length < totalLen) break; // aguarda mais bytes

    const packet   = state.binBuf.slice(0, totalLen);
    state.binBuf   = state.binBuf.slice(totalLen);

    processGT06Packet(socket, remoteAddr, packet, state);
  }
}

// ── Processamento de pacote completo ─────────────────────────────────────────

function processGT06Packet(
  socket: net.Socket,
  remoteAddr: string,
  packet: Buffer,
  state: GT06State
): void {
  const length   = packet[2]!;
  const protocol = packet[3]!;

  // Serial: 4 e 3 bytes antes do fim (end = 0D 0A)
  // packet[totalLen - 1] = 0x0A, [totalLen - 2] = 0x0D
  // CRC: [totalLen - 3] e [totalLen - 4]
  // Serial: [totalLen - 5] e [totalLen - 6]
  const totalLen = length + 5;
  const serialHi = packet[totalLen - 6]!;
  const serialLo = packet[totalLen - 5]!;

  const respond = () => socket.write(buildResponse(protocol, serialHi, serialLo));

  logger.info(
    {
      remoteAddr,
      protocol: `0x${protocol.toString(16).padStart(2, "0")}`,
      length,
      hex: packet.toString("hex"),
    },
    "GT06: pacote recebido"
  );

  switch (protocol) {

    // ── Login ───────────────────────────────────────────────────────
    case PROTOCOL_LOGIN: {
      const imei = parseImeiFromBcd(packet, 4);
      state.imei = imei;
      logger.info({ remoteAddr, imei }, "GT06: LOGIN recebido — respondendo");
      respond();
      break;
    }

    // ── Localização GPS ─────────────────────────────────────────────
    case PROTOCOL_GPS: {
      // Conteúdo a partir do offset 4:
      // [0..5]  YYMMDDHHMMSS
      // [6]     GPS info byte (upper 4 = satélites, lower 4 = tamanho dados GPS)
      // [7..10] latitude  uint32 BE  (graus * 1.800.000)
      // [11..14] longitude uint32 BE (graus * 1.800.000)
      // [15]    velocidade (knots)
      // [16..17] course + status bits
      const year    = 2000 + packet[4]!;
      const month   = packet[5]!;
      const day     = packet[6]!;
      const hour    = packet[7]!;
      const minute  = packet[8]!;
      const second  = packet[9]!;

      const latRaw       = packet.readUInt32BE(11);
      const lonRaw       = packet.readUInt32BE(15);
      const speedKnots   = packet[19]!;
      const courseStatus = packet.readUInt16BE(20);

      // Bit 10: lat Sul (1=S), bit 11: lon Oeste (1=W), bit 13: GPS fixado
      const latSouth = (courseStatus >> 10) & 1;
      const lonWest  = (courseStatus >> 11) & 1;
      const gpsFixed = (courseStatus >> 13) & 1;

      respond();

      if (!gpsFixed) {
        logger.warn({ remoteAddr, imei: state.imei }, "GT06: GPS sem fix — localização não salva");
        break;
      }

      const latitude   = (latSouth ? -1 : 1) * (latRaw  / 1_800_000);
      const longitude  = (lonWest  ? -1 : 1) * (lonRaw  / 1_800_000);
      const velocidade = Math.round(speedKnots * 1.852 * 10) / 10; // knots → km/h
      const data_gps   = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

      logger.info(
        { remoteAddr, imei: state.imei, latitude, longitude, velocidade, data_gps },
        "GT06: localização GPS válida"
      );

      if (!state.imei) {
        logger.warn({ remoteAddr }, "GT06: IMEI ainda não recebido — localização descartada");
        break;
      }

      saveLocalizacao({
        imei:      state.imei,
        latitude,
        longitude,
        velocidade,
        data_gps,
        raw_data:  packet.toString("hex"),
      }).catch((err) => logger.error({ err, imei: state.imei }, "GT06: erro ao salvar localização"));

      break;
    }

    // ── Heartbeat ───────────────────────────────────────────────────
    case PROTOCOL_HEARTBEAT: {
      logger.info({ remoteAddr, imei: state.imei }, "GT06: heartbeat — respondendo");
      respond();
      break;
    }

    // ── Status / Informação (bateria, sinal GSM, alarme) ────────────
    case PROTOCOL_STATUS_INFO: {
      // Conteúdo: [voltagem][sinal GSM][status alarme][idioma]
      const voltage = packet[4] ?? 0;
      const signal  = packet[5] ?? 0;
      logger.info(
        { remoteAddr, imei: state.imei, voltage, signal },
        "GT06: status do dispositivo — respondendo"
      );
      respond();
      break;
    }

    // ── GPS+LBS combinado (variantes 0x10 e 0x11) ───────────────────
    case PROTOCOL_GPS_LBS_1:
    case PROTOCOL_GPS_LBS_2: {
      logger.info(
        { remoteAddr, imei: state.imei, protocol: `0x${protocol.toString(16).padStart(2, "0")}` },
        "GT06: GPS+LBS — respondendo"
      );
      respond();
      break;
    }

    // ── Alarme ───────────────────────────────────────────────────────
    case PROTOCOL_ALARM: {
      logger.warn({ remoteAddr, imei: state.imei }, "GT06: alarme recebido — respondendo");
      respond();
      break;
    }

    // ── GPS variante 0x26 ────────────────────────────────────────────
    case PROTOCOL_GPS_2: {
      // Mesmo layout do 0x22
      const year    = 2000 + packet[4]!;
      const month   = packet[5]!;
      const day     = packet[6]!;
      const hour    = packet[7]!;
      const minute  = packet[8]!;
      const second  = packet[9]!;
      const latRaw       = packet.readUInt32BE(11);
      const lonRaw       = packet.readUInt32BE(15);
      const speedKnots   = packet[19]!;
      const courseStatus = packet.readUInt16BE(20);
      const latSouth = (courseStatus >> 10) & 1;
      const lonWest  = (courseStatus >> 11) & 1;
      const gpsFixed = (courseStatus >> 13) & 1;

      respond();

      if (!gpsFixed) {
        logger.warn({ remoteAddr, imei: state.imei }, "GT06 (0x26): GPS sem fix — localização não salva");
        break;
      }

      const latitude   = (latSouth ? -1 : 1) * (latRaw  / 1_800_000);
      const longitude  = (lonWest  ? -1 : 1) * (lonRaw  / 1_800_000);
      const velocidade = Math.round(speedKnots * 1.852 * 10) / 10;
      const data_gps   = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

      logger.info(
        { remoteAddr, imei: state.imei, latitude, longitude, velocidade },
        "GT06 (0x26): localização GPS válida"
      );

      if (state.imei) {
        saveLocalizacao({
          imei: state.imei, latitude, longitude, velocidade, data_gps,
          raw_data: packet.toString("hex"),
        }).catch((err) => logger.error({ err, imei: state.imei }, "GT06 (0x26): erro ao salvar"));
      }
      break;
    }

    // ── Protocolo desconhecido ──────────────────────────────────────
    default: {
      logger.warn(
        { remoteAddr, protocol: `0x${protocol.toString(16).padStart(2, "0")}` },
        "GT06: protocolo não mapeado — respondendo para manter conexão"
      );
      respond();
    }
  }
}
