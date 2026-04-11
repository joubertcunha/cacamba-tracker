import net from "node:net";
import { logger } from "../lib/logger";
import { parseGpsMessage } from "./parser";
import { saveLocalizacao } from "./supabase";

export function startTcpServer(port: number): net.Server {
  const server = net.createServer();

  server.on("connection", (socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info({ remoteAddr }, "TCP: nova conexão aberta");

    let buffer = "";

    socket.setTimeout(60000);

    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        logger.info({ remoteAddr, raw: trimmed }, "TCP: dados recebidos");

        const parsed = parseGpsMessage(trimmed);

        if (!parsed) {
          logger.warn({ remoteAddr, raw: trimmed }, "TCP: mensagem inválida ignorada");
          continue;
        }

        try {
          await saveLocalizacao(parsed);
        } catch (err) {
          logger.error({ err, imei: parsed.imei }, "TCP: erro ao salvar no banco");
        }
      }
    });

    socket.on("timeout", () => {
      logger.warn({ remoteAddr }, "TCP: conexão encerrada por timeout");
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
