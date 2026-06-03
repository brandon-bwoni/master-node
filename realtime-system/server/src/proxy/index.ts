import { startHealthChecks } from "./upstream.js";
import { createServer } from "./proxy.js";
import { logger } from "../shared/logger.js";

const PORT = parseInt(process.env["PROXY_PORT"] ?? "3000", 10);

const server = createServer();

server.listen(PORT, () => {
  logger.info({ port: PORT, pid: process.pid }, "Proxy server started");
});

startHealthChecks();

process.on("SIGTERM", () => {
  logger.info("Proxy shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});

process.on("SIGINT", () => {
  logger.info("Proxy shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
