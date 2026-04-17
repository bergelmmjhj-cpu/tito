import crypto from "node:crypto";
import {
  createWorkplace,
  findWorkplaceById,
  listWorkplaces,
  updateWorkplace,
} from "../models/workplaceModel.js";
import {
  findWorkplaceByIdFromCrm,
  listWorkplacesFromCrm,
} from "../models/crmWorkplaceModel.js";
import { HttpError } from "../utils/errors.js";
import { isValidTimeZone } from "../utils/time.js";

function normalizeText(value, label, required = false, maxLen = 120) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${label} must be a string`);

  const clean = value.trim();
  if (!clean) {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }

  return clean.slice(0, maxLen);
}

function normalizeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a finite number`);
  }
  return value;
}

function validateCoordinates(latitude, longitude) {
  const lat = normalizeNumber(latitude, "latitude");
  const lon = normalizeNumber(longitude, "longitude");

  if (lat < -90 || lat > 90) {
    throw new HttpError(400, "latitude must be between -90 and 90");
  }
  if (lon < -180 || lon > 180) {
    throw new HttpError(400, "longitude must be between -180 and 180");
  }

  return { latitude: lat, longitude: lon };
}

export function hasZeroCoordinates(latitude, longitude) {
  return Number(latitude) === 0 && Number(longitude) === 0;
}

function validateRadius(radius) {
  const r = normalizeNumber(radius, "geofenceRadiusMeters");
  if (r < 50 || r > 500) {
    throw new HttpError(400, "geofenceRadiusMeters must be between 50 and 500");
  }
  return r;
}

function normalizeOptionalTimeZone(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "timeZone must be a string");

  const clean = value.trim();
  if (!clean) return null;
  if (!isValidTimeZone(clean)) {
    throw new HttpError(400, "timeZone must be a valid IANA time zone, for example America/New_York");
  }

  return clean;
}

export function assertActiveWorkplaceIntegrity(workplace) {
  const lat = Number(workplace?.latitude);
  const lon = Number(workplace?.longitude);
  if (hasZeroCoordinates(lat, lon)) {
    throw new HttpError(400, "Active workplaces cannot use 0,0 coordinates");
  }

  const tz = typeof workplace?.timeZone === "string" ? workplace.timeZone.trim() : "";
  if (!tz) {
    throw new HttpError(400, "Active workplaces must include a valid timeZone");
  }
  if (!isValidTimeZone(tz)) {
    throw new HttpError(400, "timeZone must be a valid IANA time zone, for example America/New_York");
  }
}

function normalizeWorkplacePayload(payload, { partial = false } = {}) {
  const required = !partial;
  const name = normalizeText(payload.name, "name", required, 160);
  const address = normalizeText(payload.address, "address", required, 200);
  const city = normalizeText(payload.city, "city", required, 120);
  const state = normalizeText(payload.state, "state", required, 120);
  const postalCode = normalizeText(payload.postalCode, "postalCode", required, 40);
  const country = normalizeText(payload.country, "country", required, 120);

  const contactName = normalizeText(payload.contactName, "contactName", false, 160);
  const contactPhone = normalizeText(payload.contactPhone, "contactPhone", false, 50);
  const contactEmail = normalizeText(payload.contactEmail, "contactEmail", false, 160);
  const timeZone = normalizeOptionalTimeZone(payload.timeZone);

  const hasCoords = payload.latitude !== undefined || payload.longitude !== undefined;
  const hasRadius = payload.geofenceRadiusMeters !== undefined;

  let coords = {};
  if (required || hasCoords) {
    coords = validateCoordinates(payload.latitude, payload.longitude);
  }

  let geofenceRadiusMeters;
  if (required || hasRadius) {
    geofenceRadiusMeters = validateRadius(payload.geofenceRadiusMeters);
  }

  const normalized = {
    ...(name !== null ? { name } : {}),
    ...(address !== null ? { address } : {}),
    ...(city !== null ? { city } : {}),
    ...(state !== null ? { state } : {}),
    ...(postalCode !== null ? { postalCode } : {}),
    ...(country !== null ? { country } : {}),
    ...(timeZone !== null ? { timeZone } : {}),
    contactName,
    contactPhone,
    contactEmail,
    ...(coords.latitude !== undefined ? { latitude: coords.latitude } : {}),
    ...(coords.longitude !== undefined ? { longitude: coords.longitude } : {}),
    ...(geofenceRadiusMeters !== undefined ? { geofenceRadiusMeters } : {}),
  };

  if (payload.active !== undefined) {
    if (typeof payload.active !== "boolean") {
      throw new HttpError(400, "active must be a boolean");
    }
    normalized.active = payload.active;
  }

  return normalized;
}

function sortByUpdatedDesc(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}

// --- Tito DB functions (DATABASE_URL) ---

export async function getWorkplaces(includeInactive = true) {
  const all = await listWorkplaces();
  const filtered = includeInactive ? all : all.filter((item) => item.active !== false);
  return sortByUpdatedDesc(filtered);
}

export async function addWorkplace(payload, actor) {
  const now = new Date().toISOString();
  const clean = normalizeWorkplacePayload(payload, { partial: false });

  if (clean.active !== false) {
    assertActiveWorkplaceIntegrity(clean);
  }

  return createWorkplace({
    id: crypto.randomUUID(),
    ...clean,
    crm: {
      source: "local",
      externalId: null,
      syncStatus: "not_synced",
      ownerType: "local_admin",
    },
    active: clean.active !== false,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
}

export async function editWorkplace(workplaceId, payload) {
  const existing = await findWorkplaceById(workplaceId);
  if (!existing) throw new HttpError(404, "Workplace not found");

  const patch = normalizeWorkplacePayload(payload, { partial: true });
  if ((patch.active ?? existing.active) !== false) {
    assertActiveWorkplaceIntegrity({ ...existing, ...patch });
  }
  patch.updatedAt = new Date().toISOString();

  const updated = await updateWorkplace(workplaceId, patch);
  if (!updated) throw new HttpError(404, "Workplace not found");
  return updated;
}

export async function setWorkplaceActive(workplaceId, active) {
  if (typeof active !== "boolean") throw new HttpError(400, "active must be a boolean");

  const existing = await findWorkplaceById(workplaceId);
  if (!existing) throw new HttpError(404, "Workplace not found");

  if (active) {
    assertActiveWorkplaceIntegrity(existing);
  }

  const updated = await updateWorkplace(workplaceId, {
    active,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) throw new HttpError(404, "Workplace not found");
  return updated;
}

export async function getWorkplaceById(workplaceId) {
  const workplace = await findWorkplaceById(workplaceId);
  if (!workplace) throw new HttpError(404, "Workplace not found");
  return workplace;
}

function normalizeKeyPart(value) {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "(UNKNOWN)";
}

export function buildDuplicateGroups(workplaces) {
  const groups = new Map();

  for (const workplace of workplaces) {
    const key = `${normalizeKeyPart(workplace.name)}|${normalizeKeyPart(workplace.city)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(workplace);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      normalizedName: normalizeKeyPart(list[0]?.name),
      normalizedCity: normalizeKeyPart(list[0]?.city),
      items: list
        .slice()
        .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""))
        .map((item) => ({
          id: item.id,
          name: item.name,
          city: item.city || "",
          timeZone: item.timeZone || null,
          latitude: item.latitude,
          longitude: item.longitude,
          active: item.active !== false,
          createdAt: item.createdAt || null,
          source: item.crm?.source || "local",
        })),
    }));
}

export async function validateHotelsData() {
  const workplaces = await getWorkplaces(true);

  const invalidCoordinates = workplaces
    .filter((item) => hasZeroCoordinates(item.latitude, item.longitude))
    .map((item) => ({
      id: item.id,
      name: item.name,
      city: item.city || "",
      latitude: item.latitude,
      longitude: item.longitude,
      active: item.active !== false,
    }));

  const missingTimeZone = workplaces
    .filter((item) => !item.timeZone || !String(item.timeZone).trim())
    .map((item) => ({
      id: item.id,
      name: item.name,
      city: item.city || "",
      active: item.active !== false,
    }));

  const duplicates = buildDuplicateGroups(workplaces);

  return {
    totals: {
      workplaces: workplaces.length,
      invalidCoordinates: invalidCoordinates.length,
      missingTimeZone: missingTimeZone.length,
      duplicateGroups: duplicates.length,
    },
    invalidCoordinates,
    missingTimeZone,
    duplicates,
  };
}

// --- CRM DB functions (CRM_DATABASE_URL) ---

export async function getWorkplacesFromCrm(includeInactive = true) {
  const all = await listWorkplacesFromCrm();
  const filtered = includeInactive ? all : all.filter((item) => item.active !== false);
  return sortByUpdatedDesc(filtered);
}

export async function getWorkplaceByIdFromCrm(workplaceId) {
  const workplace = await findWorkplaceByIdFromCrm(workplaceId);
  if (!workplace) throw new HttpError(404, "Workplace not found in CRM");
  return workplace;
}
