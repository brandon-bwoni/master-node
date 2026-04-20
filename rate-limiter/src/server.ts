// src/server.ts
import { createServer, IncomingMessage, ServerResponse } from "http";
import { loadScript as slidingWindowScript } from "./core/strategies/slidingWindow.js";
import { loadScript as tokenBucketScript } from "./core/strategies/tokenBucket.js";
import { applyRateLimit } from "./middleware/rateLimiter.js";

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

// -----------------------------
// Helpers
// -----------------------------

function sendJSON(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function getPath(req: IncomingMessage) {
  return new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
}

// -----------------------------
// Route Handlers
// -----------------------------

const healthHandler: RouteHandler = async (_, res) => {
  sendJSON(res, 200, { status: "ok" });
};

const slidingHandler: RouteHandler = async (req, res) => {
  const allowed = await applyRateLimit(req, res);

  if (!allowed) return;

  sendJSON(res, 200, { message: "Sliding window allowed" });
};

const tokenHandler: RouteHandler = async (req, res) => {
  const allowed = await applyRateLimit(req, res);

  if (!allowed) return;

  sendJSON(res, 200, { message: "Token bucket allowed" });
};

const dataHandler: RouteHandler = async (req, res) => {
  const allowed = await applyRateLimit(req, res); // default/global config
  if (!allowed) return;

  sendJSON(res, 200, { data: "your payload here" });
};

// -----------------------------
// Router
// -----------------------------

async function router(req: IncomingMessage, res: ServerResponse) {
  const path = getPath(req);

  try {
    if (req.method === "GET" && path === "/health") {
      return healthHandler(req, res);
    }

    if (req.method === "GET" && path === "/api/sliding") {
      return slidingHandler(req, res);
    }

    if (req.method === "GET" && path === "/api/token") {
      return tokenHandler(req, res);
    }

    if (req.method === "GET" && path === "/api/data") {
      return dataHandler(req, res);
    }

    return sendJSON(res, 404, { error: "Not Found" });

  } catch (err) {
    console.error("Route error:", err);

    if (!res.headersSent) {
      sendJSON(res, 500, { error: "Internal Server Error" });
    }
  }
}

// -----------------------------
// Server Bootstrap
// -----------------------------

async function start() {
  // Load Lua scripts (critical for performance)
  await slidingWindowScript();
  await tokenBucketScript();

  const server = createServer((req, res) => {
    router(req, res);
  });

  server.listen(3000, () => {
    console.log("Server listening on port 3000");
    console.log("Available endpoints:");
    console.log("  GET /health");
    console.log("  GET /api/sliding");
    console.log("  GET /api/token");
    console.log("  GET /api/data");
  });
}

start();