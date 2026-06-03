import type { WebSocket } from "ws";
import type {User} from "../types/user.js"
import { logger } from "../utils/logger.js";

// Types
export interface ConnectionRecord {
  id:            string;
  socket:        WebSocket;
  user:          User;
  rooms:         Set<string>;  

  // Backpressure
  sendQueue:     string[];     
  draining:      boolean;
  slowCount:     number;

  // Heartbeat
  isAlive:       boolean;

  connectedAt:   number;       
  remoteAddress: string;
}

 
export type ConnectionMeta = Omit<ConnectionRecord, "socket" | "sendQueue">

const byId   = new Map<string, ConnectionRecord>();
const byRoom = new Map<string, Set<string>>();

// The Connection Lifecycle
export function registerConnection(
    id: string,
    socket: WebSocket,
    user: User,
    remoteAddress: string
): ConnectionRecord {
    if (byId.has(id)) {
    logger.warn({ connId: id, userId: user.id }, "Duplicate connId on register — overwriting");
  }

  const record: ConnectionRecord = {
    id,
    socket,
    user,
    rooms:         new Set(),
    sendQueue:     [],
    draining:      false,
    slowCount:     0,
    isAlive:       true,
    connectedAt:   Date.now(),
    remoteAddress,
  };

  byId.set(id, record);
  logger.debug({ connId: id, userId: user.id }, "Connection registered");

  return record;
}

export function unregisterConnection(id: string): ConnectionRecord | undefined {
    const record = byId.get(id)

    if (!record) {
    logger.warn({ connId: id }, "Attempted to unregister unknown connection");
    return undefined;
  }

  byId.delete(id);

  // Clean up all room index entries for this connection
  for (const roomId of record.rooms) {
    removeFromRoomIndex(id, roomId);
  }

  logger.debug(
    { connId: id, userId: record.user.id, durationMs: Date.now() - record.connectedAt },
    "Connection unregistered",
  );

  return record;
}


/**
 * ROOM MEMBERSHIP
 */


// JOIN A ROOM
export function joinRoom(connId: string, roomId: string): boolean {
  const record = byId.get(connId);
  if (!record) {
    logger.warn({ connId, roomId }, "joinRoom called for unknown connection");
    return false;
  }

  if (record.rooms.has(roomId)) return false; // already subscribed 

  record.rooms.add(roomId);

  if (!byRoom.has(roomId)) byRoom.set(roomId, new Set());
  byRoom.get(roomId)!.add(connId);

  logger.debug({ connId, roomId, userId: record.user.id }, "Joined room");
  return true;
}

// LEAVE A ROOM
export function leaveRoom(connId: string, roomId: string): boolean {
  const record = byId.get(connId);
  if (!record) {
    logger.warn({ connId, roomId }, "leaveRoom called for unknown connection");
    return false;
  }

  if (!record.rooms.has(roomId)) return false; // not subscribed 

  record.rooms.delete(roomId);
  removeFromRoomIndex(connId, roomId);

  logger.debug({ connId, roomId, userId: record.user.id }, "Left room");
  return true;
}

// REMOVE A ROOM FROM INDEX
function removeFromRoomIndex(connId: string, roomId: string): void {
  const room = byRoom.get(roomId);
  if (!room) return;
  room.delete(connId);
  // Prune empty room sets 
  if (room.size === 0) byRoom.delete(roomId);
}


/**
 * LOOKUPS
 */
export function getConnection(id: string): ConnectionRecord | undefined {
  return byId.get(id);
}

export function getSocket(id: string): WebSocket | undefined {
  return byId.get(id)?.socket;
}

export function getMeta(id: string): ConnectionMeta | undefined {
  const record = byId.get(id);
  if (!record) return undefined;

  // Omit socket and sendQueue — safe to log or pass to other layers
  const { socket: _s, sendQueue: _q, ...meta } = record;
  return meta;
}



/**
 * ITORATORS
 */

// Iterate connections in specific rooms
export function* connectionsInRoom(roomId: string): Generator<ConnectionRecord> {
  const ids = byRoom.get(roomId);
  if (!ids) return;
  for (const id of ids) {
    const record = byId.get(id);
    if (record) yield record;
  }
}

// Iterate all connections
export function* allConnections(): Generator<ConnectionRecord> {
  for (const record of byId.values()) yield record;
}

/**
 * METRICS
 */
export function getStats() {
  return {
    totalConnections: byId.size,
    totalRooms:       byRoom.size,
    roomSizes:        Object.fromEntries(
      [...byRoom.entries()].map(([roomId, ids]) => [roomId, ids.size])
    ),
  };
}
