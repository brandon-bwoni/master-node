import { randomUUID } from "crypto";
import type { FastifyRequest } from "fastify";
import { WebSocket } from "ws";
import { handleMessage } from "./handler.js";
import { attachPongHandler } from "./heartbeat.js";
import { authenticateWsUpgrade, AuthError } from "../middleware/auth.js";
import { userFromJwt } from "../types/user.js";
import {
  registerConnection,
  unregisterConnection,
  leaveRoom,
} from "../registry/connection.registry.js";
import { leaveChannel } from "../registry/channel.registry.js";
import { setOffline } from "../presence/presence.service.js";
import { logger } from "../utils/logger.js";
import { WS_CLOSE } from "../utils/constants.js";

export function handleConnection(socket: WebSocket, req: FastifyRequest) {
  (socket as any).isAlive = true;

  // Authenticate user
  const jwtPayload = authenticateWsUpgrade(req);
  if (!jwtPayload) {
    socket.close(WS_CLOSE.UNAUTHORIZED, "unauthorized");
    return;
  }

  const user = userFromJwt(jwtPayload);

  // Register connection
  const connectionId = randomUUID();
  const remoteAddress = req.socket.remoteAddress ?? "unknown";

  const conn = registerConnection(connectionId, socket, user, remoteAddress);

  logger.info(
    { connectionId, userId: user.id, remoteAddress },
    "WebSocket connection opened",
  );

  // Heartbeat
  attachPongHandler(socket, conn);

  // Inbound messages
  socket.on("message", (data) => {
    handleMessage(connectionId, data.toString());
  });

  // Errors
  socket.on("error", (err) => {
    logger.error(
      { connectionId, userId: user.id, err: err.message },
      "WebSocket error",
    );
    socket.close(WS_CLOSE.GOING_AWAY, "socket error");
  });

  // Cleanup and close
  socket.on("close", async (code, reason) => {
    logger.info(
      {
        connectionId,
        userId: user.id,
        code,
        reason: reason.toString(),
        durationMs: Date.now() - conn.connectedAt,
      },
      "WebSocket connection closed",
    );

    // Leave all rooms — must happen before unregisterConnection clears
    for (const roomId of conn.rooms) {
      leaveRoom(connectionId, roomId);
      await leaveChannel(connectionId, roomId);
      await setOffline(user.id, roomId);
    }

    // Remove connection from primary index last
    unregisterConnection(connectionId);
  });
}
