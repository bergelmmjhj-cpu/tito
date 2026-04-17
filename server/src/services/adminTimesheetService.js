import { listUsers } from "../models/userModel.js";
import { listWorkplaces } from "../models/workplaceModel.js";
import { listWorkplacesFromCrm } from "../models/crmWorkplaceModel.js";
import {
  createPayrollExportBatch,
  getPayrollExportBatchById,
  listPayrollExportBatches,
  reopenPayrollExportBatch,
} from "../models/payrollExportBatchModel.js";
import {
  createPayrollPeriod,
  getPayrollPeriodById,
  getPayrollPeriodForBusinessDate,
  listPayrollPeriods,
  lockPayrollPeriod,
  reopenPayrollPeriod,
} from "../models/payrollPeriodModel.js";
import {
  applyAdminShiftResolution,
  getAllShifts,
  getAllTimeLogs,
  getShiftById,
  setShiftClockInGeofence,
  getTimeLogsForShift,
} from "../models/timeLogModel.js";
import { buildShiftHourSummary } from "./payableHoursService.js";
import { calculateDistanceMeters } from "./geofenceService.js";
import { HttpError } from "../utils/errors.js";
import { formatBusinessDate, resolveBusinessTimeZone } from "../utils/time.js";

const LOW_ACCURACY_THRESHOLD_METERS = 50;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const REVIEW_STATUSES = new Set(["pending", "approved", "rejected", "needs_correction"]);
const PAYROLL_STATUSES = new Set(["pending", "approved", "exported"]);
const MANUAL_PAYROLL_STATUSES = new Set(["pending", "approved"]);
const ADMIN_REVIEW_NOTE_MAX_LENGTH = 1000;
const PAYROLL_BATCH_NOTE_MAX_LENGTH = 1000;
const PAYROLL_PERIOD_LABEL_MAX_LENGTH = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveShiftStatus(shift) {
  const openBreak = Array.isArray(shift.breaks) && shift.breaks.find((b) => b.startAt && !b.endAt);
  if (openBreak) return "missing_break_end";
  if (!shift.clockOutAt) return "open_shift";
  return "completed";
}

function hasActiveBreak(shift) {
  return Boolean(Array.isArray(shift?.breaks) && shift.breaks.find((item) => item.startAt && !item.endAt));
}

async function buildWorkplaceIndex() {
  const index = {};
  try {
    const workplaces = await listWorkplacesFromCrm();
    workplaces.forEach((wp) => {
      index[wp.id] = wp;
    });
  } catch {
    // non-fatal — workplace data may be unavailable
  }

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

function buildTimesheetRow(shift, user, shiftLogs, workplaceIndex, userIndex = {}, payPeriod = null) {
  const clockInLog = firstLogOfType(shiftLogs, "clock_in");
  const clockOutLog = firstLogOfType(shiftLogs, "clock_out");

  const clockInLocation = clockInLog?.location || null;
  const noLocation = !clockInLocation;
  const lowAccuracy =
    clockInLocation?.accuracy != null &&
    Number.isFinite(clockInLocation.accuracy) &&
    clockInLocation.accuracy > LOW_ACCURACY_THRESHOLD_METERS;

  const geofence = clockInLog?.geofence || null;
  const resolvedWorkplaceId = geofence?.resolvedWorkplaceId || null;
  const resolvedWorkplaceName = geofence?.resolvedWorkplaceName || null;
  const workplaceResolution = geofence?.workplaceResolution || "unresolved";
  const assignedWorkplaceUsed = Boolean(geofence?.assignedWorkplaceUsed);
  const geofenceMatched = typeof geofence?.geofenceMatched === "boolean" ? geofence.geofenceMatched : null;
  const outsideGeofence = geofence?.reviewFlag === "outside_geofence";
  const unresolvedWorkplace = workplaceResolution === "unresolved";
  const reviewFlag = geofence?.reviewFlag || (unresolvedWorkplace ? "workplace_unresolved" : null);

  const workplaceId =
    resolvedWorkplaceId || geofence?.workplaceId || user?.profile?.assignedWorkplaceId || null;
  const workplace = workplaceId ? workplaceIndex[workplaceId] || null : null;
  const workplaceName =
    resolvedWorkplaceName ||
    geofence?.workplaceName ||
    (workplace ? workplace.name || null : null);
  const businessTimeZone = resolveBusinessTimeZone(
    shift?.businessTimeZone || geofence?.businessTimeZone || workplace?.timeZone
  );
  const businessDate = shift?.businessDate || formatBusinessDate(shift.clockInAt, businessTimeZone);

  const summary = buildShiftHourSummary(shift);
  const status = deriveShiftStatus(shift);
  const finalActualHours = typeof shift?.actualHours === "number" ? shift.actualHours : summary.actualHours;
  const finalPayableHours = typeof shift?.payableHours === "number" ? shift.payableHours : summary.payableHours;
  const payableHoursAdjusted =
    summary.payableHours !== null &&
    typeof finalPayableHours === "number" &&
    Number(finalPayableHours.toFixed(2)) !== Number(summary.payableHours.toFixed(2));
  const hasException =
    noLocation ||
    lowAccuracy ||
    outsideGeofence ||
    unresolvedWorkplace ||
    status === "open_shift" ||
    status === "missing_break_end";
  const reviewStatus = shift?.reviewStatus || null;
  const reviewPending = hasException && (!reviewStatus || reviewStatus === "pending");
  const reviewedByName = shift?.reviewedBy ? userIndex[shift.reviewedBy]?.name || null : null;
  const payrollStatus = PAYROLL_STATUSES.has(shift?.payrollStatus) ? shift.payrollStatus : "pending";
  const payrollApprovedByName = shift?.payrollApprovedBy
    ? userIndex[shift.payrollApprovedBy]?.name || null
    : null;
  const payrollExportedByName = shift?.payrollExportedBy
    ? userIndex[shift.payrollExportedBy]?.name || null
    : null;
  const readyForPayroll = status === "completed" && reviewStatus === "approved";

  return {
    shiftId: shift.id,
    workerId: shift.userId,
    workerName: user?.name || "Unknown",
    workerEmail: user?.email || null,
    workerStaffId: user?.staffId || null,
    date: businessDate,
    businessTimeZone,
    payPeriodId: payPeriod?.id || null,
    payPeriodLabel: payPeriod?.label || null,
    payPeriodStatus: payPeriod?.status || null,
    payPeriodStartDate: payPeriod?.startDate || null,
    payPeriodEndDate: payPeriod?.endDate || null,
    status,
    clockInAt: shift.clockInAt || null,
    clockOutAt: shift.clockOutAt || null,
    breakStartAt: (shift.breaks || []).map((b) => b.startAt || null).filter(Boolean),
    breakEndAt: (shift.breaks || []).map((b) => b.endAt || null).filter(Boolean),
    rawDuration: summary.rawDuration,
    actualHours: finalActualHours,
    payableHours: finalPayableHours,
    systemPayableHours: summary.payableHours,
    payableHoursAdjusted,
    totalHours: finalActualHours,
    totalMinutes: summary.workedMinutes,
    breakMinutes: summary.breakMinutes,
    workplaceId: workplaceId || null,
    workplaceName: workplaceName || (unresolvedWorkplace ? "Workplace unresolved" : null),
    workplaceResolution,
    assignedWorkplaceUsed,
    geofenceMatched,
    outsideGeofence,
    unresolvedWorkplace,
    reviewFlag,
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
    hasActiveBreak: hasActiveBreak(shift),
    reviewStatus,
    reviewPending,
    reviewNote: shift?.reviewNote || null,
    reviewedAt: shift?.reviewedAt || null,
    reviewedByUserId: shift?.reviewedBy || null,
    reviewedByName,
    payrollStatus,
    readyForPayroll,
    payrollApprovedByUserId: shift?.payrollApprovedBy || null,
    payrollApprovedByName,
    payrollApprovedAt: shift?.payrollApprovedAt || null,
    payrollExportBatchId: shift?.payrollExportBatchId || null,
    payrollExportedByUserId: shift?.payrollExportedBy || null,
    payrollExportedByName,
    payrollExportedAt: shift?.payrollExportedAt || null,
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
  if (status === "outside_geofence") return row.outsideGeofence;
  if (status === "workplace_unresolved") return row.unresolvedWorkplace;
  if (status === "pending_review") return row.reviewPending || row.reviewStatus === "pending";
  if (status === "pending") return row.reviewStatus === "pending";
  if (status === "approved") return row.reviewStatus === "approved";
  if (status === "rejected") return row.reviewStatus === "rejected";
  if (status === "needs_correction") return row.reviewStatus === "needs_correction";
  return row.status === status;
}

function matchesPayrollStatus(row, payrollStatus) {
  if (!payrollStatus) return true;
  return row.payrollStatus === payrollStatus;
}

function isEligibleForPayrollExport(row) {
  return row?.status === "completed" && row?.reviewStatus === "approved" && row?.payrollStatus === "approved";
}

function normalizeReviewStatus(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "reviewed") return "approved";
  if (normalized === "follow_up_required") return "needs_correction";
  if (!REVIEW_STATUSES.has(normalized)) {
    throw new HttpError(400, "reviewStatus must be one of: pending, approved, rejected, needs_correction");
  }
  return normalized;
}

function normalizeReviewNote(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "reviewNote is required");
  }

  return value.trim().slice(0, ADMIN_REVIEW_NOTE_MAX_LENGTH);
}

function normalizePayrollBatchNote(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "note is required");
  }

  return value.trim().slice(0, PAYROLL_BATCH_NOTE_MAX_LENGTH);
}

function parseOptionalIsoDateTime(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} must be a valid ISO date string`);
  }

  const parsed = Date.parse(value.trim());
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${label} must be a valid ISO date string`);
  }

  return new Date(parsed).toISOString();
}

function parseOptionalPayableHours(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 48) {
    throw new HttpError(400, "payableHours must be a number between 0 and 48");
  }

  return Number(parsed.toFixed(2));
}

function parseOptionalPayrollStatus(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!MANUAL_PAYROLL_STATUSES.has(normalized)) {
    throw new HttpError(400, "payrollStatus must be one of: pending, approved");
  }
  return normalized;
}

function sanitizeExportFilters(filters) {
  return {
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    payPeriodId: filters.payPeriodId || null,
    workerId: filters.workerId || null,
    search: filters.search || null,
    workplaceId: filters.workplaceId || null,
    status: filters.status || "",
    payrollStatus: filters.payrollStatus || "",
  };
}

function normalizePayrollPeriodLabel(value, startDate, endDate) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, PAYROLL_PERIOD_LABEL_MAX_LENGTH);
  }

  return `${startDate} to ${endDate}`;
}

function parseRequiredBusinessDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError(400, `${label} must use YYYY-MM-DD format`);
  }

  return value.trim();
}

function findPayrollPeriodForDate(businessDate, periods) {
  if (typeof businessDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return null;
  }

  return periods.find((period) => period.startDate <= businessDate && period.endDate >= businessDate) || null;
}

function buildPayrollPeriodIndex(periods) {
  return periods.reduce((index, period) => {
    index[period.id] = period;
    return index;
  }, {});
}

function createEmptyPayrollPeriodCounts() {
  return {
    shiftCount: 0,
    readyCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    exportedCount: 0,
  };
}

function buildPayrollPeriodCounts(periods, rows) {
  const counts = new Map(periods.map((period) => [period.id, createEmptyPayrollPeriodCounts()]));

  for (const row of rows) {
    if (!row?.payPeriodId || !counts.has(row.payPeriodId)) continue;
    const summary = counts.get(row.payPeriodId);
    summary.shiftCount += 1;
    if (row.readyForPayroll && row.payrollStatus !== "exported") {
      summary.readyCount += 1;
    }
    if (row.payrollStatus === "pending") summary.pendingCount += 1;
    if (row.payrollStatus === "approved") summary.approvedCount += 1;
    if (row.payrollStatus === "exported") summary.exportedCount += 1;
  }

  return counts;
}

function assertEditablePayPeriod(period) {
  if (period?.status === "locked") {
    throw new HttpError(409, `Pay period ${period.label} is locked. Reopen the pay period before making changes.`);
  }
}

function resolveExportPayPeriod(rows, requestedPayPeriodId, payPeriodIndex) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(409, "No payroll-approved shifts are available in the current filtered view");
  }

  if (rows.some((row) => !row?.payPeriodId)) {
    throw new HttpError(409, "Every exported shift must belong to a pay period. Create a pay period covering these business dates first.");
  }

  const distinctPeriodIds = [...new Set(rows.map((row) => row.payPeriodId))];

  if (requestedPayPeriodId && distinctPeriodIds.some((periodId) => periodId !== requestedPayPeriodId)) {
    throw new HttpError(409, "Payroll export filters span multiple pay periods. Filter to a single pay period before exporting.");
  }

  if (!requestedPayPeriodId && distinctPeriodIds.length > 1) {
    throw new HttpError(409, "Payroll export filters span multiple pay periods. Filter to a single pay period before exporting.");
  }

  const targetPeriodId = requestedPayPeriodId || distinctPeriodIds[0] || null;
  if (!targetPeriodId) {
    throw new HttpError(409, "Select or create a pay period before exporting payroll.");
  }

  const payPeriod = payPeriodIndex[targetPeriodId] || null;
  if (!payPeriod) {
    throw new HttpError(404, "Pay period not found");
  }

  if (payPeriod.status !== "open") {
    throw new HttpError(409, `Pay period ${payPeriod.label} is locked. Reopen it before exporting payroll.`);
  }

  return payPeriod;
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const d = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getFilteredTimesheetRows(filters) {
  const [users, workplaces, shifts, timeLogs, payrollPeriods] = await Promise.all([
    buildUserIndex(),
    buildWorkplaceIndex(),
    getAllShifts(),
    getAllTimeLogs(),
    listPayrollPeriods(MAX_PAGE_LIMIT),
  ]);
  const userIndex = users;
  const workplaceIndex = workplaces;
  const logsByShift = buildLogsByShift(timeLogs || []);
  const periods = payrollPeriods || [];

  const rows = (shifts || []).map((shift) =>
    buildTimesheetRow(
      shift,
      userIndex[shift.userId] || null,
      logsByShift[shift.id] || [],
      workplaceIndex,
      userIndex,
      findPayrollPeriodForDate(shift.businessDate, periods)
    )
  );

  return rows.filter((row) => {
    if (filters.payPeriodId && row.payPeriodId !== filters.payPeriodId) return false;
    if (filters.workerId && row.workerId !== filters.workerId) return false;
    if (filters.search && !matchesSearch(row, filters.search)) return false;
    if (filters.workplaceId && row.workplaceId !== filters.workplaceId) return false;
    if (filters.status && !matchesStatus(row, filters.status)) return false;
    if (filters.payrollStatus && !matchesPayrollStatus(row, filters.payrollStatus)) return false;
    if (filters.dateFrom && (!row.date || row.date < filters.dateFrom)) return false;
    if (filters.dateTo && (!row.date || row.date > filters.dateTo)) return false;
    return true;
  });
}

async function getTimesheetRowsByShiftIds(shiftIds) {
  const rows = await getFilteredTimesheetRows({});
  const rowIndex = new Map(rows.map((row) => [row.shiftId, row]));
  return shiftIds.map((shiftId) => rowIndex.get(shiftId) || null);
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
    payPeriodId,
    workerId,
    search,
    workplaceId,
    status,
    payrollStatus,
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
    "outside_geofence",
    "workplace_unresolved",
    "pending_review",
    "pending",
    "approved",
    "rejected",
    "needs_correction",
    "",
  ]);
  const cleanStatus = typeof status === "string" && allowedStatuses.has(status) ? status : "";
  const cleanPayrollStatus =
    typeof payrollStatus === "string" && PAYROLL_STATUSES.has(payrollStatus.trim().toLowerCase())
      ? payrollStatus.trim().toLowerCase()
      : "";

  const dateFromParsed = parseDate(dateFrom);
  const dateToParsed = parseDate(dateTo);

  if (dateFrom && !dateFromParsed) {
    throw new HttpError(400, "dateFrom must use YYYY-MM-DD format");
  }

  if (dateTo && !dateToParsed) {
    throw new HttpError(400, "dateTo must use YYYY-MM-DD format");
  }

  if (dateFromParsed && dateToParsed && dateFromParsed > dateToParsed) {
    throw new HttpError(400, "dateFrom must be on or before dateTo");
  }

  return {
    dateFrom: dateFromParsed ? dateFromParsed.toISOString().slice(0, 10) : null,
    dateTo: dateToParsed ? dateToParsed.toISOString().slice(0, 10) : null,
    payPeriodId: typeof payPeriodId === "string" && payPeriodId.trim() ? payPeriodId.trim() : null,
    workerId: typeof workerId === "string" && workerId.trim() ? workerId.trim() : null,
    search: typeof search === "string" && search.trim() ? search.trim() : null,
    workplaceId: typeof workplaceId === "string" && workplaceId.trim() ? workplaceId.trim() : null,
    status: cleanStatus,
    payrollStatus: cleanPayrollStatus,
    page: parsedPage,
    limit: parsedLimit,
  };
}

/**
 * Returns a paginated list of timesheet rows for all workers.
 */
export async function listAdminTimesheets(filters) {
  const filtered = await getFilteredTimesheetRows(filters);

  console.info("[admin.timesheets] rows built", {
    filters,
    rowCount: filtered.length,
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

export async function getAdminPayrollSummary(filters) {
  const rows = await getFilteredTimesheetRows(filters);
  const closedRows = rows.filter((row) => row.status === "completed");

  const totalActualHours = Number(
    closedRows.reduce((sum, row) => sum + (row.actualHours || 0), 0).toFixed(2)
  );
  const totalPayableHours = Number(
    closedRows.reduce((sum, row) => sum + (row.payableHours || 0), 0).toFixed(2)
  );

  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    filters: {
      payPeriodId: filters.payPeriodId,
      workerId: filters.workerId,
      search: filters.search,
      workplaceId: filters.workplaceId,
      status: filters.status,
      payrollStatus: filters.payrollStatus,
    },
    totals: {
      shiftCount: rows.length,
      completedShiftCount: closedRows.length,
      totalActualHours,
      totalPayableHours,
      payableDeltaHours: Number((totalPayableHours - totalActualHours).toFixed(2)),
    },
    payroll: {
      readyForPayrollCount: rows.filter((row) => row.readyForPayroll && row.payrollStatus === "pending").length,
      pendingCount: rows.filter((row) => row.payrollStatus === "pending").length,
      approvedCount: rows.filter((row) => row.payrollStatus === "approved").length,
      exportedCount: rows.filter((row) => row.payrollStatus === "exported").length,
      approvedPayableHours: Number(
        rows
          .filter((row) => row.payrollStatus === "approved")
          .reduce((sum, row) => sum + (row.payableHours || 0), 0)
          .toFixed(2)
      ),
      exportedPayableHours: Number(
        rows
          .filter((row) => row.payrollStatus === "exported")
          .reduce((sum, row) => sum + (row.payableHours || 0), 0)
          .toFixed(2)
      ),
    },
  };
}

function buildCsvFromRows(rows) {
  const header = CSV_COLUMNS.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map((c) => escapeCsvCell(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

function enrichPayrollExportBatch(batch, userIndex, payPeriodIndex = {}) {
  const payPeriod = batch.payPeriodId ? payPeriodIndex[batch.payPeriodId] || null : null;

  return {
    ...batch,
    createdByName: batch.createdBy ? userIndex[batch.createdBy]?.name || null : null,
    reopenedByName: batch.reopenedBy ? userIndex[batch.reopenedBy]?.name || null : null,
    payPeriodLabel: payPeriod?.label || null,
    payPeriodStatus: payPeriod?.status || null,
    payPeriodStartDate: payPeriod?.startDate || null,
    payPeriodEndDate: payPeriod?.endDate || null,
  };
}

function summarizeRelatedPayrollBatch(batch, userIndex, payPeriodIndex = {}) {
  if (!batch) return null;
  const payPeriod = batch.payPeriodId ? payPeriodIndex[batch.payPeriodId] || null : null;
  return {
    id: batch.id,
    status: batch.status,
    createdAt: batch.createdAt,
    createdByName: batch.createdBy ? userIndex[batch.createdBy]?.name || null : null,
    fileName: batch.fileName,
    payPeriodLabel: payPeriod?.label || null,
  };
}

function enrichPayrollPeriod(period, userIndex, counts = createEmptyPayrollPeriodCounts()) {
  return {
    ...period,
    createdByName: period.createdBy ? userIndex[period.createdBy]?.name || null : null,
    lockedByName: period.lockedBy ? userIndex[period.lockedBy]?.name || null : null,
    reopenedByName: period.reopenedBy ? userIndex[period.reopenedBy]?.name || null : null,
    counts,
  };
}

export async function listAdminPayrollExportBatches(limit = 10) {
  const [batches, userIndex, payPeriods] = await Promise.all([
    listPayrollExportBatches(limit),
    buildUserIndex(),
    listPayrollPeriods(MAX_PAGE_LIMIT),
  ]);
  const payPeriodIndex = buildPayrollPeriodIndex(payPeriods);
  return batches.map((batch) => enrichPayrollExportBatch(batch, userIndex, payPeriodIndex));
}

export async function listAdminPayrollPeriods(limit = 12) {
  const [periods, userIndex, rows] = await Promise.all([
    listPayrollPeriods(limit),
    buildUserIndex(),
    getFilteredTimesheetRows({}),
  ]);
  const counts = buildPayrollPeriodCounts(periods, rows);
  return periods.map((period) => enrichPayrollPeriod(period, userIndex, counts.get(period.id)));
}

export async function getAdminPayrollPeriodDetail(periodId) {
  if (!periodId || typeof periodId !== "string") {
    throw new HttpError(400, "periodId is required");
  }

  const [period, userIndex, rows] = await Promise.all([
    getPayrollPeriodById(periodId),
    buildUserIndex(),
    getFilteredTimesheetRows({ payPeriodId: periodId }),
  ]);
  if (!period) throw new HttpError(404, "Pay period not found");

  const counts = buildPayrollPeriodCounts([period], rows);
  return enrichPayrollPeriod(period, userIndex, counts.get(period.id));
}

export function parsePayrollPeriodPayload(payload = {}) {
  const startDate = parseRequiredBusinessDate(payload.startDate, "startDate");
  const endDate = parseRequiredBusinessDate(payload.endDate, "endDate");

  if (startDate > endDate) {
    throw new HttpError(400, "startDate must be on or before endDate");
  }

  return {
    startDate,
    endDate,
    label: normalizePayrollPeriodLabel(payload.label, startDate, endDate),
  };
}

export async function createAdminPayrollPeriod(payload, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const parsed = parsePayrollPeriodPayload(payload || {});
  const period = await createPayrollPeriod({
    actorUserId: actor.id,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    label: parsed.label,
  });
  return getAdminPayrollPeriodDetail(period.id);
}

export async function lockAdminPayrollPeriod(periodId, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const currentPeriod = await getAdminPayrollPeriodDetail(periodId);
  if ((currentPeriod.counts?.readyCount || 0) > 0) {
    throw new HttpError(
      409,
      `Pay period ${currentPeriod.label} still has ${currentPeriod.counts.readyCount} payroll-ready shift(s) that are not exported.`
    );
  }

  await lockPayrollPeriod(periodId, actor.id);
  return getAdminPayrollPeriodDetail(periodId);
}

export async function reopenAdminPayrollPeriod(periodId, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  await reopenPayrollPeriod(periodId, actor.id);
  return getAdminPayrollPeriodDetail(periodId);
}

export async function getAdminPayrollExportBatchDetail(batchId) {
  if (!batchId || typeof batchId !== "string") {
    throw new HttpError(400, "batchId is required");
  }

  const [batch, userIndex, payPeriods] = await Promise.all([
    getPayrollExportBatchById(batchId),
    buildUserIndex(),
    listPayrollPeriods(MAX_PAGE_LIMIT),
  ]);
  if (!batch) throw new HttpError(404, "Payroll export batch not found");
  const payPeriodIndex = buildPayrollPeriodIndex(payPeriods);

  const [supersedesBatch, replacedByBatch] = await Promise.all([
    batch.supersedesBatchId ? getPayrollExportBatchById(batch.supersedesBatchId) : Promise.resolve(null),
    batch.replacedByBatchId ? getPayrollExportBatchById(batch.replacedByBatchId) : Promise.resolve(null),
  ]);

  return {
    ...enrichPayrollExportBatch(batch, userIndex, payPeriodIndex),
    supersedesBatch: summarizeRelatedPayrollBatch(supersedesBatch, userIndex, payPeriodIndex),
    replacedByBatch: summarizeRelatedPayrollBatch(replacedByBatch, userIndex, payPeriodIndex),
  };
}

export async function getAdminPayrollExportBatchCsv(batchId) {
  if (!batchId || typeof batchId !== "string") {
    throw new HttpError(400, "batchId is required");
  }

  const batch = await getPayrollExportBatchById(batchId);
  if (!batch) throw new HttpError(404, "Payroll export batch not found");
  return batch;
}

export function parsePayrollExportBatchActionPayload(payload = {}) {
  return {
    note: normalizePayrollBatchNote(payload.note),
  };
}

export async function createAdminPayrollExportBatch(filters, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const [rows, payPeriods] = await Promise.all([
    getFilteredTimesheetRows({
      ...filters,
      page: 1,
      limit: MAX_PAGE_LIMIT * 100,
    }),
    listPayrollPeriods(MAX_PAGE_LIMIT),
  ]);
  const exportRows = rows.filter(isEligibleForPayrollExport);

  if (exportRows.length === 0) {
    throw new HttpError(409, "No payroll-approved shifts are available in the current filtered view");
  }

  const payPeriodIndex = buildPayrollPeriodIndex(payPeriods);
  const payPeriod = resolveExportPayPeriod(exportRows, filters.payPeriodId, payPeriodIndex);

  const csvContent = buildCsvFromRows(exportRows);
  const batch = await createPayrollExportBatch({
    actorUserId: actor.id,
    filters: sanitizeExportFilters({ ...filters, payPeriodId: payPeriod.id }),
    rows: exportRows,
    csvContent,
    payPeriodId: payPeriod.id,
  });

  const userIndex = await buildUserIndex();
  return enrichPayrollExportBatch(batch, userIndex, payPeriodIndex);
}

export async function reopenAdminPayrollExportBatch(batchId, payload, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const currentBatch = await getPayrollExportBatchById(batchId);
  if (!currentBatch) throw new HttpError(404, "Payroll export batch not found");
  if (currentBatch.payPeriodId) {
    const payPeriod = await getPayrollPeriodById(currentBatch.payPeriodId);
    if (payPeriod?.status === "locked") {
      throw new HttpError(409, `Pay period ${payPeriod.label} is locked. Reopen the pay period before reopening its payroll export batch.`);
    }
  }

  const parsed = parsePayrollExportBatchActionPayload(payload || {});
  await reopenPayrollExportBatch(batchId, actor.id, parsed.note);
  return getAdminPayrollExportBatchDetail(batchId);
}

export async function reissueAdminPayrollExportBatch(batchId, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const currentBatch = await getPayrollExportBatchById(batchId);
  if (!currentBatch) throw new HttpError(404, "Payroll export batch not found");
  if (currentBatch.status !== "reopened") {
    throw new HttpError(409, "Payroll export batch must be reopened before it can be reissued");
  }
  if (currentBatch.payPeriodId) {
    const payPeriod = await getPayrollPeriodById(currentBatch.payPeriodId);
    if (payPeriod?.status === "locked") {
      throw new HttpError(409, `Pay period ${payPeriod.label} is locked. Reopen the pay period before reissuing payroll.`);
    }
  }

  const currentRows = await getTimesheetRowsByShiftIds(currentBatch.shiftIds || []);
  if (currentRows.some((row) => !row)) {
    throw new HttpError(404, "One or more shifts from the original payroll export batch could not be found");
  }

  const exportRows = currentRows.filter((row) => row && isEligibleForPayrollExport(row));
  if (exportRows.length !== currentBatch.shiftIds.length) {
    throw new HttpError(409, "All shifts in the reopened payroll export batch must be approved again before reissue");
  }

  const csvContent = buildCsvFromRows(exportRows);
  const replacementBatch = await createPayrollExportBatch({
    actorUserId: actor.id,
    filters: currentBatch.filters || {},
    rows: exportRows,
    csvContent,
    payPeriodId: currentBatch.payPeriodId || null,
    supersedesBatchId: currentBatch.id,
  });

  return getAdminPayrollExportBatchDetail(replacementBatch.id);
}

/**
 * Returns full detail for a single shift: the timesheet row + all raw action logs.
 */
export async function getAdminTimesheetDetail(shiftId) {
  if (!shiftId || typeof shiftId !== "string") throw new HttpError(400, "shiftId is required");

  const shift = await getShiftById(shiftId);
  if (!shift) throw new HttpError(404, "Shift not found");

  const [userIndex, workplaceIndex, shiftLogs, payPeriod] = await Promise.all([
    buildUserIndex(),
    buildWorkplaceIndex(),
    getTimeLogsForShift(shiftId),
    shift.businessDate ? getPayrollPeriodForBusinessDate(shift.businessDate) : Promise.resolve(null),
  ]);
  const user = userIndex[shift.userId] || null;

  const row = buildTimesheetRow(shift, user, shiftLogs, workplaceIndex, userIndex, payPeriod);

  // Build enriched action history
  const actions = shiftLogs
    .slice()
    .sort((a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""))
    .map((log) => ({
      id: log.id,
      actorUserId: log.userId,
      actorName: userIndex[log.userId]?.name || null,
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

export function parseTimesheetResolutionPayload(payload = {}) {
  const reviewStatus = normalizeReviewStatus(payload.reviewStatus);
  const closeOpenShiftAt = parseOptionalIsoDateTime(payload.closeOpenShiftAt, "closeOpenShiftAt");
  const closeActiveBreakAt = parseOptionalIsoDateTime(payload.closeActiveBreakAt, "closeActiveBreakAt");
  const payableHours = parseOptionalPayableHours(payload.payableHours);
  const payrollStatus = parseOptionalPayrollStatus(payload.payrollStatus);
  const overrideWorkplaceId =
    typeof payload.overrideWorkplaceId === "string" && payload.overrideWorkplaceId.trim()
      ? payload.overrideWorkplaceId.trim()
      : null;
  const retryGeofence = payload.retryGeofence === true;

  const hasOperationalChange = Boolean(
    closeOpenShiftAt || closeActiveBreakAt || payableHours !== null || payrollStatus
  );

  if (!reviewStatus && !hasOperationalChange) {
    throw new HttpError(400, "At least one resolution change is required");
  }

  const reviewNote = normalizeReviewNote(payload.reviewNote);
  if (reviewStatus === "rejected" || reviewStatus === "needs_correction") {
    if (!reviewNote || !reviewNote.trim()) {
      throw new HttpError(400, "reviewNote is required when status is rejected or needs_correction");
    }
  }

  return {
    reviewStatus,
    reviewNote,
    closeOpenShiftAt,
    closeActiveBreakAt,
    payableHours,
    payrollStatus,
    overrideWorkplaceId,
    retryGeofence,
    hasOperationalChange,
  };
}

function validateOverrideWorkplace(workplaceId, workplaceIndex) {
  if (!workplaceId) return null;
  const wp = workplaceIndex[workplaceId] || null;
  if (!wp) throw new HttpError(404, "overrideWorkplaceId not found");
  return wp;
}

function deriveRetryGeofencePayload(clockInLog, workplaceIndex) {
  const location = clockInLog?.location;
  if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
    throw new HttpError(409, "Cannot retry geofence because clock-in location is unavailable");
  }

  const candidates = Object.values(workplaceIndex || {}).filter((wp) => wp && wp.active !== false);
  if (candidates.length === 0) {
    throw new HttpError(409, "Cannot retry geofence because no active workplaces are available");
  }

  let best = null;
  for (const workplace of candidates) {
    if (typeof workplace.latitude !== "number" || typeof workplace.longitude !== "number") continue;
    const dist = calculateDistanceMeters(
      { latitude: location.latitude, longitude: location.longitude },
      { latitude: workplace.latitude, longitude: workplace.longitude }
    );
    if (!best || dist < best.distanceMeters) {
      best = {
        workplace,
        distanceMeters: dist,
      };
    }
  }

  if (!best) {
    throw new HttpError(409, "Cannot retry geofence because no valid workplace coordinates are available");
  }

  const radiusMeters = Number(best.workplace.geofenceRadiusMeters || 150);
  const withinGeofence = best.distanceMeters <= radiusMeters;
  return {
    workplaceId: best.workplace.id,
    workplaceName: best.workplace.name,
    resolvedWorkplaceId: best.workplace.id,
    resolvedWorkplaceName: best.workplace.name,
    businessTimeZone: resolveBusinessTimeZone(best.workplace.timeZone),
    radiusMeters,
    distanceMeters: Number(best.distanceMeters.toFixed(2)),
    withinGeofence,
    geofenceMatched: withinGeofence,
    workplaceResolution: withinGeofence ? "assigned" : "nearest",
    reviewFlag: withinGeofence ? null : "outside_geofence",
  };
}

export async function resolveAdminTimesheet(shiftId, payload, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const shift = await getShiftById(shiftId);
  if (!shift) throw new HttpError(404, "Shift not found");
  if (shift.businessDate) {
    const payPeriod = await getPayrollPeriodForBusinessDate(shift.businessDate);
    assertEditablePayPeriod(payPeriod);
  }

  const parsed = parseTimesheetResolutionPayload(payload);
  if (parsed.overrideWorkplaceId || parsed.retryGeofence) {
    const [workplaceIndex, logs] = await Promise.all([buildWorkplaceIndex(), getTimeLogsForShift(shiftId)]);
    const clockInLog = firstLogOfType(logs, "clock_in");
    if (!clockInLog) throw new HttpError(404, "Clock-in log not found for shift");

    let geofencePatch = null;
    if (parsed.overrideWorkplaceId) {
      const overrideWorkplace = validateOverrideWorkplace(parsed.overrideWorkplaceId, workplaceIndex);
      geofencePatch = {
        ...(clockInLog.geofence || {}),
        workplaceId: overrideWorkplace.id,
        workplaceName: overrideWorkplace.name,
        resolvedWorkplaceId: overrideWorkplace.id,
        resolvedWorkplaceName: overrideWorkplace.name,
        businessTimeZone: resolveBusinessTimeZone(overrideWorkplace.timeZone),
        workplaceResolution: "admin_override",
        reviewFlag: null,
      };
    } else if (parsed.retryGeofence) {
      geofencePatch = {
        ...(clockInLog.geofence || {}),
        ...deriveRetryGeofencePayload(clockInLog, workplaceIndex),
      };
    }

    if (geofencePatch) {
      await setShiftClockInGeofence(shiftId, geofencePatch);
    }
  }

  await applyAdminShiftResolution(shiftId, actor.id, {
    ...parsed,
    reviewStatus: parsed.reviewStatus || (parsed.hasOperationalChange ? "approved" : null),
  });

  return getAdminTimesheetDetail(shiftId);
}

export function parseBulkTimesheetResolutionPayload(payload = {}) {
  const shiftIds = Array.isArray(payload.shiftIds)
    ? payload.shiftIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  if (shiftIds.length === 0) {
    throw new HttpError(400, "shiftIds must include at least one shift id");
  }

  const resolution = parseTimesheetResolutionPayload(payload);
  return {
    shiftIds,
    resolution,
  };
}

export async function resolveAdminTimesheetsBulk(payload, actor) {
  if (!actor?.id) throw new HttpError(401, "Admin user is required");

  const parsed = parseBulkTimesheetResolutionPayload(payload || {});
  const summary = {
    total: parsed.shiftIds.length,
    succeeded: 0,
    failed: 0,
    failures: [],
  };

  // Pre-validate all shift ids first so the operation is effectively all-or-none.
  const shifts = await Promise.all(parsed.shiftIds.map((shiftId) => getShiftById(shiftId)));
  const missing = parsed.shiftIds.filter((_, idx) => !shifts[idx]);
  if (missing.length > 0) {
    throw new HttpError(404, `One or more shifts were not found: ${missing.join(", ")}`);
  }

  try {
    for (const shiftId of parsed.shiftIds) {
      await resolveAdminTimesheet(shiftId, parsed.resolution, actor);
      summary.succeeded += 1;
    }
  } catch (error) {
    summary.failed = parsed.shiftIds.length - summary.succeeded;
    summary.failures.push({
      message: error?.message || "bulk_resolve_failed",
    });
    throw new HttpError(409, `Bulk resolve failed after ${summary.succeeded} successful updates: ${error?.message || "unknown error"}`);
  }

  return summary;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  { header: "Shift ID", key: "shiftId" },
  { header: "Worker Name", key: "workerName" },
  { header: "Staff ID", key: "workerStaffId" },
  { header: "Email", key: "workerEmail" },
  { header: "Business Date", key: "date" },
  { header: "Business Time Zone", key: "businessTimeZone" },
  { header: "Pay Period", key: "payPeriodLabel" },
  { header: "Pay Period Status", key: "payPeriodStatus" },
  { header: "Status", key: "status" },
  { header: "Clock In", key: "clockInAt" },
  { header: "Clock Out", key: "clockOutAt" },
  { header: "Break Start(s)", key: "breakStartAt" },
  { header: "Break End(s)", key: "breakEndAt" },
  { header: "Raw Duration", key: "rawDuration" },
  { header: "Actual Hours", key: "actualHours" },
  { header: "Payable Hours", key: "payableHours" },
  { header: "System Payable Hours", key: "systemPayableHours" },
  { header: "Payable Hours Adjusted", key: "payableHoursAdjusted" },
  { header: "Workplace", key: "workplaceName" },
  { header: "Workplace Resolution", key: "workplaceResolution" },
  { header: "Assigned Workplace Used", key: "assignedWorkplaceUsed" },
  { header: "Geofence Matched", key: "geofenceMatched" },
  { header: "Review Flag", key: "reviewFlag" },
  { header: "Distance (m)", key: "distanceMeters" },
  { header: "Within Geofence", key: "withinGeofence" },
  { header: "Location Summary", key: "locationSummary" },
  { header: "Location Accuracy (m)", key: "locationAccuracy" },
  { header: "No Location", key: "noLocation" },
  { header: "Low Accuracy", key: "lowAccuracy" },
  { header: "Review Status", key: "reviewStatus" },
  { header: "Review Pending", key: "reviewPending" },
  { header: "Review Note", key: "reviewNote" },
  { header: "Reviewed At", key: "reviewedAt" },
  { header: "Reviewed By", key: "reviewedByName" },
  { header: "Payroll Status", key: "payrollStatus" },
  { header: "Payroll Approved At", key: "payrollApprovedAt" },
  { header: "Payroll Approved By", key: "payrollApprovedByName" },
  { header: "Payroll Exported At", key: "payrollExportedAt" },
  { header: "Payroll Exported By", key: "payrollExportedByName" },
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

  console.info("[admin.timesheets.csv] exporting rows", {
    filters: allFilters,
    rowCount: timesheets.length,
  });

  return buildCsvFromRows(timesheets);
}

function buildCsvFromColumns(rows, columns) {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsvCell(row[column.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export async function buildDailyAttendanceCsv(filters) {
  const allFilters = { ...filters, page: 1, limit: MAX_PAGE_LIMIT * 100 };
  const { timesheets } = await listAdminTimesheets(allFilters);

  const rows = timesheets.map((row) => ({
    date: row.date,
    workerName: row.workerName,
    workerStaffId: row.workerStaffId,
    workplaceName: row.workplaceName,
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
    status: row.status,
    reviewStatus: row.reviewStatus,
    payrollStatus: row.payrollStatus,
  }));

  return buildCsvFromColumns(rows, [
    { header: "Date", key: "date" },
    { header: "Worker Name", key: "workerName" },
    { header: "Staff ID", key: "workerStaffId" },
    { header: "Workplace", key: "workplaceName" },
    { header: "Clock In", key: "clockInAt" },
    { header: "Clock Out", key: "clockOutAt" },
    { header: "Shift Status", key: "status" },
    { header: "Review Status", key: "reviewStatus" },
    { header: "Payroll Status", key: "payrollStatus" },
  ]);
}

export async function buildPayrollCutoffCsv(filters) {
  const allFilters = { ...filters, page: 1, limit: MAX_PAGE_LIMIT * 100 };
  const { timesheets } = await listAdminTimesheets(allFilters);

  const rows = timesheets
    .filter((row) => row.status === "completed")
    .map((row) => ({
      payPeriodLabel: row.payPeriodLabel,
      date: row.date,
      workerName: row.workerName,
      workerStaffId: row.workerStaffId,
      workplaceName: row.workplaceName,
      actualHours: row.actualHours,
      payableHours: row.payableHours,
      reviewStatus: row.reviewStatus,
      payrollStatus: row.payrollStatus,
    }));

  return buildCsvFromColumns(rows, [
    { header: "Pay Period", key: "payPeriodLabel" },
    { header: "Date", key: "date" },
    { header: "Worker Name", key: "workerName" },
    { header: "Staff ID", key: "workerStaffId" },
    { header: "Workplace", key: "workplaceName" },
    { header: "Actual Hours", key: "actualHours" },
    { header: "Payable Hours", key: "payableHours" },
    { header: "Review Status", key: "reviewStatus" },
    { header: "Payroll Status", key: "payrollStatus" },
  ]);
}

export async function buildWorkerHoursSummaryCsv(filters) {
  const allFilters = { ...filters, page: 1, limit: MAX_PAGE_LIMIT * 100 };
  const { timesheets } = await listAdminTimesheets(allFilters);

  const byWorker = new Map();
  for (const row of timesheets) {
    const key = row.workerId || row.workerStaffId || row.workerName || "unknown";
    const current = byWorker.get(key) || {
      workerName: row.workerName,
      workerStaffId: row.workerStaffId,
      shiftCount: 0,
      totalActualHours: 0,
      totalPayableHours: 0,
      openShiftCount: 0,
      pendingReviewCount: 0,
    };

    current.shiftCount += 1;
    current.totalActualHours += Number(row.actualHours || 0);
    current.totalPayableHours += Number(row.payableHours || 0);
    if (row.status !== "completed") current.openShiftCount += 1;
    if (row.reviewPending) current.pendingReviewCount += 1;

    byWorker.set(key, current);
  }

  const rows = [...byWorker.values()].map((row) => ({
    ...row,
    totalActualHours: Number(row.totalActualHours.toFixed(2)),
    totalPayableHours: Number(row.totalPayableHours.toFixed(2)),
  }));

  return buildCsvFromColumns(rows, [
    { header: "Worker Name", key: "workerName" },
    { header: "Staff ID", key: "workerStaffId" },
    { header: "Shift Count", key: "shiftCount" },
    { header: "Total Actual Hours", key: "totalActualHours" },
    { header: "Total Payable Hours", key: "totalPayableHours" },
    { header: "Open Shift Count", key: "openShiftCount" },
    { header: "Pending Review Count", key: "pendingReviewCount" },
  ]);
}

export async function buildHotelHoursSummaryCsv(filters) {
  const allFilters = { ...filters, page: 1, limit: MAX_PAGE_LIMIT * 100 };
  const { timesheets } = await listAdminTimesheets(allFilters);

  const byHotel = new Map();
  for (const row of timesheets) {
    const key = row.workplaceName || "Unassigned";
    const current = byHotel.get(key) || {
      workplaceName: key,
      shiftCount: 0,
      totalActualHours: 0,
      totalPayableHours: 0,
      outsideGeofenceCount: 0,
    };

    current.shiftCount += 1;
    current.totalActualHours += Number(row.actualHours || 0);
    current.totalPayableHours += Number(row.payableHours || 0);
    if (row.outsideGeofence) current.outsideGeofenceCount += 1;

    byHotel.set(key, current);
  }

  const rows = [...byHotel.values()].map((row) => ({
    ...row,
    totalActualHours: Number(row.totalActualHours.toFixed(2)),
    totalPayableHours: Number(row.totalPayableHours.toFixed(2)),
  }));

  return buildCsvFromColumns(rows, [
    { header: "Workplace", key: "workplaceName" },
    { header: "Shift Count", key: "shiftCount" },
    { header: "Total Actual Hours", key: "totalActualHours" },
    { header: "Total Payable Hours", key: "totalPayableHours" },
    { header: "Outside Geofence Count", key: "outsideGeofenceCount" },
  ]);
}
