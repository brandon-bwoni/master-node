import { pub } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import {
  makePresence,
  type User,
  type UserPresence,
  type PresenceStatus,
} from "../types/user.js";
import { REDIS_KEYS, PRESENCE_TTL_SEC } from "../utils/constants.js"

// KEYS
const KEYS = {
  // Hash storing full UserPresence record  
  userPresence: (userId: string) => `user:presence:${userId}`,

  // Set of userIds currently in a room     
  roomMembers: (roomId: string) => `room:presence:${roomId}`,
} as const;


/**
 * WRITE OPERATIONS
 */


export async function setOnline(user: User, roomId: string): Promise<void> {
  const presence = makePresence(user, roomId, "online");
  await writePresence(presence)
  logger.debug({userId: user.id, roomId}, "User marked online")
}


export async function setAway(userId: string, roomId: string): Promise<void>{
  const existing = await getPresence(userId)
  if(!existing) return

  const updated: UserPresence = {
    ...existing,
    status: "away",
    lastSeen: Date.now()}
    await writePresence(updated)
    logger.debug({userId, roomId}, "User marked away")
}


export async function setOffline(userId: string, roomId: string): Promise<void>{
   await Promise.all([
    pub.del(KEYS.userPresence(userId)),
    pub.sRem(KEYS.roomMembers(roomId), userId),
   ])
   logger.debug({userId, roomId}, "User marked offline")
}

// Refresh TTL on both keys
export async function refreshPresence(userId: string, roomId: string): Promise<void> {
  await Promise.all([
    pub.expire(KEYS.userPresence(userId), PRESENCE_TTL_SEC),
    pub.expire(KEYS.roomMembers(roomId),  PRESENCE_TTL_SEC),
  ]);
}


/**
 * READ OPERATIONS
 */
export async function getPresence(userId: string): Promise<UserPresence | null> {
  const raw = await pub.hGetAll(KEYS.userPresence(userId));

  if (!raw || Object.keys(raw).length === 0) return null;

  return deserialisePresence(raw);
}

export async function getStatus(userId: string): Promise<PresenceStatus | null> {
  const presence = await getPresence(userId);
  return presence?.status ?? null;
}

// Get all online members in a room with their full presence records.
export async function getRoomPresence(roomId: string): Promise<UserPresence[]> {
  const userIds = await pub.sMembers(KEYS.roomMembers(roomId));
  if (userIds.length === 0) return [];

  const pipeline = pub.multi();
  for (const userId of userIds) {
    pipeline.hGetAll(KEYS.userPresence(userId));
  }

  const results = (await pipeline.exec()) as unknown as Record<string, string>[];

  return results
    .map((raw) => (raw && Object.keys(raw).length > 0 ? deserialisePresence(raw) : null))
    .filter((p): p is UserPresence => p !== null);
}


// Get room member IDs
export async function getRoomMemberIds(roomId: string): Promise<string[]> {
  return pub.sMembers(KEYS.roomMembers(roomId));
}

// Get online status of a user
export async function isOnline(userId: string): Promise<boolean> {
  const status = await getStatus(userId);
  return status === "online" || status === "away";
}



/**
 * INTERNAL HELPERS
 */

/**
 * Write a UserPresence record to Redis.
 *  Stores as a hash (hSet) rather than a JSON string (set) so individual
 * fields can be read without deserialising the whole object
 */
async function writePresence(presence: UserPresence): Promise<void> {
  const key = KEYS.userPresence(presence.userId);

  await Promise.all([
    pub.hSet(key, serialisePresence(presence)),
    pub.expire(key, PRESENCE_TTL_SEC),
    pub.sAdd(KEYS.roomMembers(presence.roomId), presence.userId),
    pub.expire(KEYS.roomMembers(presence.roomId), PRESENCE_TTL_SEC),
  ]);
}

function serialisePresence(p: UserPresence): Record<string, string> {
  return {
    userId:   p.userId,
    username: p.username,
    status:   p.status,
    roomId:   p.roomId,
    lastSeen: p.lastSeen.toString(),
  };
}

function deserialisePresence(raw: Record<string, string>): UserPresence {
  return {
    userId:   raw["userId"]   ?? "",
    username: raw["username"] ?? "",
    status:  (raw["status"]  ?? "offline") as PresenceStatus,
    roomId:   raw["roomId"]  ?? "",
    lastSeen: parseInt(raw["lastSeen"] ?? "0", 10),
  };
}