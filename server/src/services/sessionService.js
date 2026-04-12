import crypto from "node:crypto";
import { query } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

const SESSION_TTL_HOURS = 12;
const HOUR_IN_MS = 60 * 60 * 1000;
const SESSION_TTL_MS = SESSION_TTL_HOURS * HOUR_IN_MS;

// Fallback in-memory sessions for when DATABASE_URL is not set
const fallbackSessions = new Map();

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of fallbackSessions.entries()) {
    if (now > session.expiresAt) fallbackSessions.delete(token);
  }
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  if (!isDatabaseReady()) {
    cleanupExpiredSessions();
    fallbackSessions.set(token, { userId, expiresAt: expiresAt.getTime() });
    return token;
  }

  try {
    await query(
      `INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES ($1, $2, $3, $4)`,
      [token, userId, expiresAt, new Date()]
    );
    return token;
  } catch (error) {
    console.error("Failed to create session:", error.message);
    // Fallback to in-memory
    cleanupExpiredSessions();
    fallbackSessions.set(token, { userId, expiresAt: expiresAt.getTime() });
    return token;
  }
}

export async function getSessionUserId(token) {
  if (!isDatabaseReady()) {
    cleanupExpiredSessions();
    const session = fallbackSessions.get(token);
    if (!session) return null;
    return session.userId;
  }

  try {
    const result = await query(
      `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > $2 LIMIT 1`,
      [token, new Date()]
    );
    return result.rows[0]?.user_id || null;
  } catch (error) {
    console.error("Failed to get session:", error.message);
    // Fallback to in-memory
    cleanupExpiredSessions();
    const session = fallbackSessions.get(token);
    if (!session) return null;
    return session.userId;
  }
}

export async function deleteSession(token) {
  if (!isDatabaseReady()) {
    fallbackSessions.delete(token);
    return;
  }

  try {
    await query(`DELETE FROM sessions WHERE token = $1`, [token]);
  } catch (error) {
    console.error("Failed to delete session:", error.message);
  }

  // Also remove from fallback
  fallbackSessions.delete(token);
}
