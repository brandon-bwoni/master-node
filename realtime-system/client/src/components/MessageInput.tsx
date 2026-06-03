import { useState, useRef, type KeyboardEvent } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  roomName: string;
}

export function MessageInput({
  onSend,
  disabled,
  roomName,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset height after clearing
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-primary)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-lg)",
          border: "0.5px solid var(--color-border-secondary)",
          padding: "8px 12px",
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={disabled ? "Connecting..." : `Message ${roomName}`}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            resize: "none",
            outline: "none",
            fontSize: "14px",
            lineHeight: "1.5",
            padding: 0,
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-primary)",
            minHeight: "24px",
            maxHeight: "120px",
            overflow: "auto",
          }}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={{
            flexShrink: 0,
            width: "32px",
            height: "32px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 7L13 1L7 13L5.5 8.5L1 7Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p
        style={{
          fontSize: "11px",
          color: "var(--color-text-tertiary)",
          margin: "4px 0 0",
          textAlign: "center",
        }}
      >
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
