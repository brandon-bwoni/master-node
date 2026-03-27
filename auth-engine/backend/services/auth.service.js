"use strict";

import jwt from "jsonwebtoken";
import { TokenError } from "../utils/authErrors.js";
import * as User from "../models/user.model.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error(
    "JWT_SECRET and JWT_REFRESH_SECRET must be defined in environment variables",
  );
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

// Refresh token
export async function refresh(refreshToken) {
  if (!refreshToken) throw new TokenError();

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    throw new TokenError();
  }

  const user = await User.findUserById(payload.sub);

  if (!user) throw new TokenError();

  return { accessToken: signAccessToken };
}

// Helpers
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

// Authentication middleware helper
export function verifyAccessToken(token) {
  if (!token) throw new TokenError();

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new TokenError();
  }
}

// Hybrid cookie setup
export function setAuthCookies(res, sid, rawRefreshToken) {
  res.setHeader("Set-Cookie", [
    buildCookie("sid", sid, SESSION_TTL_SECS),
    buildCookie("refresh_token", rawRefreshToken, SESSION_TTL_SECS),
  ]);
}
