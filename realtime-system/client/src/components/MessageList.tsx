import { useEffect, useRef } from "react";
import type { DisplayMessage } from "../types/index.js";
import { MessageBubble } from "./MessageBubble.js";

interface MessageListProps {
  messages: DisplayMessage[];
  userId: string;
}

export function MessageList({ messages, userId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive, unless user has scrolled up
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
          fontSize: "14px",
        }}
      >
        No messages yet. Say hello!
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const isGrouped =
          prev?.userId === msg.userId && msg.ts - (prev?.ts ?? 0) < 60_000;
        const isOwn = msg.userId === userId;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={isOwn}
            showAvatar={!isGrouped}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
