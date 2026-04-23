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

    socket.setTimeout(120000);

    socket.on("data", async (chunk) => {
      const raw = chunk.toString("utf8");
      buffer += raw;

      logger.info({ remoteAddr, bytes: chunk.length, raw: raw.trim() }, "TCP: pacote recebido (raw)");

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        logger.info({ remoteAddr, packet: trimmed }, "TCP: processando pacote");

        const parsed = parseGpsMessage(trimmed);

        if (!parsed) {
          logger.warn({ remoteAddr, packet: trimmed }, "TCP: formato não reconhecido — respondendo ON mesmo assim");
          socket.write("ON");
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
          "TCP: pacote GPS válido"
        );

        // Responde ao rastreador ANTES de salvar no banco para não bloquear
        socket.write("ON");

        try {
          await saveLocalizacao(parsed);
        } catch (err) {
          logger.error({ err, imei: parsed.imei }, "TCP: erro ao salvar no banco");
        }
      }

      // Se ainda tem conteúdo no buffer sem \n, loga para diagnóstico
      if (buffer.trim()) {
        logger.debug({ remoteAddr, buffer_pendente: buffer }, "TCP: buffer aguardando mais dados");
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
