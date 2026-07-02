import type {
  Room,
  DisplayMessage,
  ConnectionStatus,
  RoomMember,
} from "../types/index";

// State
interface ChatState {
  rooms: Room[];
  messages: Record<string, DisplayMessage[]>;
  activeRoomId: string | null;
  connectionStatus: ConnectionStatus;
  typingUsers: Record<string, string[]>;
}

export const initial: ChatState = {
  rooms: [],
  messages: {},
  activeRoomId: null,
  connectionStatus: "disconnected",
  typingUsers: {},
};

export const DEFAULT_ROOMS: Room[] = [
  { id: "general", name: "# general", members: [], unread: 0 },
  { id: "random", name: "# random", members: [], unread: 0 },
  { id: "dev", name: "# dev", members: [], unread: 0 },
];

// Actions
export type Action =
  | { type: "SET_STATUS"; status: ConnectionStatus }
  | { type: "SET_ACTIVE_ROOM"; roomId: string }
  | { type: "ADD_MESSAGE"; message: DisplayMessage }
  | {
      type: "ACK_MESSAGE";
      tempId: string;
      streamId: string;
      roomId: string;
    }
  | { type: "FAIL_MESSAGE"; tempId: string; roomId: string }
  | { type: "REPLAY_CHUNK"; roomId: string; messages: DisplayMessage[] }
  | { type: "PRESENCE_JOIN"; roomId: string; member: RoomMember }
  | { type: "PRESENCE_LEAVE"; roomId: string; userId: string }
  | { type: "INIT_ROOMS"; rooms: Room[] }
  | { type: "MARK_READ"; roomId: string };

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, connectionStatus: action.status };

    case "SET_ACTIVE_ROOM":
      return { ...state, activeRoomId: action.roomId };

    case "INIT_ROOMS": {
      const messages: Record<string, DisplayMessage[]> = {};
      for (const r of action.rooms) messages[r.id] = [];
      return { ...state, rooms: action.rooms, messages };
    }

    case "ADD_MESSAGE": {
      const existing = state.messages[action.message.roomId] ?? [];
      // Duplicate by stream
      if (
        action.message.id &&
        existing.some((m) => m.id === action.message.id)
      ) {
        return state;
      }

      const rooms = state.rooms.map((r) =>
        r.id === action.message.roomId && r.id !== state.activeRoomId
          ? { ...r, unread: r.unread + 1 }
          : r,
      );

      return {
        ...state,
        rooms,
        messages: {
          ...state.messages,
          [action.message.roomId]: [...existing, action.message],
        },
      };
    }

    case "ACK_MESSAGE": {
      const msgs = (state.messages[action.roomId] ?? []).map((m) =>
        m.id === action.tempId
          ? { ...m, id: action.streamId, pending: false }
          : m,
      );
      return {
        ...state,
        messages: { ...state.messages, [action.roomId]: msgs },
      };
    }

    case "FAIL_MESSAGE": {
      const msgs = (state.messages[action.roomId] ?? []).map((m) =>
        m.id === action.tempId ? { ...m, pending: false, failed: true } : m,
      );
      return {
        ...state,
        messages: { ...state.messages, [action.roomId]: msgs },
      };
    }

    case "REPLAY_CHUNK": {
      const existing = state.messages[action.roomId] ?? [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = action.messages.filter((m) => !existingIds.has(m.id));
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.roomId]: [...newMsgs, ...existing],
        },
      };
    }

    case "PRESENCE_JOIN": {
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId &&
        !r.members.some((m) => m.userId === action.member.userId)
          ? { ...r, memberss: [...r.members, action.member] }
          : r,
      );
      return { ...state, rooms };
    }

    case "PRESENCE_LEAVE": {
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId
          ? {
              ...r,
              members: r.members.filter((m) => m.userId !== action.userId),
            }
          : r,
      );
      return { ...state, rooms };
    }

    case "MARK_READ": {
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId ? { ...r, unread: 0 } : r,
      );
      return { ...state, rooms };
    }

    default:
      return state;
  }
}
