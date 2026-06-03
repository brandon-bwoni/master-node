import type { Room, ConnectionStatus } from "../types/index.js";
import { avatarColor, initials } from "../utils/index.js";

interface SidebarProps {
  rooms: Room[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  username: string;
  userId: string;
  status: ConnectionStatus;
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: "var(--color-text-success)",
  connecting: "var(--color-text-warning)",
  disconnected: "var(--color-text-tertiary)",
  error: "var(--color-text-danger)",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
  error: "Connection error",
};

export function Sidebar({
  rooms,
  activeRoomId,
  onSelectRoom,
  username,
  userId,
  status,
}: SidebarProps) {
  const color = avatarColor(userId);

  return (
    <aside
      style={{
        width: "220px",
        flexShrink: 0,
        borderRight: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 4px" }}>
          Realtime Chat
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: STATUS_COLORS[status],
              flexShrink: 0,
            }}
          />
          <span
            style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Rooms */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            padding: "4px 16px 6px",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Rooms
        </p>
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "7px 16px",
              background:
                room.id === activeRoomId
                  ? "var(--color-background-primary)"
                  : "transparent",
              border: "none",
              borderLeft:
                room.id === activeRoomId
                  ? "2px solid var(--color-border-info)"
                  : "2px solid transparent",
              cursor: "pointer",
              textAlign: "left",
              borderRadius: 0,
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: room.id === activeRoomId ? 500 : 400,
                color:
                  room.id === activeRoomId
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
              }}
            >
              {room.name}
            </span>
            {room.unread > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  background: "var(--color-background-info)",
                  color: "var(--color-text-info)",
                  borderRadius: "10px",
                  padding: "1px 6px",
                  minWidth: "18px",
                  textAlign: "center",
                }}
              >
                {room.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active room members */}
      {activeRoomId &&
        (() => {
          const room = rooms.find((r) => r.id === activeRoomId);
          if (!room || room.members.length === 0) return null;
          return (
            <div
              style={{
                padding: "8px 0",
                borderTop: "0.5px solid var(--color-border-tertiary)",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  padding: "4px 16px 6px",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Online — {room.members.length}
              </p>
              {room.members.slice(0, 8).map((m) => (
                <div
                  key={m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 16px",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: avatarColor(m.userId),
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "9px",
                      fontWeight: 500,
                      color: "#fff",
                    }}
                  >
                    {initials(m.username)}
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {m.username}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

      {/* Current user footer */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 500,
            color: "#fff",
          }}
        >
          {initials(username)}
        </div>
        <div style={{ overflow: "hidden" }}>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {username}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              color: "var(--color-text-tertiary)",
            }}
          >
            You
          </p>
        </div>
      </div>
    </aside>
  );
}
