import { WebSocket, WebSocketServer } from "ws";
import type { ConnectionRecord } from "../registry/connection.registry.js";
import {
  allConnections,
  unregisterConnection,
  leaveRoom,
} from "../registry/connection.registry.js";
import { leaveChannel } from "../registry/channel.registry.js";
import { setOffline } from "../presence/presence.service.js";
import { refreshPresence } from "../presence/presence.service.js";
import { logger } from "../utils/logger.js";
import { HEARTBEAT, WS_CLOSE } from "../utils/constants.js";

declare module "ws" {
  interface WebSocket {
    isAlive?: boolean;
  }
}

export function attachPongHandler(
  socket: WebSocket,
  conn: ConnectionRecord,
): void {
  conn.isAlive = true;

  socket.on("pong", () => {
    conn.isAlive = true;
  });

  for (const roomId of conn.rooms) {
    refreshPresence(conn.user.id, roomId).catch((err: Error) => {
      logger.warn(
        { connId: conn.id, userId: conn.user.id, err: err.message },
        "Failed to refresh presence on pong",
      );
    });
  }

  logger.debug(
    { connId: conn.id, userId: conn.user.id },
    "Pong received — connection alive",
  );
}

/**
 * HEARTBEAT SWEET
 * Start the server-level heartbeat interval.
 */
export function startHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  logger.info(
    { intervalMs: HEARTBEAT.INTERVAL_MS, timeoutMs: HEARTBEAT.TIMEOUT_MS },
    "Heartbeat started",
  );

  return setInterval(() => {
    let alive = 0;
    let terminated = 0;

    for (const conn of allConnections()) {
      if (!conn.isAlive) {
        logger.warn(
          {
            connId: conn.id,
            userId: conn.user.id,
            remoteAddress: conn.remoteAddress,
          },
          "Heartbeat failed — terminating dead connection",
        );

        terminateConnection(conn);
        terminated++;
        continue;
      }

      conn.isAlive = false;
      conn.socket.ping();
      alive++;
    }

    if (terminated > 0 || alive > 0) {
      logger.info({ alive, terminated }, "Heartbeat sweep complete");
    }
  }, HEARTBEAT.INTERVAL_MS);
}

/**
 * INTERNAL HELPERS
 */
function terminateConnection(conn: ConnectionRecord): void {
  conn.socket.terminate();

  (async () => {
    try {
      for (const roomId of conn.rooms) {
        leaveRoom(conn.id, roomId);
        await leaveChannel(conn.id, roomId);
        await setOffline(conn.user.id, roomId);
      }
      unregisterConnection(conn.id);
    } catch (err) {
      logger.error(
        { connId: conn.id, userId: conn.user.id, err: (err as Error).message },
        "Error during dead connection cleanup",
      );
    }
  })();
}
