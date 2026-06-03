import type { DisplayMessage } from "../types/index.js";
import { formatTime, initials, avatarColor } from "../utils/index.js";

interface MessageBubbleProps {
  message: DisplayMessage;
  isOwn: boolean;
  showAvatar: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
}: MessageBubbleProps) {
  const color = avatarColor(message.userId);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isOwn ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: "8px",
        marginBottom: showAvatar ? "12px" : "2px",
        padding: "0 16px",
      }}
    >
      {/* Avatar — only shown on first message in a group */}
      <div style={{ width: "28px", flexShrink: 0 }}>
        {showAvatar && !isOwn && (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: 500,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(message.username)}
          </div>
        )}
      </div>

      <div
        style={{
          maxWidth: "70%",
          display: "flex",
          flexDirection: "column",
          alignItems: isOwn ? "flex-end" : "flex-start",
        }}
      >
        {/* Username + timestamp on first bubble in group */}
        {showAvatar && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "6px",
              marginBottom: "3px",
              flexDirection: isOwn ? "row-reverse" : "row",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              {isOwn ? "You" : message.username}
            </span>
            <span
              style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}
            >
              {formatTime(message.ts)}
            </span>
          </div>
        )}

        {/* Bubble */}
        <div
          style={{
            padding: "8px 12px",
            borderRadius: isOwn ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            background: isOwn
              ? "var(--color-background-info)"
              : "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            fontSize: "14px",
            lineHeight: "1.5",
            color: isOwn
              ? "var(--color-text-info)"
              : "var(--color-text-primary)",
            wordBreak: "break-word",
            opacity: message.pending ? 0.6 : 1,
            position: "relative",
          }}
        >
          {message.text}

          {/* Pending / failed indicator */}
          {message.pending && (
            <span
              style={{
                fontSize: "10px",
                marginLeft: "6px",
                color: "var(--color-text-tertiary)",
              }}
            >
              ···
            </span>
          )}
          {message.failed && (
            <span
              style={{
                fontSize: "10px",
                marginLeft: "6px",
                color: "var(--color-text-danger)",
              }}
            >
              failed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
