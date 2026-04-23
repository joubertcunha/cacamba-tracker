import net from "node:net";
import { logger } from "../lib/logger";
import { parseGpsMessage } from "./parser";
import { saveLocalizacao } from "./supabase";

// Pacote de login: ##,imei:IMEI,A;
const LOGIN_REGEX = /^##,imei:(\d+),A;?$/;

export function startTcpServer(port: number): net.Server {
  const server = net.createServer();

  server.on("connection", (socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info({ remoteAddr }, "TCP: nova conexão aberta");

    let buffer = "";

    socket.setTimeout(120000);

    socket.on("data", async (chunk) => {
      const raw = chunk.toString("utf8");
      buffer += raw;

      logger.info({ remoteAddr, bytes: chunk.length, raw: raw.trim() }, "TCP: pacote recebido (raw)");

      // Separa por \n ou por ; (alguns firmwares não enviam \n após o login)
      const lines = buffer.split(/[\n;]/).map((l) => l.trim()).filter(Boolean);

      // Mantém no buffer apenas o que não terminou com \n ou ;
      const lastChar = buffer[buffer.length - 1];
      buffer = lastChar === "\n" || lastChar === ";" ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        logger.info({ remoteAddr, packet: line }, "TCP: processando pacote");

        // ── Pacote de login ──────────────────────────────────────────
        const loginMatch = line.match(LOGIN_REGEX);
        if (loginMatch) {
          const imei = loginMatch[1];
          logger.info({ remoteAddr, imei }, "TCP: pacote de LOGIN recebido — respondendo LOAD");
          socket.write("LOAD");
          continue;
        }

        // ── Pacote de localização ────────────────────────────────────
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

        // Responde ao rastreador antes de salvar para não bloquear
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
