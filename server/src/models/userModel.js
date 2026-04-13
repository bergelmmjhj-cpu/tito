import { query, withClient } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

export async function findUserByIdentifier(identifier) {
  const normalized = identifier.trim().toLowerCase();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (
      db.users.find((user) => {
        const staffId = typeof user.staffId === "string" ? user.staffId.toLowerCase() : "";
        const email = typeof user.email === "string" ? user.email.toLowerCase() : "";
        if (staffId === normalized) return true;
        return email === normalized;
      }) || null
    );
  }

  const result = await query(
    `SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(staff_id) = $1 LIMIT 1`,
    [normalized]
  );
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.users.find((user) => (user.email || "").toLowerCase() === normalized) || null;
  }

  const result = await query(`SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1`, [normalized]);
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function findUserByStaffId(staffId) {
  const normalized = staffId.trim().toLowerCase();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.users.find((user) => (user.staffId || "").toLowerCase() === normalized) || null;
  }

  const result = await query(`SELECT * FROM users WHERE LOWER(staff_id) = $1 LIMIT 1`, [
    normalized,
  ]);
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function findUserById(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.users.find((user) => user.id === userId) || null;
  }

  const result = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function listUsers() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.users.slice();
  }

  const result = await query(`SELECT * FROM users ORDER BY created_at DESC`);
  return result.rows.map(normalizeDbUser);
}

export async function createUser(userRecord) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    db.users.push(userRecord);
    await writeDatabaseToJson(db);
    return userRecord;
  }

  const profile = userRecord.profile ? JSON.stringify(userRecord.profile) : "{}";
  const result = await query(
    `INSERT INTO users (
      id, first_name, last_name, name, email, phone, staff_id, role,
      is_active, google_id, google_email, password_salt, password_hash,
      profile, created_at, updated_at, created_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      userRecord.id,
      userRecord.firstName || "",
      userRecord.lastName || "",
      userRecord.name || "",
      userRecord.email,
      userRecord.phone || null,
      userRecord.staffId,
      userRecord.role || "worker",
      userRecord.isActive !== false,
      userRecord.googleId || null,
      userRecord.googleEmail || null,
      userRecord.passwordSalt,
      userRecord.passwordHash,
      profile,
      userRecord.createdAt || new Date().toISOString(),
      userRecord.updatedAt || new Date().toISOString(),
      userRecord.profile?.createdFrom || "manual",
    ]
  );

  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

export async function updateUserById(userId, patch) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const index = db.users.findIndex((user) => user.id === userId);
    if (index === -1) return null;

    db.users[index] = { ...db.users[index], ...patch };
    await writeDatabaseToJson(db);
    return db.users[index];
  }

  // Build dynamic update query
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(patch)) {
    const dbKey = camelToPgColumn(key);
    if (dbKey === "profile") {
      updates.push(`profile = $${paramIndex}`);
      values.push(typeof value === "string" ? value : JSON.stringify(value || {}));
    } else if (dbKey === "id") {
      // Skip id updates
      continue;
    } else {
      updates.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
    }
    paramIndex += 1;
  }

  if (updates.length === 0) {
    return findUserById(userId);
  }

  updates.push(`updated_at = $${paramIndex}`);
  values.push(new Date().toISOString());
  paramIndex += 1;

  values.push(userId);

  const result = await query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] ? normalizeDbUser(result.rows[0]) : null;
}

function camelToPgColumn(camel) {
  const map = {
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    phone: "phone",
    staffId: "staff_id",
    role: "role",
    isActive: "is_active",
    googleId: "google_id",
    googleEmail: "google_email",
    passwordSalt: "password_salt",
    passwordHash: "password_hash",
    profile: "profile",
    createdAt: "created_at",
    updatedAt: "updated_at",
    createdFrom: "created_from",
  };
  return map[camel] || camel;
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
    profile: dbRow.profile ? (typeof dbRow.profile === "string" ? JSON.parse(dbRow.profile) : dbRow.profile) : {},
    passwordSalt: dbRow.password_salt,
    passwordHash: dbRow.password_hash,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
