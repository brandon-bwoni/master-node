import argon2 from "argon2";
import * as User from "../models/user.model.js";
import {
  createSession,
  getSession,
  deleteSession,
  indexUserSession,
  deleteAllUserSessions,
} from "../store/session-store.js";
import { AuthError } from "../utils/authErrors.js";

const COOKIE_NAME = "sid";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function buildSessionCookie(sid, maxAge = COOKIE_MAX_AGE) {
  const parts = [
    `${COOKIE_NAME}=${sid}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

// Login function
export async function login(ctx, email, password) {
  if (!email || !password) throw new AuthError();

  const normalisedEmail = email.trim().toLowerCase();
  const user = await User.findUserByEmail(normalisedEmail);

  const hashToCheck =
    user?.password_hash ??
    "$argon2id$v=19$m=65536,t=3,p=1$dummysaltdummy$dummyhashvaluedummyhashvalue";

  const valid = await argon2.verify(hashToCheck, password);

  if (!user || !valid) throw new AuthError();

  const sessionData = {
    userId: user.id,
    email: user.email,
    role: user.role ?? "user",
  };

  const sid = await createSession(sessionData);

  await indexUserSession(user.id, sid);

  ctx.res.setHeader("Set-Cookie", buildSessionCookie(sid));

  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export async function logout(ctx) {
  const sid = ctx.req.cookies?.[COOKIE_NAME];
  if (sid) await deleteSession(sid);

  ctx.res.setHeader("Set-Cookie", buildSessionCookie("", 0));
}

export async function logoutAll(ctx) {
  const sid = ctx.req.cookies?.[COOKIE_NAME];
  if (!sid) return;

  const session = await getSession(sid);
  if (session) await deleteAllUserSessions(session.userId);

  ctx.res.setHeader("Set-Cookie", buildSessionCookie("", 0));
}
