import {
  findHotelByIdFromCrm,
  findHotelRatesFromCrm,
  listHotelsFromCrm,
} from "../models/crmHotelModel.js";
import { HttpError } from "../utils/errors.js";

/**
 * Service layer for CRM hotel data (CRM_DATABASE_URL).
 * All operations are READ-ONLY against the CRM database.
 */

export async function getHotelsFromCrm(includeInactive = true) {
  const all = await listHotelsFromCrm();
  return includeInactive ? all : all.filter((hotel) => hotel.active !== false);
}

export async function getHotelByIdFromCrm(hotelId) {
  if (!hotelId) throw new HttpError(400, "hotelId is required");

  const hotel = await findHotelByIdFromCrm(hotelId);
  if (!hotel) throw new HttpError(404, "Hotel not found in CRM");
  return hotel;
}

export async function getHotelRatesFromCrm(hotelId) {
  if (!hotelId) throw new HttpError(400, "hotelId is required");

  // Verify the hotel exists before fetching rates
  const hotel = await findHotelByIdFromCrm(hotelId);
  if (!hotel) throw new HttpError(404, "Hotel not found in CRM");

  return findHotelRatesFromCrm(hotelId);
}
