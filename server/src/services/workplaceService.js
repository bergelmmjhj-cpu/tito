import crypto from "node:crypto";
import {
  createWorkplace,
  findWorkplaceById,
  listWorkplaces,
  updateWorkplace,
} from "../models/workplaceModel.js";
import { HttpError } from "../utils/errors.js";

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

function validateRadius(radius) {
  const r = normalizeNumber(radius, "geofenceRadiusMeters");
  if (r < 10 || r > 10000) {
    throw new HttpError(400, "geofenceRadiusMeters must be between 10 and 10000");
  }
  return r;
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

export function getWorkplaces(includeInactive = true) {
  const all = listWorkplaces();
  const filtered = includeInactive ? all : all.filter((item) => item.active !== false);
  return sortByUpdatedDesc(filtered);
}

export function addWorkplace(payload, actor) {
  const now = new Date().toISOString();
  const clean = normalizeWorkplacePayload(payload, { partial: false });

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

export function editWorkplace(workplaceId, payload) {
  const existing = findWorkplaceById(workplaceId);
  if (!existing) throw new HttpError(404, "Workplace not found");

  const patch = normalizeWorkplacePayload(payload, { partial: true });
  patch.updatedAt = new Date().toISOString();

  const updated = updateWorkplace(workplaceId, patch);
  if (!updated) throw new HttpError(404, "Workplace not found");
  return updated;
}

export function setWorkplaceActive(workplaceId, active) {
  if (typeof active !== "boolean") throw new HttpError(400, "active must be a boolean");

  const existing = findWorkplaceById(workplaceId);
  if (!existing) throw new HttpError(404, "Workplace not found");

  const updated = updateWorkplace(workplaceId, {
    active,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) throw new HttpError(404, "Workplace not found");
  return updated;
}

export function getWorkplaceById(workplaceId) {
  const workplace = findWorkplaceById(workplaceId);
  if (!workplace) throw new HttpError(404, "Workplace not found");
  return workplace;
}
