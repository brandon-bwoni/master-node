import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";
import { logger } from "../../shared/logger.js";

let _publisher: RedisClientType | null = null;
let _subscriber: RedisClientType | null = null;

function build(name: string): RedisClientType {
  const client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy(retries) {
        if (retries > 10) {
          logger.fatal({ name }, "Redis reconnect exhausted — exiting process");
          process.exit(1);
        }
        // Capped exponential backoff — 200ms, 400ms, 800ms ... 5000ms
        const delay = Math.min(retries * 200, 5_000);
        logger.warn({ name, retries, delay }, "Redis reconnecting");
        return delay;
      },
    },
  }) as RedisClientType;

  client.on("error", (err: Error) =>
    logger.error({ name, err: err.message }, "Redis client error"),
  );
  client.on("connect", () => logger.info({ name }, "Redis connected"));
  client.on("reconnecting", () => logger.warn({ name }, "Redis reconnecting"));
  client.on("ready", () => logger.info({ name }, "Redis ready"));
  client.on("end", () => logger.info({ name }, "Redis connection closed"));

  return client;
}

export async function getPublisher(): Promise<RedisClientType> {
  if (!_publisher) {
    _publisher = build("publisher");
    await _publisher.connect();
    logger.info("Publisher client ready");
  }
  return _publisher;
}

export async function getSubscriber(): Promise<RedisClientType> {
  if (!_subscriber) {
    _subscriber = build("subscriber");
    await _subscriber.connect();
    logger.info("Subscriber client ready");
  }
  return _subscriber;
}

export async function closeRedisClients(): Promise<void> {
  await Promise.allSettled([_publisher?.quit(), _subscriber?.quit()]);

  _publisher = null;
  _subscriber = null;

  logger.info("Redis clients closed");
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pub = await getPublisher();
    await pub.ping();
    return true;
  } catch {
    return false;
  }
}
