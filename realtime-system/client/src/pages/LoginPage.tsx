import { useState } from "react";
import type { AuthState } from "../types/index.js";

interface LoginPageProps {
  onLogin: (auth: AuthState) => void;
}

// In production this would call POST /api/auth/login on the gateway.
// For development we mint a mock JWT so the UI works without a running server.
function mockJwt(userId: string, username: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: userId,
      username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  );
  return `${header}.${payload}.mock-signature`;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // Try real auth endpoint first
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          token: string;
          userId: string;
          username: string;
        };
        onLogin(data);
      } else {
        // Fall back to mock JWT for local dev without a running server
        const userId = `user-${Math.random().toString(36).slice(2, 8)}`;
        onLogin({
          token: mockJwt(userId, username.trim()),
          userId,
          username: username.trim(),
        });
      }
    } catch {
      // No server running — use mock
      const userId = `user-${Math.random().toString(36).slice(2, 8)}`;
      onLogin({
        token: mockJwt(userId, username.trim()),
        userId,
        username: username.trim(),
      });
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background-tertiary)",
      }}
    >
      <div
        style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "2rem",
          width: "360px",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 500,
            marginBottom: "0.25rem",
            marginTop: 0,
          }}
        >
          Realtime Chat
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-text-secondary)",
            marginBottom: "1.5rem",
            marginTop: 0,
          }}
        >
          Enter a username to join
        </p>

        <label
          style={{
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            display: "block",
            marginBottom: "6px",
          }}
        >
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="e.g. alice"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: "0.75rem",
          }}
        />

        {error && (
          <p
            style={{
              fontSize: "13px",
              color: "var(--color-text-danger)",
              marginBottom: "0.75rem",
              marginTop: 0,
            }}
          >
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: "100%" }}
        >
          {loading ? "Joining..." : "Join chat"}
        </button>

        <p
          style={{
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            marginTop: "1rem",
            marginBottom: 0,
            textAlign: "center",
          }}
        >
          Connects via proxy on localhost:3000
        </p>
      </div>
    </div>
  );
}
