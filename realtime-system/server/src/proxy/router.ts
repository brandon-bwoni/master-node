import httpProxy from "http-proxy";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { getUpstream, markUnhealthy, startHealthChecks } from "./upstream.js";
import { logger } from "../shared/logger.js";

const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  timeout: 10_000,
});

// Error handling
proxy.on("error", (err, req, res, target) => {
  const targetUrl =
    typeof target === "object" && target !== null
      ? ((target as { href?: string }).href ?? "unknown")
      : String(target ?? "unknown");

  logger.error(
    { err: err.message, targetUrl, url: (req as IncomingMessage).url },
    "Proxy error",
  );

  if (targetUrl !== "unknown") markUnhealthy(targetUrl);

  // res can be a ServerResponse (HTTP) or Socket (WS) depending on context
  if (res instanceof ServerResponse) {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Bad Gateway",
          message: "Upstream unavailable",
        }),
      );
    }
  } else if (res instanceof Socket) {
    res.destroy();
  }
});

/**
 * HTTP SERVER
 */
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
      }),
    );
    return;
  }

  const target = getUpstream(req);

  if (!target) {
    logger.warn(
      { url: req.url, method: req.method },
      "No healthy upstream available",
    );
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Service Unavailable",
        message: "No healthy upstreams",
      }),
    );
    return;
  }

  logger.debug({ url: req.url, target }, "Proxying HTTP request");

  proxy.web(req, res, { target });
});

/**
 * WEBSOCKET UPGRADE
 */
server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
  const target = getUpstream(req);

  if (!target) {
    logger.warn({ url: req.url }, "No healthy upstream for WS upgrade");
    // Reject with a valid HTTP response before destroying
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  logger.debug({ url: req.url, target }, "Proxying WebSocket upgrade");

  proxy.ws(req, socket, head, { target }, (err) => {
    if (err) {
      logger.error(
        { err: err.message, target, url: req.url },
        "WS proxy error",
      );
      markUnhealthy(target);
      socket.destroy();
    }
  });
});

/**
 * GRACEFUL SHUTDOWN
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Proxy shutdown signal received");

  server.close(() => {
    logger.info("Proxy HTTP server closed");
    process.exit(0);
  });

  // Force exit if server hasn't closed within 10s
  setTimeout(() => {
    logger.fatal("Proxy shutdown timed out ");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled rejection in proxy — exiting");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err: err.message }, "Uncaught exception in proxy — exiting");
  process.exit(1);
});

/**
 * START PROXY SERVER
 */
server.listen(8080, () => {
  logger.info({ port: 8080, pid: process.pid }, "Proxy server started");
});

startHealthChecks();
