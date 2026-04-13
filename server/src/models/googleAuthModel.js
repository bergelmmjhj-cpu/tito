import crypto from "node:crypto";
import { query } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";
import { listUsers } from "./userModel.js";

export async function findUserByGoogleId(googleId) {
  if (!googleId) return null;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.users.find((user) => user.googleId === googleId) || null;
  }

  const result = await query(
    `SELECT * FROM users WHERE google_id = $1 LIMIT 1`,
    [googleId]
  );
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function linkGoogleIdToUser(userId, googleId, googleEmail) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const index = db.users.findIndex((user) => user.id === userId);
    if (index === -1) return null;

    db.users[index] = {
      ...db.users[index],
      googleId,
      googleEmail,
      updatedAt: new Date().toISOString(),
    };
    await writeDatabaseToJson(db);
    return db.users[index];
  }

  const result = await query(
    `UPDATE users
     SET google_id = $1, google_email = $2, updated_at = $3
     WHERE id = $4
     RETURNING *`,
    [googleId, googleEmail, new Date().toISOString(), userId]
  );
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function createUserFromGoogle(googleProfile) {
  const nameParts = (googleProfile.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "Google";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "User";

  const staffId = await generateStaffId();
  const now = new Date().toISOString();

  const userRecord = {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email: googleProfile.email,
    phone: null,
    staffId,
    role: "worker",
    isActive: true,
    googleId: googleProfile.id,
    googleEmail: googleProfile.email,
    profile: { createdFrom: "google_oauth" },
    passwordSalt: null,
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    db.users.push(userRecord);
    await writeDatabaseToJson(db);
    return userRecord;
  }

  const profile = JSON.stringify(userRecord.profile);
  const result = await query(
    `INSERT INTO users (
      id, first_name, last_name, name, email, phone, staff_id, role,
      is_active, google_id, google_email, password_salt, password_hash,
      profile, created_at, updated_at, created_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      userRecord.id,
      userRecord.firstName,
      userRecord.lastName,
      userRecord.name,
      userRecord.email,
      null,
      userRecord.staffId,
      userRecord.role,
      true,
      userRecord.googleId,
      userRecord.googleEmail,
      null,
      null,
      profile,
      now,
      now,
      "google_oauth",
    ]
  );

  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

async function generateStaffId() {
  const users = await listUsers();
  let max = 1000;

  for (const user of users) {
    const match = /^W(\d+)$/.exec(user.staffId || "");
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > max) max = numeric;
  }

  return `W${max + 1}`;
}

function normalizeDbUser(dbRow) {
  if (!dbRow) return null;

  return {
    id: dbRow.id,
    firstName: dbRow.first_name,
    lastName: dbRow.last_name,
    name: dbRow.name,
    email: dbRow.email,
    phone: dbRow.phone || null,
    staffId: dbRow.staff_id,
    role: dbRow.role,
    isActive: dbRow.is_active !== false,
    googleId: dbRow.google_id || null,
    googleEmail: dbRow.google_email || null,
    profile: dbRow.profile
      ? typeof dbRow.profile === "string"
        ? JSON.parse(dbRow.profile)
        : dbRow.profile
      : {},
    passwordSalt: dbRow.password_salt,
    passwordHash: dbRow.password_hash,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
