import crypto from "node:crypto";

const sessions = new Map();
// Session tokens are intentionally in-memory for this v1 app and reset on server restart.
const SESSION_TTL_HOURS = 12;
const HOUR_IN_MS = 60 * 60 * 1000;
const SESSION_TTL_MS = SESSION_TTL_HOURS * HOUR_IN_MS;

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}

export function createSession(userId) {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUserId(token) {
  cleanupExpiredSessions();
  const session = sessions.get(token);
  if (!session) return null;
  return session.userId;
}
