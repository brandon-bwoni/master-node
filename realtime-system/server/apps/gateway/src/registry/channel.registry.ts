import type { RedisClientType } from "redis";
import type { WebSocket } from "ws";
import {
  getConnection,
  connectionsInRoom,
  type ConnectionRecord,
} from "./connection.registry.js";
import { logger } from "../utils/logger.js";
import { REDIS_KEYS } from "../utils/constants.js"

// State
const refCounts = new Map<string, number>(); 
const members   = new Map<string, Set<string>>();

let _subscriber: RedisClientType | null = null;

// Initialize channel registry
export function initChannelRegistry(subscriber: RedisClientType): void {
  _subscriber = subscriber;
  logger.info("ChannelRegistry initialised");
}

function requireSubscriber(): RedisClientType {
  if (!_subscriber) {
    throw new Error("ChannelRegistry not initialised, call initChannelRegistry first");
  }
  return _subscriber;
}

// Join channels
export async function joinChannel(connId: string, roomId: string): Promise<void> {
  const channel = REDIS_KEYS.channel(roomId);

  if (members.get(channel)?.has(connId)) {
    logger.debug({ connId, roomId }, "joinChannel called but already subscribed");
    return;
  }

  // Update member set
  if (!members.has(channel)) members.set(channel, new Set());
  members.get(channel)!.add(connId);

  // Increment ref count
  const prev = refCounts.get(channel) ?? 0;
  refCounts.set(channel, prev + 1);

  // Subscribe to Redis only on first local subscriber
  if (prev === 0) {
    await requireSubscriber().subscribe(channel, (message) => {
      fanOut(roomId, message);
    });
    logger.debug({ channel, roomId }, "Subscribed to Redis channel");
  }

  logger.debug({ connId, roomId, refs: prev + 1 }, "Connection joined channel");
}

// LEAVE A CHANNEL
export async function leaveChannel(connId: string, roomId: string): Promise<void> {
  const channel = REDIS_KEYS.channel(roomId);

  if (!members.get(channel)?.has(connId)) {
    logger.warn({ connId, roomId }, "leaveChannel called but connection not in channel");
    return;
  }

  // Remove from member set
  const channelMembers = members.get(channel)!;
  channelMembers.delete(connId);

  // Prune empty set — prevents unbounded map growth on high room churn
  if (channelMembers.size === 0) {
    members.delete(channel);
  }

  // Decrement ref count
  const prev = refCounts.get(channel) ?? 0;
  const next  = prev - 1;

  if (next <= 0) {
    // Last local subscriber left — unsubscribe from Redis
    refCounts.delete(channel);
    await requireSubscriber().unsubscribe(channel);
    logger.debug({ channel, roomId }, "Unsubscribed from Redis channel — no local subscribers remain");
  } else {
    refCounts.set(channel, next);
  }

  logger.debug({ connId, roomId, refs: next }, "Connection left channel");
}

/**
 * Remove a connection from ALL channels its belongs to.
 */
export async function leaveAllChannels(connId: string): Promise<void> {
  const conn = getConnection(connId);
  if (!conn) return;

  await Promise.all(
    [...conn.rooms].map((roomId) => leaveChannel(connId, roomId))
  );
}

/**
 * FANOUT
 * Deliver a Redis Pub/Sub message to all local connections in a room.
 */
function fanOut(roomId: string, message: string): void {
  let delivered = 0;
  let skipped   = 0;

  for (const conn of connectionsInRoom(roomId)) {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(message);
      delivered++;
    } else {
      // Socket closed but not yet unregistered
      skipped++;
    }
  }

  logger.debug({ roomId, delivered, skipped }, "Fan-out complete");
}

/**
 * LOOKUPS
 */
export function getConnectionsInChannel(roomId: string): ConnectionRecord[] {
  return [...connectionsInRoom(roomId)];
}

export function getSocketsByChannel(roomId: string): WebSocket[] {
  return [...connectionsInRoom(roomId)]
    .filter((conn) => conn.socket.readyState === conn.socket.OPEN)
    .map((conn) => conn.socket);
}

/**
 * METRICS
 */
export function getChannelStats(): Record<string, number> {
  return Object.fromEntries(refCounts.entries());
}

export function getChannelRefCount(roomId: string): number {
  return refCounts.get(REDIS_KEYS.channel(roomId)) ?? 0;
}