import {
  useEffect,
  useReducer,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  AuthState,
  DisplayMessage,
  InboundServerMessage,
} from "../types/index";
import { useWebSocket } from "../hooks/useWebSockets";
import { generateId } from "../utils";
import { reducer, initial, DEFAULT_ROOMS } from "./chatReducer";
import { ChatContext } from "./chatContext";

export function ChatProvider({
  auth,
  children,
}: {
  auth: AuthState;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initial,
    rooms: DEFAULT_ROOMS,
    messages: Object.fromEntries(DEFAULT_ROOMS.map((r) => [r.id, []])),
  });

  // Track pending messages
  const pending = useRef<Map<string, string>>(new Map());

  const handleMessage = useCallback(
    (msg: InboundServerMessage) => {
      switch (msg.type) {
        case "chat": {
          // Message from another user:ds add directly as confirmed
          if (msg.userId !== auth.userId) {
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: msg.streamId ?? generateId(),
                roomId: msg.roomId,
                userId: msg.userId,
                username: msg.userId, // server should include username; fallback to userId
                text: msg.text,
                ts: msg.ts,
                pending: false,
                failed: false,
              },
            });
          }
          break;
        }

        case "ack": {
          // Our message was persisted: replace tempId with real streamId
          const roomId = pending.current.get(msg.refId);
          if (roomId) {
            dispatch({
              type: "ACK_MESSAGE",
              tempId: msg.refId,
              streamId: msg.refId,
              roomId,
            });
            pending.current.delete(msg.refId);
          }
          break;
        }

        case "presence": {
          if (msg.event === "join") {
            dispatch({
              type: "PRESENCE_JOIN",
              roomId: msg.roomId,
              member: {
                userId: msg.userId,
                username: msg.userId,
                status: "online",
              },
            });
          } else {
            dispatch({
              type: "PRESENCE_LEAVE",
              roomId: msg.roomId,
              userId: msg.userId,
            });
          }
          break;
        }

        case "replay_chunk": {
          const messages: DisplayMessage[] = msg.messages.map((m) => ({
            id: m.streamId ?? generateId(),
            roomId: m.roomId,
            userId: m.userId,
            username: m.userId,
            text: m.text,
            ts: m.ts,
            pending: false,
            failed: false,
          }));
          dispatch({ type: "REPLAY_CHUNK", roomId: msg.roomId, messages });
          break;
        }

        case "error": {
          console.error("Server error:", msg.code, msg.message);
          break;
        }
      }
    },
    [auth.userId],
  );

  const { status, send } = useWebSocket({
    token: auth.token,
    onMessage: handleMessage,
    enabled: true,
  });

  //   Sync connectionstatus into state
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      dispatch({ type: "SET_STATUS", status });
    }
  }, [status]);
  const joinRoom = useCallback(
    (roomId: string) => {
      send({ type: "subscribe", roomId, lastSeenId: "0-0" });
    },
    [send],
  );

  const sendMessage = useCallback(
    (roomId: string, text: string) => {
      const tempId = generateId();

      // Optimistic add — shows immediately, marked pending
      dispatch({
        type: "ADD_MESSAGE",
        message: {
          id: tempId,
          roomId,
          userId: auth.userId,
          username: auth.username,
          text,
          ts: Date.now(),
          pending: true,
          failed: false,
        },
      });

      pending.current.set(tempId, roomId);
      send({ type: "chat", roomId, userId: auth.userId, text });

      // If no ack arrives in 5s, mark as failed
      setTimeout(() => {
        if (pending.current.has(tempId)) {
          dispatch({ type: "FAIL_MESSAGE", tempId, roomId });
          pending.current.delete(tempId);
        }
      }, 5_000);
    },
    [auth.userId, auth.username, send],
  );

  const setActive = useCallback(
    (roomId: string) => {
      dispatch({ type: "SET_ACTIVE_ROOM", roomId });
      dispatch({ type: "MARK_READ", roomId });
      joinRoom(roomId);
    },
    [joinRoom],
  );

  return (
    <ChatContext.Provider
      value={{ state, auth, sendMessage, joinRoom, setActive }}
    >
      {children}
    </ChatContext.Provider>
  );
}
