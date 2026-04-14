import crypto from "node:crypto";
import { createPasswordHash } from "../utils/password.js";
import { buildShiftHourSummary } from "../services/payableHoursService.js";

export const CURRENT_SCHEMA_VERSION = 8;

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
    payrollExportBatches: [],
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
    payrollExportBatches: Array.isArray(db.payrollExportBatches) ? db.payrollExportBatches : [],
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
      reviewStatus:
        typeof shift.reviewStatus === "string" && shift.reviewStatus.trim()
          ? shift.reviewStatus.trim()
          : null,
      reviewNote:
        typeof shift.reviewNote === "string" && shift.reviewNote.trim()
          ? shift.reviewNote.trim()
          : null,
      reviewedBy:
        typeof shift.reviewedBy === "string" && shift.reviewedBy.trim()
          ? shift.reviewedBy.trim()
          : null,
      reviewedAt:
        typeof shift.reviewedAt === "string" && shift.reviewedAt.trim()
          ? shift.reviewedAt.trim()
          : null,
      payrollStatus:
        shift.payrollStatus === "approved" || shift.payrollStatus === "exported"
          ? shift.payrollStatus
          : "pending",
      payrollApprovedBy:
        typeof shift.payrollApprovedBy === "string" && shift.payrollApprovedBy.trim()
          ? shift.payrollApprovedBy.trim()
          : null,
      payrollApprovedAt:
        typeof shift.payrollApprovedAt === "string" && shift.payrollApprovedAt.trim()
          ? shift.payrollApprovedAt.trim()
          : null,
      payrollExportedBy:
        typeof shift.payrollExportedBy === "string" && shift.payrollExportedBy.trim()
          ? shift.payrollExportedBy.trim()
          : null,
      payrollExportedAt:
        typeof shift.payrollExportedAt === "string" && shift.payrollExportedAt.trim()
          ? shift.payrollExportedAt.trim()
          : null,
      payrollExportBatchId:
        typeof shift.payrollExportBatchId === "string" && shift.payrollExportBatchId.trim()
          ? shift.payrollExportBatchId.trim()
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

  safe.payrollExportBatches = safe.payrollExportBatches.map((batch) => ({
    id: typeof batch?.id === "string" && batch.id.trim() ? batch.id.trim() : crypto.randomUUID(),
    status:
      batch?.status === "reopened" || batch?.status === "replaced"
        ? batch.status
        : "active",
    createdBy:
      typeof batch?.createdBy === "string" && batch.createdBy.trim() ? batch.createdBy.trim() : null,
    createdAt:
      typeof batch?.createdAt === "string" && batch.createdAt.trim()
        ? batch.createdAt.trim()
        : new Date().toISOString(),
    reopenedBy:
      typeof batch?.reopenedBy === "string" && batch.reopenedBy.trim() ? batch.reopenedBy.trim() : null,
    reopenedAt:
      typeof batch?.reopenedAt === "string" && batch.reopenedAt.trim() ? batch.reopenedAt.trim() : null,
    reopenedNote:
      typeof batch?.reopenedNote === "string" && batch.reopenedNote.trim() ? batch.reopenedNote.trim() : null,
    supersedesBatchId:
      typeof batch?.supersedesBatchId === "string" && batch.supersedesBatchId.trim()
        ? batch.supersedesBatchId.trim()
        : null,
    replacedByBatchId:
      typeof batch?.replacedByBatchId === "string" && batch.replacedByBatchId.trim()
        ? batch.replacedByBatchId.trim()
        : null,
    shiftCount:
      typeof batch?.shiftCount === "number" && Number.isFinite(batch.shiftCount)
        ? batch.shiftCount
        : Array.isArray(batch?.shiftIds)
          ? batch.shiftIds.length
          : 0,
    totalPayableHours:
      typeof batch?.totalPayableHours === "number" && Number.isFinite(batch.totalPayableHours)
        ? Number(batch.totalPayableHours.toFixed(2))
        : 0,
    filters:
      batch?.filters && typeof batch.filters === "object" && !Array.isArray(batch.filters)
        ? batch.filters
        : {},
    shiftIds:
      Array.isArray(batch?.shiftIds)
        ? batch.shiftIds.filter((item) => typeof item === "string" && item.trim())
        : [],
    rows: Array.isArray(batch?.rows) ? batch.rows : [],
    csvContent: typeof batch?.csvContent === "string" ? batch.csvContent : "",
    fileName:
      typeof batch?.fileName === "string" && batch.fileName.trim()
        ? batch.fileName.trim()
        : `payroll-export-${String(batch?.createdAt || new Date().toISOString()).slice(0, 10)}-${String(batch?.id || "batch").slice(0, 8)}.csv`,
  }));

  safe.schemaVersion = CURRENT_SCHEMA_VERSION;
  return safe;
}
