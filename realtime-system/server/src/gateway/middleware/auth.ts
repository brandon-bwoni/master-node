import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { JwtPayload } from "../../types/user.js";
import { isJwtPayload } from "../../types/user.js";
import { logger } from "../../shared/logger.js";
import { env } from "../config/env.js";
import { WS_CLOSE } from "../utils/constants.js";

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// PLUGINS
export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: "24h",
      algorithm: "HS256",
    },
    verify: {
      algorithms: ["HS256"],
    },
  });

  // Decorate fastify with a reusable authenticate hook
  fastify.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, url: req.url },
          "HTTP request authentication failed",
        );
        reply
          .code(401)
          .send({ error: "Unauthorized", message: "Invalid or expired token" });
      }
    },
  );

  logger.info("Auth plugin registered");
});

// FASTIFY TYPE AUGMENTATION FOR DECORATOR
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// AUTHENTICATE WEBSOCKET UPGRADE
export function authenticateWsUpgrade(req: FastifyRequest): JwtPayload {
  const token = extractToken(req);

  if (!token) {
    logger.warn(
      { url: req.url, ip: req.ip },
      "WebSocket upgrade rejected — no token",
    );
    throw new AuthError("No token provided", WS_CLOSE.UNAUTHORIZED);
  }

  try {
    // req.server.jwt.verify is synchronous for HS256 — safe to call here
    const decoded = req.server.jwt.verify<JwtPayload>(token);

    if (!isJwtPayload(decoded)) {
      throw new AuthError("Malformed token payload", WS_CLOSE.UNAUTHORIZED);
    }

    if (isTokenExpired(decoded)) {
      throw new AuthError("Token expired", WS_CLOSE.UNAUTHORIZED);
    }

    logger.debug(
      { userId: decoded.sub, username: decoded.username },
      "WebSocket upgrade authenticated",
    );

    return decoded;
  } catch (err) {
    if (err instanceof AuthError) throw err;

    // @fastify/jwt throws on invalid signature, malformed token, etc.
    logger.warn(
      { err: (err as Error).message, ip: req.ip },
      "WebSocket upgrade rejected — JWT verification failed",
    );
    throw new AuthError("Invalid token", WS_CLOSE.UNAUTHORIZED);
  }
}

// CONVENIENCE WRAPPER
export function tryAuthenticateWsUpgrade(
  req: FastifyRequest,
): JwtPayload | null {
  try {
    return authenticateWsUpgrade(req);
  } catch {
    return null;
  }
}

// TOKEN EXTRACTION
function extractToken(req: FastifyRequest): string | null {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }

  //    Native WebSocket API cannot set custom headers
  const query = req.query as Record<string, string | undefined>;
  const queryToken = query["token"];
  if (queryToken) {
    return queryToken.trim() || null;
  }

  return null;
}

/**
 * HELPERS
 */
function isTokenExpired(payload: JwtPayload): boolean {
  return payload.exp * 1_000 < Date.now();
}

// ERRORS
export class AuthError extends Error {
  constructor(
    message: string,
    public closeCode: number = WS_CLOSE.UNAUTHORIZED,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
