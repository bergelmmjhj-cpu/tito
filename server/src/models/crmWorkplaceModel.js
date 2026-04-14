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

  const crmData = (() => {
    try {
      return dbRow.crm
        ? (typeof dbRow.crm === "string" ? JSON.parse(dbRow.crm) : dbRow.crm)
        : {};
    } catch {
      return {};
    }
  })();

  const crmAddress = crmData?.address && typeof crmData.address === "object"
    ? crmData.address
    : {};

  const pickFirst = (...values) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };

  return {
    id: dbRow.id,
    name: dbRow.name,
    address: pickFirst(
      dbRow.address,
      dbRow.street,
      dbRow.address_line_1,
      dbRow.address1,
      dbRow.full_address,
      crmAddress.line1,
      crmAddress.street,
      crmData.address
    ),
    city: pickFirst(
      dbRow.city,
      dbRow.city_name,
      dbRow.cityname,
      dbRow.town,
      dbRow.municipality,
      crmAddress.city,
      crmAddress.town,
      crmAddress.municipality,
      crmData.city
    ),
    state: pickFirst(
      dbRow.state,
      dbRow.province,
      dbRow.region,
      dbRow.state_name,
      dbRow.state_code,
      dbRow.province_code,
      crmAddress.state,
      crmAddress.province,
      crmAddress.region,
      crmData.state,
      crmData.province
    ),
    postalCode: pickFirst(
      dbRow.postal_code,
      dbRow.postcode,
      dbRow.zip,
      dbRow.zip_code,
      crmAddress.postalCode,
      crmAddress.postcode,
      crmAddress.zip,
      crmData.postalCode,
      crmData.zip
    ),
    country: pickFirst(
      dbRow.country,
      dbRow.country_name,
      dbRow.country_code,
      dbRow.country_iso,
      crmAddress.country,
      crmAddress.countryCode,
      crmData.country,
      crmData.countryCode
    ),
    timeZone: pickFirst(
      dbRow.time_zone,
      dbRow.timezone,
      dbRow.tz,
      dbRow.iana_time_zone,
      dbRow.iana_timezone
    ) || null,
    contactName: dbRow.contact_name || null,
    contactPhone: dbRow.contact_phone || null,
    contactEmail: dbRow.contact_email || null,
    latitude: dbRow.latitude || 0,
    longitude: dbRow.longitude || 0,
    geofenceRadiusMeters: dbRow.geofence_radius_meters || 150,
    active: dbRow.active !== false,
    crm: crmData,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
