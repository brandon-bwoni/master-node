import Fastify from "fastify";
import { registerWSRoutes } from "./ws/router.js";
import { setupGracefulShutdown } from "./ws/lifecycle.js";
import { startHeartbeat } from "./ws/heartbeat.js";
import { startSubscriber } from "./pubsub/subscriber.js";
import { initChannelRegistry } from "./registry/channel.registry.js";
import { getSubscriber, getPublisher, pingRedis } from "./config/redis.js";
import { logger } from "../shared/logger.js";
import { env } from "./config/env.js";

export async function startServer(): Promise<void> {
  const app = Fastify({
    logger: true,
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  logger.info("Connecting to Redis...");
  const [pub, sub] = await Promise.all([getPublisher(), getSubscriber()]);

  // Verify Redis is reachable before proceeding
  const redisAlive = await pingRedis();
  if (!redisAlive) {
    logger.fatal("Redis ping failed — aborting startup");
    process.exit(1);
  }
  logger.info("Redis connection verified");

  initChannelRegistry(sub);
  logger.info("Channel registry initialised");

  await startSubscriber();
  logger.info("Redis subscriber started");

  await registerWSRoutes(app);

  app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  logger.info(
    { port: env.PORT, host: env.HOST, pid: process.pid, nodeId: env.NODE_ID },
    `Worker started`,
  );

  const wss = app.websocketServer;
  const heartbeatTimer = startHeartbeat(wss);

  setupGracefulShutdown(app, heartbeatTimer);

  logger.info("Server bootstrap complete — ready to accept connections");
}
