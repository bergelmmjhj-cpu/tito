import { crmQuery } from "../db/crmPool.js";

/**
 * READ-ONLY model for workplaces sourced from the CRM database (CRM_DATABASE_URL).
 * No writes are performed against the CRM database.
 */

export async function listWorkplacesFromCrm() {
  const result = await crmQuery(`SELECT * FROM workplaces ORDER BY created_at DESC`);
  return result.rows.map(normalizeDbWorkplace);
}

export async function findWorkplaceByIdFromCrm(workplaceId) {
  const result = await crmQuery(`SELECT * FROM workplaces WHERE id = $1 LIMIT 1`, [workplaceId]);
  return result.rows[0] ? normalizeDbWorkplace(result.rows[0]) : null;
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
    active: dbRow.active !== false,
    crm: dbRow.crm ? (typeof dbRow.crm === "string" ? JSON.parse(dbRow.crm) : dbRow.crm) : {},
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
