import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { startTcpServer } from "./tcp/server";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const rawTcpPort = process.env["TCP_PORT"] ?? "5000";
const tcpPort = Number(rawTcpPort);

if (!Number.isNaN(tcpPort) && tcpPort > 0) {
  startTcpServer(tcpPort);
} else {
  logger.warn({ rawTcpPort }, "TCP_PORT inválido, servidor TCP não iniciado");
}
