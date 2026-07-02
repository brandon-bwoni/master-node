// cookie-signing.js
import crypto from "crypto";

const COOKIE_SECRET = process.env.COOKIE_SECRET;

if (!COOKIE_SECRET || COOKIE_SECRET.length < 32) {
  throw new Error("COOKIE_SECRET must be set and at least 32 characters");
}

const SEP = "."; // separator between value and signature

/**
 * Sign a value with HMAC-SHA256.
 * Output format: "value.signature"
 *
 * Why sign the userId cookie?
 * The browser can read and modify non-HttpOnly cookies.
 * Without signing, a user could change uid=1 to uid=2 and
 * logout (delete) another user's session from Redis.
 * The HMAC signature makes tampering detectable.
 *
 * @param {string} value
 * @returns {string}  "value.hmac"
 */
export function signValue(value) {
  const sig = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(String(value))
    .digest("base64url");

  return `${value}${SEP}${sig}`;
}

/**
 * Verify a signed value and return the original value if valid.
 * Returns null if tampered, malformed, or missing.
 *
 * Uses timingSafeEqual to prevent timing attacks on the signature.
 *
 * @param {string} signed   "value.hmac"
 * @returns {string|null}   original value, or null if invalid
 */
export function verifySignedValue(signed) {
  if (!signed || typeof signed !== "string") return null;

  const sepIdx = signed.lastIndexOf(SEP); // lastIndexOf — value itself may contain '.'
  if (sepIdx === -1) return null;

  const value = signed.slice(0, sepIdx);
  const givenSig = signed.slice(sepIdx + 1);

  // Recompute expected signature
  const expectedSig = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(value)
    .digest("base64url");

  // Constant-time comparison — prevents timing attacks on the signature bytes
  const given = Buffer.from(givenSig, "base64url");
  const expected = Buffer.from(expectedSig, "base64url");

  if (given.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(given, expected)) return null;

  return value;
}
