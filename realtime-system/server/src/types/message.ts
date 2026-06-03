export type MessageType = 
  | "chat"
  | "presence"
  | "ack"
  | "error"
  | "subscribe"
  | "unsubscribe"
  | "replay_request"
  | "replay_chunk"
  | "ping"
  | "pong";

interface BaseMessage{
    type: MessageType
    ts: number
    streamId?: string
}


/** From Client to Server */
export interface ChatMessage extends BaseMessage {
  type:   "chat";
  roomId: string;
  userId: string;
  text:   string;
}

export interface SubscribeMessage extends BaseMessage {
  type:        "subscribe";
  roomId:      string;
  lastSeenId?: string; 
}


export interface UnsubscribeMessage extends BaseMessage {
  type:   "unsubscribe";
  roomId: string;
}


export interface ReplayRequestMessage extends BaseMessage {
  type:   "replay_request";
  roomId: string;
  fromId: string;
  limit?: number;
}

export interface PingMessage extends BaseMessage {
  type: "ping";
}


/** From Server to Client*/
export interface PresenceMessage extends BaseMessage {
  type:   "presence";
  roomId: string;
  userId: string;
  event:  "join" | "leave";
}

export interface AckMessage extends BaseMessage {
  type:  "ack";
  refId: string; 
}

export interface ErrorMessage extends BaseMessage {
  type:    "error";
  code:    ErrorCode;
  message: string;
}

export interface ReplayChunkMessage extends BaseMessage {
  type:     "replay_chunk";
  roomId:   string;
  messages: ChatMessage[];
  done:     boolean; // false = more chunks incoming
}

export interface PongMessage extends BaseMessage {
  type: "pong";
}

/**
 * UNIONS
 */
export type InboundMessage =
  | ChatMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | ReplayRequestMessage
  | PingMessage;

export type OutboundMessage =
  | ChatMessage
  | PresenceMessage
  | AckMessage
  | ErrorMessage
  | ReplayChunkMessage
  | PongMessage;


  /**
   * ERROR CODES
   */
  export type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_SHAPE"
  | "UNAUTHORIZED"
  | "ROOM_NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";


/**
 * GUARDS
 */
export function isInboundMessage(raw: unknown): raw is InboundMessage {
  if (typeof raw !== "object" || raw === null) return false;

  const m = raw as Record<string, unknown>;

  if (typeof m["type"] !== "string") return false;
  if (typeof m["ts"]   !== "number") return false;

  const validTypes: MessageType[] = [
    "chat",
    "subscribe",
    "unsubscribe",
    "replay_request",
    "ping",
  ];

  return validTypes.includes(m["type"] as MessageType);
}


// JSON serializer
export function serialise(message: OutboundMessage): string {
  return JSON.stringify(message);
}

// Build an error message
export function makeError(code: ErrorCode, message: string): ErrorMessage {
  return { type: "error", code, message, ts: Date.now() };
}

// Build an ack message
export function makeAck(refId: string): AckMessage {
  return { type: "ack", refId, ts: Date.now() };
}