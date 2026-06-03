import argon2 from "argon2";
import { AuthError } from "../utils/authErrors.js";
import * as User from "../models/user.model.js";
import {
  signAccessToken,
  signRefreshToken,
  refresh,
} from "../services/auth.service.js";

// Function to build cookie string with HttpOnly and Secure flags
function buildCookie(name, value, maxAge) {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export const loginUser = async (ctx) => {
  try {
    const { email, password } = ctx.body;

    if (!email || !password) {
      throw new AuthError();
    }

    const normalisedEmail = email.trim().toLowerCase();

    const user = await User.findUserByEmail(normalisedEmail);

    const hashToVerify =
      user?.password_hash ??
      "$argon2id$v=19$m=65536,t=3,p=1$dummysaltdummy$dummyhashvaluedummyhashvalue";

    const passwordValid = await argon2.verify(hashToVerify, password);

    if (!user || !passwordValid) {
      throw new AuthError();
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    ctx.status = 200;
    const { password_hash, ...safeUser } = user;

    ctx.setHeader("Set-Cookie", [
      buildCookie("accessToken", accessToken, 15 * 60),
      buildCookie("refreshToken", refreshToken, 7 * 24 * 60 * 60),
    ]);

    return ctx.json({
      message: "Login successful",
      user: safeUser,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    ctx.status = 500;
    return ctx.json({ error: err.message });
  }
};

export const refreshToken = async (ctx) => {
  const refreshToken = ctx.req.cookies?.refreshToken;
  if (!refreshToken) {
    ctx.status = 401;
    return ctx.json({ error: "Refresh token missing" });
  }

  const { accessToken } = await refresh(refreshToken);

  ctx.setHeader("Set-Cookie", buildCookie("accessToken", accessToken, 15 * 60));

  ctx.json({ ok: true });
};

export const logoutUser = async (ctx) => {
  ctx.setHeader("Set-Cookie", [
    buildCookie("accessToken", "", 0),
    buildCookie("refreshToken", "", 0),
  ]);
  ctx.json({ message: "Logged out successfully" });
};

export const getProfile = async (ctx) => {
  // const {email} = ctx.body
  // const user = User.findUserByEmail(email)

  ctx.json(ctx.user);
};
