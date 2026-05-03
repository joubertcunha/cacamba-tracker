import net from "node:net";
import { logger } from "../lib/logger";
import { parseGpsMessage } from "./parser";
import { saveLocalizacao } from "./supabase";
import { createGT06State, handleGT06Data } from "./gt06";

// TK303G: pacote de login texto
const LOGIN_REGEX = /^##,imei:(\d+),A;?$/;

type Protocol = "unknown" | "gt06" | "tk303g";

export function startTcpServer(port: number): net.Server {
  const server = net.createServer();

  server.on("connection", (socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info({ remoteAddr }, "TCP: nova conexão aberta");

    let protocol: Protocol = "unknown";

    // ── Estado GT06 (J14 e similares) ────────────────────────────────
    const gt06State = createGT06State();

    // ── Estado TK303G (texto) ─────────────────────────────────────────
    let textBuffer = "";

    socket.setTimeout(120000);

    socket.on("data", async (chunk: Buffer) => {
      // Log compacto — substitui bytes não-imprimíveis por '?' para legibilidade
      const preview = chunk.slice(0, 60).toString("utf8").replace(/[^\x20-\x7e]/g, "?");
      logger.info({ remoteAddr, bytes: chunk.length, raw: preview }, "TCP: pacote recebido (raw)");

      // Auto-detecção de protocolo no primeiro pacote
      if (protocol === "unknown") {
        protocol = chunk[0] === 0x78 ? "gt06" : "tk303g";
        logger.info({ remoteAddr, protocol }, "TCP: protocolo detectado");
      }

      // ── GT06 binário (J14 e similares) ───────────────────────────────
      if (protocol === "gt06") {
        handleGT06Data(socket, remoteAddr, chunk, gt06State);
        return;
      }

      // ── TK303G texto — lógica original inalterada ─────────────────────
      textBuffer += chunk.toString("utf8");

      // Separa por \n ou ; (alguns firmwares não enviam \n após o login)
      const lines = textBuffer.split(/[\n;]/).map((l) => l.trim()).filter(Boolean);
      const lastChar = textBuffer[textBuffer.length - 1];
      textBuffer = lastChar === "\n" || lastChar === ";" ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        logger.info({ remoteAddr, packet: line }, "TCP: processando pacote");

        // Pacote de login TK303G
        const loginMatch = line.match(LOGIN_REGEX);
        if (loginMatch) {
          const imei = loginMatch[1];
          logger.info({ remoteAddr, imei }, "TCP: pacote de LOGIN recebido — respondendo LOAD");
          socket.write("LOAD");
          continue;
        }

        // Pacote de localização TK303G
        const parsed = parseGpsMessage(line);
        if (!parsed) {
          logger.warn({ remoteAddr, packet: line }, "TCP: formato não reconhecido — ignorado");
          continue;
        }

        logger.info(
          {
            remoteAddr,
            imei: parsed.imei,
            lat: parsed.latitude,
            lon: parsed.longitude,
            vel: parsed.velocidade,
            data_gps: parsed.data_gps,
          },
          "TCP: pacote GPS válido — respondendo ON"
        );

        socket.write("ON");

        try {
          await saveLocalizacao(parsed);
        } catch (err) {
          logger.error({ err, imei: parsed.imei }, "TCP: erro ao salvar no banco");
        }
      }
    });

    socket.on("timeout", () => {
      logger.warn({ remoteAddr }, "TCP: conexão encerrada por timeout (120s sem dados)");
      socket.destroy();
    });

    socket.on("error", (err) => {
      logger.error({ err, remoteAddr }, "TCP: erro na conexão");
    });

    socket.on("close", (hadError) => {
      logger.info({ remoteAddr, hadError }, "TCP: conexão fechada");
    });
  });

  server.on("error", (err) => {
    logger.error({ err }, "TCP: erro no servidor");
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Servidor TCP escutando");
  });

  return server;
}
