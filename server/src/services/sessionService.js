import crypto from "node:crypto";

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUserId(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}
