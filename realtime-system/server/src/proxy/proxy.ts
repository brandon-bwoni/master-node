import httpProxy from "http-proxy";
import {
  createServer as createHttpServer,
  IncomingMessage,
  ServerResponse,
} from "http";
import { Socket } from "net";
import { getUpstream, markUnhealthy } from "./upstream.js";
import { logger } from "../shared/logger.js";

const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  timeout: 10_000,
});

proxy.on("error", (err, req, res, target) => {
  const targetUrl =
    typeof target === "object" && target !== null
      ? ((target as { href?: string }).href ?? "unknown")
      : String(target ?? "unknown");

  logger.error({ err: err.message, targetUrl }, "Proxy error");
  if (targetUrl !== "unknown") markUnhealthy(targetUrl);

  if (res instanceof ServerResponse) {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Gateway" }));
    }
  } else if (res instanceof Socket) {
    res.destroy();
  }
});

// ← Export createServer instead of calling server.listen here
export function createServer() {
  const server = createHttpServer(
    (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", pid: process.pid }));
        return;
      }

      const target = getUpstream(req);
      if (!target) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No healthy upstreams" }));
        return;
      }

      proxy.web(req, res, { target });
    },
  );

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const target = getUpstream(req);
    if (!target) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    proxy.ws(req, socket, head, { target }, (err) => {
      if (err) {
        logger.error({ err: err.message, target }, "WS proxy error");
        markUnhealthy(target);
        socket.destroy();
      }
    });
  });

  return server;
}
