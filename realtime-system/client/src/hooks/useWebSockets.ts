import { useEffect, useRef, useCallback, useState } from "react";
import type { InboundServerMessage, ConnectionStatus } from "../types/index";
import { ExponentialBackoff } from "../utils/index.js";

const PROXY_URL = import.meta.env["VITE_PROXY_URL"] ?? "ws://localhost:3000";
const PING_INTERVAL = 25_000;
const PONG_TIMEOUT = 10_000;

interface UseWebSocketOptions {
  token: string;
  onMessage: (msg: InboundServerMessage) => void;
  enabled: boolean;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  send: (data: object) => void;
  connect: () => void;
}

export function useWebSocket({
  token,
  onMessage,
  enabled,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const backoff = useRef(new ExponentialBackoff());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval>>(null);
  const pongTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const onMessageRef = useRef(onMessage);
  const isMounted = useRef(true);

  // Keep onMessage ref fresh without triggering a reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }

    if (pongTimer.current) {
      clearTimeout(pongTimer.current);
      pongTimer.current = null;
    }
  }, []);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    const startHeartbeat = (ws: WebSocket) => {
      pingTimer.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;

        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));

        // If no pong arrives within PONG_TIMEOUT, the connection is dead
        pongTimer.current = setTimeout(() => {
          ws.close(1001, "pong timeout");
        }, PONG_TIMEOUT);
      }, PING_INTERVAL);
    };

    const connect = () => {
      if (!isMounted.current || !enabled) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      // Close stale socket before opening a new one
      wsRef.current?.close();

      setStatus("connecting");

      // Token passed as query param (Browser WebSocket API cannot set headers)
      const url = `${PROXY_URL}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMounted.current) {
          ws.close();
          return;
        }
        setStatus("connected");
        backoff.current.reset();
        startHeartbeat(ws);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(event.data) as InboundServerMessage;

          // Clear pong timeout on pong receipt
          if (msg.type === "pong" && pongTimer.current) {
            clearTimeout(pongTimer.current);
            pongTimer.current = null;
          }
        } catch {
          console.error("Failed to parse server message", event.data);
        }
      };

      ws.onclose = (event) => {
        clearTimers();
        if (isMounted.current) return;

        // 4001 = unauthorized. Dont reconnect, surface error to user
        if (event.code === 4001) {
          setStatus("error");
          return;
        }

        setStatus("disconnected");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (!isMounted.current) return;
      const delay = backoff.current.next();
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    if (enabled && token) connect();

    return () => {
      isMounted.current = false;
      clearTimers();
      wsRef.current?.close(1000, "component unmounted");
    };
  }, [enabled, token, clearTimers]);

  return { status, send, connect: () => connectRef.current() };
}
