import { query } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

export async function listWorkplaces() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.workplaces || []).slice();
  }

  const result = await query(`SELECT * FROM workplaces ORDER BY created_at DESC`);
  return result.rows.map(normalizeDbWorkplace);
}

export async function findWorkplaceById(workplaceId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.workplaces || []).find((item) => item.id === workplaceId) || null;
  }

  const result = await query(`SELECT * FROM workplaces WHERE id = $1 LIMIT 1`, [workplaceId]);
  return result.rows[0] ? normalizeDbWorkplace(result.rows[0]) : null;
}

export async function createWorkplace(workplace) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.workplaces)) db.workplaces = [];
    db.workplaces.push(workplace);
    await writeDatabaseToJson(db);
    return workplace;
  }

  const crm = workplace.crm ? JSON.stringify(workplace.crm) : "{}";
  const result = await query(
    `INSERT INTO workplaces (
      id, name, address, city, state, postal_code, country,
      contact_name, contact_phone, contact_email,
      latitude, longitude, geofence_radius_meters, time_zone, active, crm,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *`,
    [
      workplace.id,
      workplace.name || "Unnamed",
      workplace.address || null,
      workplace.city || null,
      workplace.state || null,
      workplace.postalCode || null,
      workplace.country || null,
      workplace.contactName || null,
      workplace.contactPhone || null,
      workplace.contactEmail || null,
      workplace.latitude || null,
      workplace.longitude || null,
      workplace.geofenceRadiusMeters || 150,
      workplace.timeZone || null,
      workplace.active !== false,
      crm,
      workplace.createdAt || new Date().toISOString(),
      workplace.updatedAt || new Date().toISOString(),
    ]
  );

  return result.rows[0] ? normalizeDbWorkplace(result.rows[0]) : null;
}

export async function updateWorkplace(workplaceId, update) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.workplaces)) db.workplaces = [];
    const idx = db.workplaces.findIndex((item) => item.id === workplaceId);
    if (idx === -1) return null;

    db.workplaces[idx] = { ...db.workplaces[idx], ...update };
    await writeDatabaseToJson(db);
    return db.workplaces[idx];
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(update)) {
    const dbKey = camelToPgColumn(key);
    if (dbKey === "crm") {
      updates.push(`crm = $${paramIndex}`);
      values.push(typeof value === "string" ? value : JSON.stringify(value || {}));
    } else if (dbKey === "id") {
      continue;
    } else {
      updates.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
    }
    paramIndex += 1;
  }

  if (updates.length === 0) {
    return findWorkplaceById(workplaceId);
  }

  updates.push(`updated_at = $${paramIndex}`);
  values.push(new Date().toISOString());
  paramIndex += 1;

  values.push(workplaceId);

  const result = await query(
    `UPDATE workplaces SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] ? normalizeDbWorkplace(result.rows[0]) : null;
}

function camelToPgColumn(camel) {
  const map = {
    name: "name",
    address: "address",
    city: "city",
    state: "state",
    postalCode: "postal_code",
    country: "country",
    contactName: "contact_name",
    contactPhone: "contact_phone",
    contactEmail: "contact_email",
    latitude: "latitude",
    longitude: "longitude",
    geofenceRadiusMeters: "geofence_radius_meters",
    timeZone: "time_zone",
    active: "active",
    crm: "crm",
    createdAt: "created_at",
    updatedAt: "updated_at",
  };
  return map[camel] || camel;
}

function normalizeDbWorkplace(dbRow) {
  if (!dbRow) return null;

  return {
    id: dbRow.id,
    name: dbRow.name,
    address: dbRow.address || "",
    city: dbRow.city || "",
    state: dbRow.state || "",
    postalCode: dbRow.postal_code || "",
    country: dbRow.country || "",
    contactName: dbRow.contact_name || null,
    contactPhone: dbRow.contact_phone || null,
    contactEmail: dbRow.contact_email || null,
    latitude: dbRow.latitude || 0,
    longitude: dbRow.longitude || 0,
    geofenceRadiusMeters: dbRow.geofence_radius_meters || 150,
    timeZone: dbRow.time_zone || null,
    active: dbRow.active !== false,
    crm: dbRow.crm ? (typeof dbRow.crm === "string" ? JSON.parse(dbRow.crm) : dbRow.crm) : {},
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
