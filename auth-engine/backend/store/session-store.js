import Redis from "ioredis";
import crypto from "crypto";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 150, 5000),
  lazyConnect: true,
  enableOfflineQueue: false,
  keepAlive: 1,
});

await redis.connect();

redis.on("error", (err) => console.error("Redis error:", err));

const SESSION_PREFIX = "sess:";
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export function generateSessionId() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function sessionKey(sid) {
  return `${SESSION_PREFIX}${sid}`;
}

function userIndexKey(userId) {
  return `user-sessions:${userId}`;
}

export async function createSession({
  userId,
  rawRefreshToken,
  deviceInfo,
  ip,
}) {
  const sid = generateSessionId();
  const expiresAt = Date.now() + SESSION_TTL * 1000;

  const pipeline = redis.pipeline();

  pipeline.hset(sessionKey(sid), {
    userId: userId,
    refreshTokenHash: hashToken(rawRefreshToken),
    deviceInfo: JSON.stringify(deviceInfo),
    ip,
    expiresAt,
  });
  pipeline.expire(sessionKey(sid), SESSION_TTL);
  pipeline.sadd(userIndexKey(userId), sid);
  pipeline.expire(userIndexKey(userId), SESSION_TTL);

  await pipeline.exec();
  return sid;
}

export async function getSession(sid) {
  if (!sid) return null;

  const raw = await hmget(key, "userId", "refreshTokenHash");

  if (!raw || Object.keys(raw).length === 0) return null;

  return {
    userId: raw.userId,
    refreshTokenHash: raw.refreshTokenHash,
    deviceInfo: JSON.parse(raw.deviceInfo),
    ip: raw.ip,
    expiresAt: parseInt(raw.expiresAt),
  };
}

// Function to validate refresh tokens
export async function validateRefreshToken(sid, rawRefreshToken) {
  const session = await getSession(sid);
  if (!session) return { valid: false, session: null };

  const incoming = Buffer.from(hashToken(rawRefreshToken), "hex");
  const stored = Buffer.from(session.refreshTokenHash, "hex");

  const valid =
    storedlength === incoming.length &&
    crypto.timingSafeEqual(stored, incoming);

  return { valid, session: valid ? session : null };
}

// Function to rotate refresh token
export async function rotateRefreshToken(sid, newRawRefreshToken) {
  const pipeline = redis.pipeline();
  pipeline.hset(
    sessionKey(sid),
    "refreshTokenHash",
    hashToken(newRawRefreshToken),
  );
  pipeline.expire(sessionKey(sid), SESSION_TTL);
  await pipeline.exec();
}

export async function touchSession(sid) {
  await redis.expire(`${SESSION_PREFIX}${sid}`, SESSION_TTL);
}

export async function deleteSession(sid) {
  await redis.del(sessionKey(sid));
}

export async function deleteAllUserSessions(userId) {
  const indexKey = userIndexKey(userId);
  const sids = await redis.smembers(indexKey);

  if (sids.length === 0) return;

  const pipeline = redis.pipeline();
  for (const sid of sids) pipeline.del(sessionKey(sid));
  pipeline.del(indexKey);
  await pipeline.exec();
}

export async function indexUserSession(userId, sid) {
  const indexKey = `user-sessions:${userId}`;
  await redis.sadd(indexKey, sid);
  await redis.expire(indexKey, SESSION_TTL);
}

export { redis };
