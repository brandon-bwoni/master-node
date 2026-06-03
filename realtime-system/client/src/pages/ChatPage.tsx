import { useEffect } from "react";
import { useChat } from "../context/useChat.js";
import { Sidebar } from "../components/Sidebar.js";
import { MessageList } from "../components/MessageList.js";
import { MessageInput } from "../components/MessageInput.js";

export function ChatPage({ onLogout }: { onLogout: () => void }) {
  const { state, auth, sendMessage, setActive } = useChat();
  const { rooms, messages, activeRoomId, connectionStatus } = state;

  // Auto-join first room on mount
  useEffect(() => {
    if (!activeRoomId && rooms.length > 0 && rooms[0]) {
      setActive(rooms[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeMessages = activeRoomId ? (messages[activeRoomId] ?? []) : [];
  const isDisabled = connectionStatus !== "connected";

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--color-background-primary)",
        overflow: "hidden",
      }}
    >
      <Sidebar
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelectRoom={setActive}
        username={auth.username}
        userId={auth.userId}
        status={connectionStatus}
      />

      {/* Main chat area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
        }}
      >
        {activeRoom ? (
          <>
            {/* Room header */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "0.5px solid var(--color-border-tertiary)",
                background: "var(--color-background-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <h2 style={{ fontSize: "16px", fontWeight: 500, margin: 0 }}>
                {activeRoom.name}
              </h2>
              {activeRoom.members.length > 0 && (
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {activeRoom.members.length} online
                </span>
              )}

              {/* Connection status banner */}
              {isDisabled && (
                <div
                  style={{
                    marginLeft: "auto",
                    fontSize: "12px",
                    padding: "3px 10px",
                    borderRadius: "var(--border-radius-md)",
                    background:
                      connectionStatus === "error"
                        ? "var(--color-background-danger)"
                        : "var(--color-background-warning)",
                    color:
                      connectionStatus === "error"
                        ? "var(--color-text-danger)"
                        : "var(--color-text-warning)",
                  }}
                >
                  {connectionStatus === "connecting"
                    ? "Connecting to proxy…"
                    : "Reconnecting…"}
                </div>
              )}
            </div>

            <MessageList messages={activeMessages} userId={auth.userId} />

            <MessageInput
              onSend={(text) => activeRoomId && sendMessage(activeRoomId, text)}
              disabled={isDisabled}
              roomName={activeRoom.name}
            />
          </>
        ) : (
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
            Select a room to start chatting
          </div>
        )}
      </main>
      <button onClick={onLogout}>Logout</button>
    </div>
  );
}
