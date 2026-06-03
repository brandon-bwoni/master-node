import jwt from "jsonwebtoken";
import { AuthError, SessionError } from "../utils/authErrors.js";
import * as User from "../models/user.model.js";

import {
  createSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  rotateRefreshToken,
  validateRefreshToken,
} from "../store/session-store.js";
import { argon2Pool } from "../server.js";
import { signValue, verifySignedValue } from "../services/cookie-signing.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH = process.env.JWT_REFRESH_SECRET;

const REFRESH_TTL = "15m";
const ACCESS_TTL = 7 * 24 * 60 * 60;

if (!JWT_SECRET || !JWT_REFRESH) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET env vars must be set");
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Strict",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

function buildCookie(name, value, maxAge) {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
  ];
  if (COOKIE_OPTS.secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name) {
  return buildCookie(name, "", 0);
}

const SESSION_TTL_SECS = 7 * 24 * 60 * 60;
function setAuthCookies(res, sid, rawRefreshToken, userId) {
  const signedUserId = signValue(userId);
  res.setHeader("Set-Cookie", [
    buildCookie("sid", sid, SESSION_TTL_SECS),
    buildCookie("refresh_token", rawRefreshToken, SESSION_TTL_SECS),
    buildCookie("uid", signedUserId, SESSION_TTL_SECS),
  ]);
}

function clearAuthCookies(res) {
  res.setHeader("Set-Cookie", [
    clearCookie("sid"),
    clearCookie("refresh_token"),
  ]);
}

function issueAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function issueRefreshToken(userId) {
  return jwt.sign({ sub: userId }, JWT_REFRESH, { expiresIn: REFRESH_TTL });
}

function verifyAccess(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// function verifyInWorker(password, hash) {
//   return new Promise((resolve, reject) => {
//     const worker = new Worker("../workers/auth-worker.js", {
//       workerData: { password, hash },
//     });
//     worker.on("message", ({ valid }) => resolve(valid));
//     worker.on("error", reject);
//   });
// }

function extractDeviceInfo(req) {
  return {
    userAgent: req.headers["user-agent"] || "unknown",
    platform: req.headers["sec-ch-ua-platform"] || "unknown",
  };
}

export async function login(ctx) {
  const { email, password } = ctx.body ?? {};

  if (!email || !password) throw new AuthError();

  const normalisedEmail = email.trim().toLowerCase();
  const user = await User.findUserByEmail(normalisedEmail);

  // Always run verify — prevents timing-based user enumeration
  const hashToCheck =
    user?.password_hash ??
    "$argon2id$v=19$m=65536,t=3,p=1$dummysaltvalue00$dummyhashvaluedummyhashvalue0";

  const valid = argon2Pool.verify(hashToCheck, password);

  if (!user || !valid) throw new AuthError();

  // Issue tokens
  const accessToken = issueAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role ?? "user",
  });
  const rawRefreshToken = issueRefreshToken(user.id);

  // Create Redis session — stores hash of refresh token, not the raw token
  const sid = await createSession({
    userId: user.id,
    rawRefreshToken,
    deviceInfo: extractDeviceInfo(ctx.req),
    ip: ctx.req.socket.remoteAddress ?? "unknown",
  });

  setAuthCookies(ctx.res, sid, rawRefreshToken);

  const { password_hash, ...safeUser } = user;

  ctx.json({ accessToken, user: safeUser });
}

export async function refresh(ctx) {
  const sid = ctx.req.cookies?.sid;
  const rawRefreshToken = ctx.req.cookies?.refresh_token;

  if (!sid || !rawRefreshToken) throw new SessionError();

  const { valid, session } = await validateRefreshToken(sid, rawRefreshToken);

  if (!valid || !session) {
    clearAuthCookies(ctx.res);
    throw new SessionError("Refresh token invalid — please log in again");
  }

  // Verify the user account still exists and is active
  const user = await User.findById(session.userId);
  if (!user) {
    await deleteSession(sid, session.userId);
    clearAuthCookies(ctx.res);
    throw new SessionError();
  }

  // Rotate refresh token — old hash is replaced, replay of the old token fails
  const newRawRefreshToken = issueRefreshToken(user.id);
  await rotateRefreshToken(sid, newRawRefreshToken);

  // Issue new access JWT
  const accessToken = issueAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role ?? "user",
  });

  // Update refresh_token cookie with new token
  const SESSION_TTL_SECS = 7 * 24 * 60 * 60;
  ctx.res.setHeader("Set-Cookie", [
    buildCookie("sid", sid, SESSION_TTL_SECS),
    buildCookie("refresh_token", newRawRefreshToken, SESSION_TTL_SECS),
  ]);

  return { accessToken };
}

export async function logout(ctx) {
  const sid = ctx.req.cookies?.sid;
  const signedUid = ctx.req.cookies?.uid;

  if (!sid) {
    clearAuthCookies(ctx.res);
    return;
  }

  const userId = verifySignedValue(signedUid);

  const pipeline = redis.pipeline();
  pipeline.del(sessionKey(sid));
  if (userId) pipeline.srem(userIndexKey(userId), sid);
  await pipeline.exec();

  clearAuthCookies(ctx.res);
}

export async function logoutAll(ctx) {
  const session = ctx.user;
  if (session?.userId) await deleteAllUserSessions(session.userId);
  clearAuthCookies(ctx.res);
}

// export async function getActiveSessions(ctx) {
//   return listUserSessions(ctx.user.userId);
// }
