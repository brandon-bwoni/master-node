

export const REDIS_KEYS = {
    // Pub/Sub channel for a room
  channel:  (roomId: string) => `channel:room:${roomId}`,

  // Redis Stream for ordered, persistent messages
  stream:   (roomId: string) => `stream:room:${roomId}`,

  // Presence hash for a single user 
  presence: (userId: string) => `user:presence:${userId}`,

  // Presence member set for a room 
  roomMembers: (roomId: string) => `room:presence:${roomId}`,

  // Per-room Lamport sequence counter (fallback if not using Streams)
  msgSeq: (roomId: string) => `seq:room:${roomId}`
} as const


/**
 * WEBSOCKET CLOSE CODES
 * RFC 6455 standard codes (1xxx) and application-defined codes (4xxx).
 * 4xxx range is unregistered and safe for custom use.
 */

export const WS_CLOSE = {
  NORMAL:        1000,  // clean disconnect
  GOING_AWAY:    1001,  // server shutdown or worker restart
  POLICY:        1008,  // slow consumer exceeded SLOW_CONSUMER_LIMIT
  UNAUTHORIZED:  4001,  // JWT missing, expired, or invalid
  INVALID_MSG:   4002,  // unparseable JSON or failed shape guard
  RATE_LIMITED:  4003,  // too many messages in window
  DUPLICATE:     4004,  // connId already registered (should never happen)
} as const;

/**
 * PRESENCE
 * TTL must be slightly longer than HEARTBEAT_INTERVAL_MS / 1000 to avoid
 * presence expiring between heartbeat ticks under normal load.
 * Rule: PRESENCE_TTL_SEC > (HEARTBEAT_INTERVAL_MS / 1000) + network_jitter_buffer
 */
export const PRESENCE_TTL_SEC = 35; // heartbeat every 30s + 5s jitter buffer

/**
 * BACKPRESSURE
 */
export const BACKPRESSURE = {
  // Max messages held in per-connection send queue before dropping
  MAX_QUEUE_SIZE:    512,

  // TCP send buffer threshold — if bufferedAmount exceeds this, start queuing
  HIGH_WATER_BYTES:  65_536,   // 64 KB

  // How many times a connection can hit MAX_QUEUE_SIZE before being closed
  SLOW_CONSUMER_LIMIT: 10,

  // How long to wait between drain attempts when buffer is full
  DRAIN_INTERVAL_MS: 50,
} as const;

/**
 * HEARTBEAT
 */
export const HEARTBEAT = {
  INTERVAL_MS: 30_000,  
  TIMEOUT_MS:  10_000,  
} as const;

/**
 * STREAMS
 */
export const STREAMS = {
  // Max messages retained per room stream
  MAX_LEN: 10_000,

  // Default number of messages returned per replay/catch-up request
  REPLAY_DEFAULT_LIMIT: 200,

  // Maximum replay limit a client can request
  REPLAY_MAX_LIMIT: 1_000,
} as const;

/**
 * RATE LIMITING
 */
export const RATE_LIMIT = {
  MAX_MESSAGES_PER_WINDOW: 60,
  WINDOW_MS:               60_000,  
} as const;