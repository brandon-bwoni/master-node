import Redis from "ioredis";
import crypto from "crypto";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on("error", (err) => console.error("Redis error:", err));

const SESSION_PREFIX = "sess:";
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export function generateSessionId() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(data) {
  const sid = generateSessionId();
  const payload = JSON.stringify({ ...data, createdAt: Date.now() });

  await redis.set(`${SESSION_PREFIX}${sid}`, payload, "EX", SESSION_TTL);
  return sid;
}

export async function getSession(sid) {
  if (!sid) return null;

  const raw = await redis.get(`${SESSION_PREFIX}${sid}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await deleteSession(sid);
    return null;
  }
}

export async function touchSession(sid) {
  await redis.expire(`${SESSION_PREFIX}${sid}`, SESSION_TTL);
}

export async function deleteSession(sid) {
  await redis.del(`${SESSION_PREFIX}${sid}`);
}

export async function deleteAllUserSessions(userId) {
  const indexKey = `user-sessions:${userId}`;
  const sids = await redis.smembers(indexKey);

  if (sids.length === 0) return;

  const pipeline = redis.pipeline();
  for (const sid of sids) pipeline.del(`${SESSION_PREFIX}${sid}`);
  pipeline.del(indexKey);
  await pipeline.exec();
}

export async function indexUserSession(userId, sid) {
  const indexKey = `user-sessions:${userId}`;
  await redis.sadd(indexKey, sid);
  await redis.expire(indexKey, SESSION_TTL);
}

export { redis };
