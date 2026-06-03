import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebsocketHandler } from "@fastify/websocket";
import { handleConnection } from "./connection.js";
import { authPlugin } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

export async function registerWSRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authPlugin);

  await app.register(import("@fastify/websocket"));

  app.get("/health", async (_req, reply) => {
    reply.code(200).send({
      status: "ok",
      pid: process.pid,
      node: process.env["NODE_ID"] ?? "unknown",
      uptime: Math.floor(process.uptime()),
    });
  });

  const wsHandler: WebsocketHandler = (socket, req: FastifyRequest) => {
    logger.debug(
      {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        url: req.url,
      },
      "WebSocket upgrade request received",
    );

    (socket as any).isAlive = true;

    // socket.socket is the raw ws.WebSocket instance
    void handleConnection(socket, req);
  };

  app.get("/ws", { websocket: true }, wsHandler);

  logger.info("WebSocket routes registered");
}
