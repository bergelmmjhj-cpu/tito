import crypto from "node:crypto";
import { createPasswordHash } from "../utils/password.js";

export const CURRENT_SCHEMA_VERSION = 3;

function buildUser({
  firstName,
  lastName,
  email,
  staffId,
  role,
  phone = null,
  password,
}) {
  const creds = createPasswordHash(password);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    phone,
    staffId,
    role,
    isActive: true,
    profile: {
      phone,
      createdFrom: "seed",
    },
    passwordSalt: creds.salt,
    passwordHash: creds.hash,
    createdAt: now,
    updatedAt: now,
  };
}

function createSeedUsers() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@hotel.local";
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin12345";

  return [
    buildUser({
      firstName: "System",
      lastName: "Admin",
      email: adminEmail,
      staffId: "A1000",
      role: "admin",
      password: adminPassword,
    }),
    buildUser({
      firstName: "Maria",
      lastName: "Cruz",
      email: "maria@hotel.local",
      staffId: "W1001",
      role: "worker",
      password: "password123",
    }),
    buildUser({
      firstName: "John",
      lastName: "Rivera",
      email: "john@hotel.local",
      staffId: "W1002",
      role: "worker",
      password: "password123",
    }),
  ];
}

export function createInitialDatabase() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    users: createSeedUsers(),
    workplaces: [],
    shifts: [],
    timeLogs: [],
  };
}

export function migrateDatabase(db) {
  if (!db || typeof db !== "object") {
    return createInitialDatabase();
  }

  const safe = {
    schemaVersion: Number(db.schemaVersion) || 0,
    users: Array.isArray(db.users) ? db.users : [],
    workplaces: Array.isArray(db.workplaces) ? db.workplaces : [],
    shifts: Array.isArray(db.shifts) ? db.shifts : [],
    timeLogs: Array.isArray(db.timeLogs) ? db.timeLogs : [],
  };

  if (safe.schemaVersion === 0) {
    safe.schemaVersion = 1;
  }

  if (safe.users.length === 0) {
    safe.users = createSeedUsers();
  }

  safe.users = safe.users.map((user) => {
    const firstName = user.firstName || (typeof user.name === "string" ? user.name.split(" ")[0] : "User");
    const lastName =
      user.lastName ||
      (typeof user.name === "string" && user.name.split(" ").length > 1
        ? user.name.split(" ").slice(1).join(" ")
        : "Member");

    return {
      ...user,
      firstName,
      lastName,
      name: user.name || `${firstName} ${lastName}`,
      phone: typeof user.phone === "string" ? user.phone : null,
      role: user.role === "admin" ? "admin" : "worker",
      isActive: user.isActive !== false,
      profile:
        user.profile && typeof user.profile === "object"
          ? {
              ...user.profile,
              assignedWorkplaceId:
                typeof user.profile.assignedWorkplaceId === "string"
                  ? user.profile.assignedWorkplaceId
                  : null,
            }
          : { assignedWorkplaceId: null },
      updatedAt: user.updatedAt || user.createdAt || new Date().toISOString(),
    };
  });

  const hasAdmin = safe.users.some((user) => user.role === "admin");
  if (!hasAdmin) {
    safe.users.unshift(
      buildUser({
        firstName: "System",
        lastName: "Admin",
        email: process.env.DEFAULT_ADMIN_EMAIL || "admin@hotel.local",
        staffId: "A1000",
        role: "admin",
        password: process.env.DEFAULT_ADMIN_PASSWORD || "admin12345",
      })
    );
  }

  safe.workplaces = safe.workplaces.map((item) => ({
    ...item,
    name: item.name || "Unnamed Workplace",
    address: item.address || "",
    city: item.city || "",
    state: item.state || "",
    postalCode: item.postalCode || "",
    country: item.country || "",
    contactName: item.contactName || null,
    contactPhone: item.contactPhone || null,
    contactEmail: item.contactEmail || null,
    latitude:
      typeof item.latitude === "number" && Number.isFinite(item.latitude) ? item.latitude : 0,
    longitude:
      typeof item.longitude === "number" && Number.isFinite(item.longitude) ? item.longitude : 0,
    geofenceRadiusMeters:
      typeof item.geofenceRadiusMeters === "number" && Number.isFinite(item.geofenceRadiusMeters)
        ? item.geofenceRadiusMeters
        : 150,
    active: item.active !== false,
    crm: item.crm && typeof item.crm === "object"
      ? {
          source: item.crm.source || "local",
          externalId: item.crm.externalId || null,
          syncStatus: item.crm.syncStatus || "not_synced",
          ownerType: item.crm.ownerType || "local_admin",
        }
      : {
          source: "local",
          externalId: null,
          syncStatus: "not_synced",
          ownerType: "local_admin",
        },
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
  }));

  safe.shifts = safe.shifts.map((shift) => ({
    ...shift,
    breaks: Array.isArray(shift.breaks) ? shift.breaks : [],
  }));

  safe.timeLogs = safe.timeLogs.map((log) => {
    const location = log?.location && typeof log.location === "object" ? log.location : null;
    const geofence = log?.geofence && typeof log.geofence === "object" ? log.geofence : null;

    return {
      ...log,
      location: location
        ? {
            latitude:
              typeof location.latitude === "number" && Number.isFinite(location.latitude)
                ? location.latitude
                : null,
            longitude:
              typeof location.longitude === "number" && Number.isFinite(location.longitude)
                ? location.longitude
                : null,
            accuracy:
              typeof location.accuracy === "number" && Number.isFinite(location.accuracy)
                ? location.accuracy
                : null,
            capturedAt:
              typeof location.capturedAt === "string" && location.capturedAt.trim()
                ? location.capturedAt
                : null,
          }
        : null,
      geofence: geofence
        ? {
            workplaceId:
              typeof geofence.workplaceId === "string" && geofence.workplaceId.trim()
                ? geofence.workplaceId
                : null,
            workplaceName:
              typeof geofence.workplaceName === "string" && geofence.workplaceName.trim()
                ? geofence.workplaceName
                : null,
            radiusMeters:
              typeof geofence.radiusMeters === "number" && Number.isFinite(geofence.radiusMeters)
                ? geofence.radiusMeters
                : null,
            distanceMeters:
              typeof geofence.distanceMeters === "number" && Number.isFinite(geofence.distanceMeters)
                ? geofence.distanceMeters
                : null,
            withinGeofence:
              typeof geofence.withinGeofence === "boolean" ? geofence.withinGeofence : null,
            enforcementEnabled:
              typeof geofence.enforcementEnabled === "boolean" ? geofence.enforcementEnabled : false,
          }
        : null,
    };
  });

  safe.schemaVersion = CURRENT_SCHEMA_VERSION;
  return safe;
}
