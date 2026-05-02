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

export interface BaseMessage {
  type: MessageType;
  ts: number;
  streamId?: string;
}

export interface ChatMessage extends BaseMessage {
  type: "chat";
  roomId: string;
  userId: string;
  text: string;
}

export interface PresenceMessage extends BaseMessage {
  type: "presence";
  roomId: string;
  userId: string;
  event: "join" | "leave";
}

export interface AckMessage extends BaseMessage {
  type: "ack";
  refId: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  code: string;
  message: string;
}

export interface ReplyChunkMessage extends BaseMessage {
  type: "replay_chunk";
  roomId: string;
  messages: ChatMessage[];
  done: boolean;
}

export interface PongMessage extends BaseMessage {
  type: "pong";
}

export type InboundServerMessage =
  | ChatMessage
  | PresenceMessage
  | AckMessage
  | ErrorMessage
  | ReplyChunkMessage
  | PongMessage;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type PresenceStatus = "online" | "away" | "offline";

export interface DisplayMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  ts: number;
  pending: boolean;
  failed: boolean;
}

export interface RoomMember {
  userId: string;
  username: string;
  status: PresenceStatus;
}

export interface AuthState {
  token: string;
  userId: string;
  username: string;
}
