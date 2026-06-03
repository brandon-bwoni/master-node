import type { FastifyInstance } from "fastify";
import {
  allConnections,
  unregisterConnection,
  leaveRoom,
} from "../registry/connection.registry.js";
import { leaveChannel } from "../registry/channel.registry.js";
import { setOffline } from "../presence/presence.service.js";
import { closeRedisClients } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { WS_CLOSE } from "../utils/constants.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const CONNECTION_DRAIN_MS = 5_000;

export function setupGracefulShutdown(
  app: FastifyInstance,
  heartbeatTimer?: NodeJS.Timeout,
): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress — ignoring signal");
      return;
    }

    isShuttingDown = true;
    logger.info(
      { signal },
      "Shutdown signal received — starting graceful shutdown",
    );

    const hardKillTimer = setTimeout(() => {
      logger.fatal("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    try {
      // Step 1: Stop heartbeat
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        logger.info("Heartbeat stopped");
      }

      // step 2: Stop accepting new connections
      await app.close();
      logger.info("Fastify server closed — no longer accepting connections");

      // Step 3: Drain WebSocket connections
      await drainConnections();

      // Step 4: Close Redis clients
      await closeRedisClients();
      logger.info("Redis clients closed");

      // Step 5: Clean exit
      clearTimeout(hardKillTimer);
      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.fatal(
        { err: (err as Error).message },
        "Error during graceful shutdown — forcing exit",
      );
      clearTimeout(hardKillTimer);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Catch unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection — exiting");
    process.exit(1);
  });

  // Catch synchronous uncaught exceptions
  process.on("uncaughtException", (err) => {
    logger.fatal(
      { err: err.message, stack: err.stack },
      "Uncaught exception — exiting",
    );
    process.exit(1);
  });

  logger.info("Graceful shutdown handlers registered");
}

/**
 *
 * CONNECTION DRAINING
 */
async function drainConnections(): Promise<void> {
  const connections = [...allConnections()];

  if (connections.length === 0) {
    logger.info("No active connections to drain");
    return;
  }

  logger.info({ count: connections.length }, "Draining WebSocket connections");

  // Notify all clients simultaneously — no reason to do this sequentially
  const closePromises = connections.map(
    (conn) =>
      new Promise<void>((resolve) => {
        if (conn.socket.readyState !== conn.socket.OPEN) {
          resolve();
          return;
        }

        // Resolve when the socket emits close i.e. client acknowledged
        conn.socket.once("close", () => resolve());

        // 1001 Going Away — tells the client to reconnect to another node
        conn.socket.close(WS_CLOSE.GOING_AWAY, "server shutting down");
      }),
  );

  // Race all close events against a drain timeout
  await Promise.race([
    Promise.all(closePromises),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn(
          { timeoutMs: CONNECTION_DRAIN_MS },
          "Connection drain timed out",
        );
        resolve();
      }, CONNECTION_DRAIN_MS),
    ),
  ]);

  // Force-terminate and clean up anything still open after the deadline
  let forced = 0;
  for (const conn of allConnections()) {
    if (conn.socket.readyState !== conn.socket.CLOSED) {
      conn.socket.terminate();
      forced++;
    }

    // Clean up registry and Redis state for all connections
    for (const roomId of conn.rooms) {
      leaveRoom(conn.id, roomId);
      await leaveChannel(conn.id, roomId);
      await setOffline(conn.user.id, roomId);
    }
    unregisterConnection(conn.id);
  }

  if (forced > 0) {
    logger.warn(
      { forced },
      "Force-terminated connections that did not close in time",
    );
  }

  logger.info(
    { total: connections.length, forced },
    "Connection drain complete",
  );
}
