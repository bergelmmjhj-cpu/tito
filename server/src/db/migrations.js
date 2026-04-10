import crypto from "node:crypto";
import { createPasswordHash } from "../utils/password.js";

export const CURRENT_SCHEMA_VERSION = 1;

function createSeedUsers() {
  const maria = createPasswordHash("password123");
  const john = createPasswordHash("password123");

  return [
    {
      id: crypto.randomUUID(),
      name: "Maria Cruz",
      email: "maria@hotel.local",
      staffId: "W1001",
      role: "worker",
      passwordSalt: maria.salt,
      passwordHash: maria.hash,
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "John Rivera",
      email: "john@hotel.local",
      staffId: "W1002",
      role: "worker",
      passwordSalt: john.salt,
      passwordHash: john.hash,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createInitialDatabase() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    users: createSeedUsers(),
    shifts: [],
    timeLogs: [],
  };
}

export function migrateDatabase(db) {
  if (!db || typeof db !== "object") {
    return createInitialDatabase();
  }

  const safe = {
    schemaVersion: Number(db.schemaVersion) || 0,
    users: Array.isArray(db.users) ? db.users : [],
    shifts: Array.isArray(db.shifts) ? db.shifts : [],
    timeLogs: Array.isArray(db.timeLogs) ? db.timeLogs : [],
  };

  if (safe.schemaVersion === 0) {
    safe.schemaVersion = 1;
  }

  if (safe.users.length === 0) {
    safe.users = createSeedUsers();
  }

  safe.shifts = safe.shifts.map((shift) => ({
    ...shift,
    breaks: Array.isArray(shift.breaks) ? shift.breaks : [],
  }));

  safe.schemaVersion = CURRENT_SCHEMA_VERSION;
  return safe;
}
