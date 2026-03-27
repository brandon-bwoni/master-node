import fs from "fs/promises";
import { verifyAccessToken } from "../services/auth.service.js";
import { touchSession } from "../store/session-store.js";

// Logging middleware
export const logger = async (ctx, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  await fs.writeFile(
    "logs/logs.log",
    `[${timestamp}] --> ${ctx.method} ${ctx.url}\n`,
    { flag: "a" },
  );

  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    throw err;
  } finally {
    const duration = Date.now() - start;
    await fs.writeFile(
      "logs/logs.log",
      `[${timestamp}] <-- ${ctx.method} ${ctx.url} [${ctx.status}] ${duration}ms\n`,
      { flag: "a" },
    );
    console.log(`${ctx.method} ${ctx.url} [${ctx.status}] ${duration}ms`);
  }
};

//  CORS middleware
export const cors = async (ctx, next) => {
  // Set CORS headers on every response
  ctx.res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  ctx.res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  ctx.res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  ctx.res.setHeader("Access-Control-Allow-Credentials", "true");

  // ← Handle preflight OPTIONS request and return early
  if (ctx.req.method === "OPTIONS") {
    ctx.res.writeHead(204);
    ctx.res.end();
    return; //
  }

  await next();
};

// JWT Authentication middleware
export async function authenticate(ctx, next) {
  const token = ctx.req.cookies?.access_token;

  if (!token) {
    ctx.status = 401;
    return ctx.json({ error: "Not authenticated" });
  }

  try {
    ctx.user = verifyAccessToken(token);
  } catch {
    ctx.status = 401;
    return ctx.json({ error: "Invalid or expired session" });
  }

  await next();
}

export async function sessionAuth(ctx, next) {
  const sid = ctx.req.cookies?.[COOKIE_NAME];

  if (!sid) {
    ctx.status = 401;
    return ctx.json({ error: "Not authenticated" });
  }

  const session = await getSession(sid);

  if (!session) {
    ctx.res.setHeader("Set-Cookie", buildSessionCookie("", 0));
    ctx.status = 401;
    return ctx.json({ error: "Session expired" });
  }

  await touchSession(sid);

  ctx.user = session;
  await next();
}

export async function hybridAuth(ctx, next) {
  const authHeader = ctx.req.headers["authorization"];

  if (!authHeader?.startsWith("Bearer ")) {
    ctx.status = 401;
    return ctx.json({ error: "Missing Authorization header" });
  }

  const token = authHeader.slice(7);
  const payload = verifyAccess(token);

  if (!payload) {
    ctx.status = 401;
    return ctx.json({ error: "Access token invalid or expired" });
  }

  // Attach decoded JWT payload — available as ctx.user in all downstream handlers
  ctx.user = { userId: payload.sub, email: payload.email, role: payload.role };
  await next();
}

// Role verification middleware
export function requireRole(role) {
  return async (ctx, next) => {
    if (ctx.user?.role !== role) {
      ctx.status = 403;
      return ctx.json({ error: "Forbidden" });
    }
    await next();
  };
}

// Minimal cookie parser — no dependency needed
export const cookieParse = async (ctx, next) => {
  const header = ctx.req.headers["cookie"];
  ctx.req.cookies = {};

  if (header) {
    for (const pair of header.split(";")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      ctx.req.cookies[key] = decodeURIComponent(value);
    }
  }

  await next();
};
