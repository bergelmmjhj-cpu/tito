import { readDatabase } from "../db/database.js";
import { listUsers } from "../models/userModel.js";
import { listWorkplaces, findWorkplaceById } from "../models/workplaceModel.js";
import { HttpError } from "../utils/errors.js";

const LOW_ACCURACY_THRESHOLD_METERS = 50;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateBreakMinutes(shift) {
  if (!Array.isArray(shift.breaks)) return 0;
  return shift.breaks.reduce((sum, b) => {
    if (!b.startAt || !b.endAt) return sum;
    return sum + (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000;
  }, 0);
}

function calculateWorkedMinutes(shift) {
  if (!shift.clockInAt || !shift.clockOutAt) return null;
  const total = (Date.parse(shift.clockOutAt) - Date.parse(shift.clockInAt)) / 60_000;
  return Math.max(0, total - calculateBreakMinutes(shift));
}

function deriveShiftStatus(shift) {
  const openBreak = Array.isArray(shift.breaks) && shift.breaks.find((b) => b.startAt && !b.endAt);
  if (openBreak) return "missing_break_end";
  if (!shift.clockOutAt) return "open_shift";
  return "completed";
}

async function buildWorkplaceIndex() {
  const index = {};
  try {
    const workplaces = await listWorkplaces();
    workplaces.forEach((wp) => {
      index[wp.id] = wp;
    });
  } catch {
    // non-fatal — workplace data may be unavailable
  }
  return index;
}

async function buildUserIndex() {
  const index = {};
  const users = await listUsers();
  users.forEach((u) => {
    index[u.id] = u;
  });
  return index;
}

/**
 * Groups time logs by shiftId for O(1) lookup.
 */
function buildLogsByShift(timeLogs) {
  const map = {};
  for (const log of timeLogs) {
    if (!map[log.shiftId]) map[log.shiftId] = [];
    map[log.shiftId].push(log);
  }
  return map;
}

function firstLogOfType(shiftLogs, actionType) {
  return (shiftLogs || []).find((l) => l.actionType === actionType) || null;
}

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

function buildTimesheetRow(shift, user, shiftLogs, workplaceIndex) {
  const clockInLog = firstLogOfType(shiftLogs, "clock_in");
  const clockOutLog = firstLogOfType(shiftLogs, "clock_out");

  const clockInLocation = clockInLog?.location || null;
  const noLocation = !clockInLocation;
  const lowAccuracy =
    clockInLocation?.accuracy != null &&
    Number.isFinite(clockInLocation.accuracy) &&
    clockInLocation.accuracy > LOW_ACCURACY_THRESHOLD_METERS;

  const geofence = clockInLog?.geofence || null;
  const workplaceId =
    geofence?.workplaceId || user?.profile?.assignedWorkplaceId || null;
  const workplaceName =
    geofence?.workplaceName ||
    (workplaceId ? workplaceIndex[workplaceId]?.name || null : null);

  const workedMinutes = calculateWorkedMinutes(shift);
  const status = deriveShiftStatus(shift);

  return {
    shiftId: shift.id,
    workerId: shift.userId,
    workerName: user?.name || "Unknown",
    workerEmail: user?.email || null,
    workerStaffId: user?.staffId || null,
    date: shift.clockInAt ? shift.clockInAt.slice(0, 10) : null,
    status,
    clockInAt: shift.clockInAt || null,
    clockOutAt: shift.clockOutAt || null,
    breakStartAt: (shift.breaks || []).map((b) => b.startAt || null).filter(Boolean),
    breakEndAt: (shift.breaks || []).map((b) => b.endAt || null).filter(Boolean),
    totalHours: workedMinutes != null ? Number((workedMinutes / 60).toFixed(2)) : null,
    totalMinutes: workedMinutes,
    workplaceId: workplaceId || null,
    workplaceName: workplaceName || null,
    distanceMeters: typeof geofence?.distanceMeters === "number" ? geofence.distanceMeters : null,
    withinGeofence: typeof geofence?.withinGeofence === "boolean" ? geofence.withinGeofence : null,
    locationSummary:
      clockInLocation &&
      typeof clockInLocation.latitude === "number" &&
      typeof clockInLocation.longitude === "number"
        ? `${clockInLocation.latitude.toFixed(5)}, ${clockInLocation.longitude.toFixed(5)}`
        : null,
    locationAccuracy: typeof clockInLocation?.accuracy === "number" ? clockInLocation.accuracy : null,
    noLocation,
    lowAccuracy,
    clockInNotes: clockInLog?.notes || null,
    clockOutNotes: clockOutLog?.notes || null,
    createdAt: shift.createdAt || null,
    updatedAt: shift.updatedAt || null,
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

function matchesSearch(row, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    (row.workerName || "").toLowerCase().includes(q) ||
    (row.workerEmail || "").toLowerCase().includes(q) ||
    (row.workerStaffId || "").toLowerCase().includes(q)
  );
}

function matchesStatus(row, status) {
  if (!status) return true;
  if (status === "no_location") return row.noLocation;
  if (status === "low_accuracy") return row.lowAccuracy;
  return row.status === status;
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates and sanitises query filter params from the HTTP request.
 */
export function parseTimesheetFilters(query) {
  const {
    dateFrom,
    dateTo,
    workerId,
    search,
    workplaceId,
    status,
    page,
    limit,
  } = query || {};

  const parsedPage = Math.max(1, Number.isInteger(Number(page)) ? Number(page) : 1);
  const parsedLimit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, Number.isInteger(Number(limit)) ? Number(limit) : DEFAULT_PAGE_LIMIT)
  );

  const allowedStatuses = new Set([
    "open_shift",
    "completed",
    "missing_break_end",
    "no_location",
    "low_accuracy",
    "",
  ]);
  const cleanStatus = typeof status === "string" && allowedStatuses.has(status) ? status : "";

  const dateFromParsed = parseDate(dateFrom);
  const dateToParsed = parseDate(dateTo);

  return {
    dateFrom: dateFromParsed ? dateFromParsed.toISOString().slice(0, 10) : null,
    dateTo: dateToParsed ? dateToParsed.toISOString().slice(0, 10) : null,
    workerId: typeof workerId === "string" && workerId.trim() ? workerId.trim() : null,
    search: typeof search === "string" && search.trim() ? search.trim() : null,
    workplaceId: typeof workplaceId === "string" && workplaceId.trim() ? workplaceId.trim() : null,
    status: cleanStatus,
    page: parsedPage,
    limit: parsedLimit,
  };
}

/**
 * Returns a paginated list of timesheet rows for all workers.
 */
export async function listAdminTimesheets(filters) {
  const db = readDatabase();
  const userIndex = await buildUserIndex();
  const workplaceIndex = await buildWorkplaceIndex();
  const logsByShift = buildLogsByShift(db.timeLogs || []);

  // Build all rows
  const rows = (db.shifts || []).map((shift) =>
    buildTimesheetRow(shift, userIndex[shift.userId] || null, logsByShift[shift.id] || [], workplaceIndex)
  );

  // Apply filters
  const filtered = rows.filter((row) => {
    if (filters.workerId && row.workerId !== filters.workerId) return false;
    if (filters.search && !matchesSearch(row, filters.search)) return false;
    if (filters.workplaceId && row.workplaceId !== filters.workplaceId) return false;
    if (filters.status && !matchesStatus(row, filters.status)) return false;
    if (filters.dateFrom && (!row.date || row.date < filters.dateFrom)) return false;
    if (filters.dateTo && (!row.date || row.date > filters.dateTo)) return false;
    return true;
  });

  // Sort newest first
  filtered.sort((a, b) => {
    const ta = a.clockInAt ? Date.parse(a.clockInAt) : 0;
    const tb = b.clockInAt ? Date.parse(b.clockInAt) : 0;
    return tb - ta;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / filters.limit) || 1;
  const start = (filters.page - 1) * filters.limit;
  const page = filtered.slice(start, start + filters.limit);

  return {
    timesheets: page,
    pagination: {
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages,
    },
  };
}

/**
 * Returns full detail for a single shift: the timesheet row + all raw action logs.
 */
export async function getAdminTimesheetDetail(shiftId) {
  if (!shiftId || typeof shiftId !== "string") throw new HttpError(400, "shiftId is required");

  const db = readDatabase();
  const shift = (db.shifts || []).find((s) => s.id === shiftId);
  if (!shift) throw new HttpError(404, "Shift not found");

  const userIndex = await buildUserIndex();
  const user = userIndex[shift.userId] || null;
  const workplaceIndex = await buildWorkplaceIndex();
  const shiftLogs = (db.timeLogs || []).filter((l) => l.shiftId === shiftId);

  const row = buildTimesheetRow(shift, user, shiftLogs, workplaceIndex);

  // Build enriched action history
  const actions = shiftLogs
    .slice()
    .sort((a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""))
    .map((log) => ({
      id: log.id,
      actionType: log.actionType,
      timestamp: log.timestamp,
      location: log.location
        ? {
            latitude: log.location.latitude,
            longitude: log.location.longitude,
            accuracy: log.location.accuracy,
            capturedAt: log.location.capturedAt,
          }
        : null,
      geofence: log.geofence || null,
      notes: log.notes || null,
    }));

  return { ...row, actions, breaks: shift.breaks || [] };
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  { header: "Shift ID", key: "shiftId" },
  { header: "Worker Name", key: "workerName" },
  { header: "Staff ID", key: "workerStaffId" },
  { header: "Email", key: "workerEmail" },
  { header: "Date", key: "date" },
  { header: "Status", key: "status" },
  { header: "Clock In", key: "clockInAt" },
  { header: "Clock Out", key: "clockOutAt" },
  { header: "Break Start(s)", key: "breakStartAt" },
  { header: "Break End(s)", key: "breakEndAt" },
  { header: "Total Hours", key: "totalHours" },
  { header: "Workplace", key: "workplaceName" },
  { header: "Distance (m)", key: "distanceMeters" },
  { header: "Within Geofence", key: "withinGeofence" },
  { header: "Location Summary", key: "locationSummary" },
  { header: "Location Accuracy (m)", key: "locationAccuracy" },
  { header: "No Location", key: "noLocation" },
  { header: "Low Accuracy", key: "lowAccuracy" },
  { header: "Clock In Notes", key: "clockInNotes" },
  { header: "Clock Out Notes", key: "clockOutNotes" },
];

function escapeCsvCell(value) {
  if (value == null) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  // Escape double quotes and wrap if needed
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function buildTimesheetsCsv(filters) {
  // Fetch all without pagination for CSV
  const allFilters = { ...filters, page: 1, limit: MAX_PAGE_LIMIT * 100 };
  const { timesheets } = await listAdminTimesheets(allFilters);

  const header = CSV_COLUMNS.map((c) => escapeCsvCell(c.header)).join(",");
  const rows = timesheets.map((row) =>
    CSV_COLUMNS.map((c) => escapeCsvCell(row[c.key])).join(",")
  );

  return [header, ...rows].join("\r\n");
}
