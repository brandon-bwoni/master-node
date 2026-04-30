
export interface User {
  id:       string;
  username: string;
  email:    string;
}

export interface JwtPayload {
  sub:      string;   
  username: string;
  email:    string;
  iat:      number;   
  exp:      number;   
}

export type PresenceStatus = "online" | "away" | "offline"

export interface UserPresence {
  userId:   string;
  username: string;
  status:   PresenceStatus;
  roomId:   string;
  lastSeen: number;  
}


/**
 * GUARDS
 */
export function isJwtPayload(raw: unknown): raw is JwtPayload {
  if (typeof raw !== "object" || raw === null) return false;

  const p = raw as Record<string, unknown>;

  return (
    typeof p["sub"]      === "string" &&
    typeof p["username"] === "string" &&
    typeof p["email"]    === "string" &&
    typeof p["iat"]      === "number" &&
    typeof p["exp"]      === "number"
  );
}

/**
 * HELPERS
 */
export function userFromJwt(payload: JwtPayload): User {
  return {
    id:       payload.sub,
    username: payload.username,
    email:    payload.email,
  };
}


/**
 * Build a UserPresence record from a connected user.
 * Called on room join; lastSeen is refreshed by the heartbeat loop.
 */
export function makePresence(
  user:   User,
  roomId: string,
  status: PresenceStatus = "online",
): UserPresence {
  return {
    userId:   user.id,
    username: user.username,
    status,
    roomId,
    lastSeen: Date.now(),
  };
}