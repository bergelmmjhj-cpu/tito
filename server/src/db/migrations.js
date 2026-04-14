import crypto from "node:crypto";
import { createPasswordHash } from "../utils/password.js";
import { buildShiftHourSummary } from "../services/payableHoursService.js";

export const CURRENT_SCHEMA_VERSION = 5;

const DEFAULT_BOOTSTRAP_ADMIN = {
  firstName: "System",
  lastName: "Admin",
  email: "admin@hotel.local",
  password: "",
  staffId: "A1000",
};

function readBootstrapAdminConfigFromEnv() {
  const firstName =
    process.env.ADMIN_FIRST_NAME ||
    process.env.DEFAULT_ADMIN_FIRST_NAME ||
    DEFAULT_BOOTSTRAP_ADMIN.firstName;
  const lastName =
    process.env.ADMIN_LAST_NAME ||
    process.env.DEFAULT_ADMIN_LAST_NAME ||
    DEFAULT_BOOTSTRAP_ADMIN.lastName;
  const email =
    process.env.ADMIN_EMAIL ||
    process.env.DEFAULT_ADMIN_EMAIL ||
    DEFAULT_BOOTSTRAP_ADMIN.email;
  const password =
    process.env.ADMIN_PASSWORD ||
    process.env.DEFAULT_ADMIN_PASSWORD ||
    DEFAULT_BOOTSTRAP_ADMIN.password;
  const staffId =
    process.env.ADMIN_STAFF_ID ||
    process.env.DEFAULT_ADMIN_STAFF_ID ||
    DEFAULT_BOOTSTRAP_ADMIN.staffId;

  return {
    firstName: String(firstName).trim() || DEFAULT_BOOTSTRAP_ADMIN.firstName,
    lastName: String(lastName).trim() || DEFAULT_BOOTSTRAP_ADMIN.lastName,
    email: String(email).trim().toLowerCase() || DEFAULT_BOOTSTRAP_ADMIN.email,
    password: String(password),
    staffId: String(staffId).trim() || DEFAULT_BOOTSTRAP_ADMIN.staffId,
  };
}

export function getBootstrapAdminSeed() {
  return readBootstrapAdminConfigFromEnv();
}

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
  const adminSeed = getBootstrapAdminSeed();

  const hasValidPassword =
    typeof adminSeed.password === "string" && adminSeed.password.length >= 8;

  if (!hasValidPassword) {
    return [];
  }

  return [
    buildUser({
      firstName: adminSeed.firstName,
      lastName: adminSeed.lastName,
      email: adminSeed.email,
      staffId: adminSeed.staffId,
      role: "admin",
      password: adminSeed.password,
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
    const adminSeed = getBootstrapAdminSeed();
    const hasValidPassword =
      typeof adminSeed.password === "string" && adminSeed.password.length >= 8;

    if (hasValidPassword) {
      safe.users.unshift(
        buildUser({
          firstName: adminSeed.firstName,
          lastName: adminSeed.lastName,
          email: adminSeed.email,
          staffId: adminSeed.staffId,
          role: "admin",
          password: adminSeed.password,
        })
      );
    }
  }

  safe.workplaces = safe.workplaces.map((item) => ({
    ...item,
    name: item.name || "Unnamed Workplace",
    address: item.address || "",
    city: item.city || "",
    state: item.state || "",
    postalCode: item.postalCode || "",
    country: item.country || "",
    timeZone: typeof item.timeZone === "string" && item.timeZone.trim() ? item.timeZone.trim() : null,
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

  safe.shifts = safe.shifts.map((shift) => {
    const normalizedShift = {
      ...shift,
      breaks: Array.isArray(shift.breaks) ? shift.breaks : [],
    };
    const summary = buildShiftHourSummary(normalizedShift);

    return {
      ...normalizedShift,
      businessDate:
        typeof shift.businessDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(shift.businessDate)
          ? shift.businessDate
          : null,
      businessTimeZone:
        typeof shift.businessTimeZone === "string" && shift.businessTimeZone.trim()
          ? shift.businessTimeZone.trim()
          : null,
      actualHours:
        typeof shift.actualHours === "number" && Number.isFinite(shift.actualHours)
          ? shift.actualHours
          : summary.actualHours,
      payableHours:
        typeof shift.payableHours === "number" && Number.isFinite(shift.payableHours)
          ? shift.payableHours
          : summary.payableHours,
    };
  });

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
            businessTimeZone:
              typeof geofence.businessTimeZone === "string" && geofence.businessTimeZone.trim()
                ? geofence.businessTimeZone.trim()
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
