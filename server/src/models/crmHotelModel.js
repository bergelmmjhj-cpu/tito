import { crmQuery } from "../db/crmPool.js";

/**
 * READ-ONLY model for hotels and hotel_rates sourced from the CRM database (CRM_DATABASE_URL).
 * No writes are performed against the CRM database.
 */

export async function listHotelsFromCrm() {
  const result = await crmQuery(`SELECT * FROM hotels ORDER BY created_at DESC`);
  return result.rows.map(normalizeDbHotel);
}

export async function findHotelByIdFromCrm(hotelId) {
  const result = await crmQuery(`SELECT * FROM hotels WHERE id = $1 LIMIT 1`, [hotelId]);
  return result.rows[0] ? normalizeDbHotel(result.rows[0]) : null;
}

export async function findHotelRatesFromCrm(hotelId) {
  const result = await crmQuery(
    `SELECT * FROM hotel_rates WHERE hotel_id = $1 ORDER BY effective_from DESC`,
    [hotelId]
  );
  return result.rows.map(normalizeDbHotelRate);
}

function normalizeDbHotel(dbRow) {
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
    starRating: dbRow.star_rating || null,
    active: dbRow.active !== false,
    metadata: dbRow.metadata
      ? typeof dbRow.metadata === "string"
        ? JSON.parse(dbRow.metadata)
        : dbRow.metadata
      : {},
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}

function normalizeDbHotelRate(dbRow) {
  if (!dbRow) return null;

  return {
    id: dbRow.id,
    hotelId: dbRow.hotel_id,
    rateType: dbRow.rate_type || null,
    amount: dbRow.amount != null ? parseFloat(dbRow.amount) : null,
    currency: dbRow.currency || "USD",
    effectiveFrom: dbRow.effective_from || null,
    effectiveTo: dbRow.effective_to || null,
    notes: dbRow.notes || null,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
