import { query } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

export async function createAuditLogEntry(entry) {
  const record = {
    id: entry.id || null,
    userId: entry.userId || null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    oldValue: entry.oldValue || null,
    newValue: entry.newValue || null,
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    record.id = String(db.auditLogs.length + 1);
    db.auditLogs.push(record);
    await writeDatabaseToJson(db);
    return record;
  }

  const result = await query(
    `INSERT INTO audit_log (user_id, action, target_type, target_id, old_value, new_value, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     RETURNING id, user_id, action, target_type, target_id, old_value, new_value, created_at`,
    [
      record.userId,
      record.action,
      record.targetType,
      String(record.targetId),
      JSON.stringify(record.oldValue),
      JSON.stringify(record.newValue),
      record.createdAt,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  };
}

export async function listAuditLogEntries(filters = {}) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const rows = Array.isArray(db.auditLogs) ? db.auditLogs.slice() : [];
    return rows
      .filter((row) => {
        if (filters.userId && row.userId !== filters.userId) return false;
        if (filters.action && row.action !== filters.action) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  }

  const where = [];
  const values = [];
  let i = 1;

  if (filters.userId) {
    where.push(`user_id = $${i++}`);
    values.push(filters.userId);
  }
  if (filters.action) {
    where.push(`action = $${i++}`);
    values.push(filters.action);
  }

  const limit = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : 100;
  values.push(limit);

  const result = await query(
    `SELECT id, user_id, action, target_type, target_id, old_value, new_value, created_at
     FROM audit_log
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${i}`,
    values
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}
