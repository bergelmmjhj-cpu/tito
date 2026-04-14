import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { buildShiftHourSummary } from "../services/payableHoursService.js";
import { formatBusinessDate, nowIso, resolveBusinessTimeZone } from "../utils/time.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";
import { HttpError } from "../utils/errors.js";

const ADMIN_RESOLUTION_ACTIONS = {
  review: "admin_review",
  closeShift: "admin_close_shift",
  endBreak: "admin_end_break",
  adjustPayableHours: "admin_payable_adjustment",
  approvePayroll: "admin_payroll_approved",
  exportPayroll: "admin_payroll_exported",
  reopenPayroll: "admin_payroll_reopened",
};

const PAYROLL_STATUSES = new Set(["pending", "approved", "exported"]);

function normalizePayrollStatus(value) {
  return PAYROLL_STATUSES.has(value) ? value : "pending";
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object") return null;

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    capturedAt: location.capturedAt,
  };
}

function normalizeGeofence(geofence) {
  if (!geofence || typeof geofence !== "object") return null;

  return {
    workplaceId: geofence.workplaceId || null,
    workplaceName: geofence.workplaceName || null,
    businessTimeZone: geofence.businessTimeZone || null,
    radiusMeters:
      typeof geofence.radiusMeters === "number" && Number.isFinite(geofence.radiusMeters)
        ? geofence.radiusMeters
        : null,
    distanceMeters:
      typeof geofence.distanceMeters === "number" && Number.isFinite(geofence.distanceMeters)
        ? geofence.distanceMeters
        : null,
    withinGeofence: typeof geofence.withinGeofence === "boolean" ? geofence.withinGeofence : null,
    enforcementEnabled:
      typeof geofence.enforcementEnabled === "boolean" ? geofence.enforcementEnabled : false,
  };
}

function normalizeDbShift(dbShift, breaks = []) {
  const normalizedBreaks = breaks.map((b) => ({
    id: b.id,
    startAt: normalizeTimestamp(b.start_at),
    endAt: normalizeTimestamp(b.end_at),
  }));
  const summary = buildShiftHourSummary({
    clockInAt: normalizeTimestamp(dbShift.clock_in_at),
    clockOutAt: normalizeTimestamp(dbShift.clock_out_at),
    breaks: normalizedBreaks,
  });

  return {
    id: dbShift.id,
    userId: dbShift.user_id,
    clockInAt: normalizeTimestamp(dbShift.clock_in_at),
    clockOutAt: normalizeTimestamp(dbShift.clock_out_at),
    businessDate: dbShift.business_date || null,
    businessTimeZone: dbShift.business_time_zone || null,
    actualHours: toNumberOrNull(dbShift.actual_hours) ?? summary.actualHours,
    payableHours: toNumberOrNull(dbShift.payable_hours) ?? summary.payableHours,
    reviewStatus: dbShift.review_status || null,
    reviewNote: dbShift.review_note || null,
    reviewedBy: dbShift.reviewed_by || null,
    reviewedAt: normalizeTimestamp(dbShift.reviewed_at),
    payrollStatus: normalizePayrollStatus(dbShift.payroll_status),
    payrollApprovedBy: dbShift.payroll_approved_by || null,
    payrollApprovedAt: normalizeTimestamp(dbShift.payroll_approved_at),
    payrollExportedBy: dbShift.payroll_exported_by || null,
    payrollExportedAt: normalizeTimestamp(dbShift.payroll_exported_at),
    breaks: normalizedBreaks,
    createdAt: normalizeTimestamp(dbShift.created_at),
    updatedAt: normalizeTimestamp(dbShift.updated_at),
  };
}

function safeJsonParse(value, label) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[normalizeDbTimeLog] Failed to parse ${label}:`, String(value).slice(0, 80));
    return null;
  }
}

function normalizeDbTimeLog(dbLog) {
  return {
    id: dbLog.id,
    userId: dbLog.user_id,
    shiftId: dbLog.shift_id,
    actionType: dbLog.action_type,
    timestamp: normalizeTimestamp(dbLog.timestamp),
    location: safeJsonParse(dbLog.location, "location"),
    geofence: safeJsonParse(dbLog.geofence, "geofence"),
    notes: dbLog.notes,
    createdAt: normalizeTimestamp(dbLog.created_at),
  };
}

export async function getAllShiftsForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.shifts.filter((shift) => shift.userId === userId);
  }

  const result = await query(
    `SELECT s.* FROM shifts s WHERE s.user_id = $1 ORDER BY s.clock_in_at DESC`,
    [userId]
  );

  console.info("[timeLogModel.getAllShiftsForUser] fetched shifts", {
    userId,
    rowCount: result.rows.length,
  });

  return Promise.all(
    result.rows.map(async (shift) => {
      try {
        const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
          shift.id,
        ]);
        return normalizeDbShift(shift, breaksResult.rows);
      } catch (breaksError) {
        console.error(`[getAllShiftsForUser] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
        // Fallback: return shift without breaks rather than failing entire operation
        return normalizeDbShift(shift, []);
      }
    })
  );
}

export async function getAllShifts() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.shifts || []).slice();
  }

  const result = await query(`SELECT s.* FROM shifts s ORDER BY s.clock_in_at DESC`);

  console.info("[timeLogModel.getAllShifts] fetched shifts", {
    rowCount: result.rows.length,
  });

  return Promise.all(
    result.rows.map(async (shift) => {
      try {
        const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
          shift.id,
        ]);
        return normalizeDbShift(shift, breaksResult.rows);
      } catch (breaksError) {
        console.error(`[getAllShifts] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
        return normalizeDbShift(shift, []);
      }
    })
  );
}

export async function getShiftById(shiftId) {
  if (!shiftId || typeof shiftId !== "string") return null;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.shifts || []).find((shift) => shift.id === shiftId) || null;
  }

  const result = await query(`SELECT s.* FROM shifts s WHERE s.id = $1 LIMIT 1`, [shiftId]);
  if (result.rows.length === 0) return null;

  const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [shiftId]);
  return normalizeDbShift(result.rows[0], breaksResult.rows);
}

export async function getOpenShiftForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.shifts.find((shift) => shift.userId === userId && !shift.clockOutAt) || null;
  }

  const result = await query(
    `SELECT s.* FROM shifts s WHERE s.user_id = $1 AND s.clock_out_at IS NULL LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const shift = result.rows[0];
  try {
    const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
      shift.id,
    ]);
    return normalizeDbShift(shift, breaksResult.rows);
  } catch (breaksError) {
    console.error(`[getOpenShiftForUser] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
    // Fallback: return shift without breaks rather than failing
    return normalizeDbShift(shift, []);
  }
}

export async function getTimeLogsForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.timeLogs.filter((log) => log.userId === userId);
  }

  const result = await query(
    `SELECT * FROM time_logs WHERE user_id = $1 ORDER BY timestamp DESC`,
    [userId]
  );

  console.info("[timeLogModel.getTimeLogsForUser] fetched logs", {
    userId,
    rowCount: result.rows.length,
  });

  return result.rows.map(normalizeDbTimeLog);
}

export async function getAllTimeLogs() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.timeLogs || []).slice();
  }

  const result = await query(`SELECT * FROM time_logs ORDER BY timestamp DESC`);

  console.info("[timeLogModel.getAllTimeLogs] fetched logs", {
    rowCount: result.rows.length,
  });

  return result.rows.map(normalizeDbTimeLog);
}

export async function getTimeLogsForShift(shiftId) {
  if (!shiftId || typeof shiftId !== "string") return [];

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.timeLogs || []).filter((log) => log.shiftId === shiftId);
  }

  const result = await query(`SELECT * FROM time_logs WHERE shift_id = $1 ORDER BY timestamp ASC`, [
    shiftId,
  ]);
  return result.rows.map(normalizeDbTimeLog);
}

function ensureIsoTimestamp(value, label) {
  if (!value) throw new HttpError(400, `${label} is required`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${label} must be a valid ISO date string`);
  }
  return new Date(parsed).toISOString();
}

function validateResolutionTimes(shift, activeBreak, closeOpenShiftAt, closeActiveBreakAt) {
  if (closeOpenShiftAt) {
    const clockInAt = Date.parse(shift.clockInAt || "");
    const clockOutAt = Date.parse(closeOpenShiftAt);
    if (Number.isNaN(clockInAt) || Number.isNaN(clockOutAt) || clockOutAt < clockInAt) {
      throw new HttpError(400, "closeOpenShiftAt must be on or after clock-in time");
    }
  }

  if (closeActiveBreakAt && activeBreak?.startAt) {
    const breakStartAt = Date.parse(activeBreak.startAt);
    const breakEndAt = Date.parse(closeActiveBreakAt);
    if (Number.isNaN(breakStartAt) || Number.isNaN(breakEndAt) || breakEndAt < breakStartAt) {
      throw new HttpError(400, "closeActiveBreakAt must be on or after the active break start time");
    }

    if (!closeOpenShiftAt && shift.clockOutAt) {
      const shiftClockOutAt = Date.parse(shift.clockOutAt);
      if (!Number.isNaN(shiftClockOutAt) && breakEndAt > shiftClockOutAt) {
        throw new HttpError(400, "closeActiveBreakAt must be on or before the recorded shift clock-out time");
      }
    }
  }

  if (closeOpenShiftAt && closeActiveBreakAt) {
    const clockOutAt = Date.parse(closeOpenShiftAt);
    const breakEndAt = Date.parse(closeActiveBreakAt);
    if (Number.isNaN(clockOutAt) || Number.isNaN(breakEndAt) || breakEndAt > clockOutAt) {
      throw new HttpError(400, "closeActiveBreakAt must be on or before closeOpenShiftAt");
    }
  }
}

function buildAdminResolutionLogs({
  actorUserId,
  shiftId,
  eventTimestamp,
  previousPayrollStatus,
  payrollStatus,
  reviewStatus,
  reviewNote,
  closeOpenShiftAt,
  closeActiveBreakAt,
  payableHours,
}) {
  const logs = [];

  if (reviewStatus || reviewNote) {
    const statusText = reviewStatus === "follow_up_required" ? "Follow-up required" : "Reviewed";
    logs.push({
      id: crypto.randomUUID(),
      userId: actorUserId,
      shiftId,
      actionType: ADMIN_RESOLUTION_ACTIONS.review,
      timestamp: eventTimestamp,
      notes: `Manager review: ${statusText}. ${reviewNote}`.trim(),
    });
  }

  if (closeActiveBreakAt) {
    logs.push({
      id: crypto.randomUUID(),
      userId: actorUserId,
      shiftId,
      actionType: ADMIN_RESOLUTION_ACTIONS.endBreak,
      timestamp: eventTimestamp,
      notes: `Admin ended active break at ${closeActiveBreakAt}. ${reviewNote}`.trim(),
    });
  }

  if (closeOpenShiftAt) {
    logs.push({
      id: crypto.randomUUID(),
      userId: actorUserId,
      shiftId,
      actionType: ADMIN_RESOLUTION_ACTIONS.closeShift,
      timestamp: eventTimestamp,
      notes: `Admin closed open shift at ${closeOpenShiftAt}. ${reviewNote}`.trim(),
    });
  }

  if (payableHours !== null && payableHours !== undefined) {
    logs.push({
      id: crypto.randomUUID(),
      userId: actorUserId,
      shiftId,
      actionType: ADMIN_RESOLUTION_ACTIONS.adjustPayableHours,
      timestamp: eventTimestamp,
      notes: `Final payable hours set to ${Number(payableHours).toFixed(2)}. ${reviewNote}`.trim(),
    });
  }

  if (payrollStatus && payrollStatus !== previousPayrollStatus) {
    if (payrollStatus === "approved") {
      logs.push({
        id: crypto.randomUUID(),
        userId: actorUserId,
        shiftId,
        actionType: ADMIN_RESOLUTION_ACTIONS.approvePayroll,
        timestamp: eventTimestamp,
        notes: `Shift approved for payroll. ${reviewNote}`.trim(),
      });
    }

    if (payrollStatus === "exported") {
      logs.push({
        id: crypto.randomUUID(),
        userId: actorUserId,
        shiftId,
        actionType: ADMIN_RESOLUTION_ACTIONS.exportPayroll,
        timestamp: eventTimestamp,
        notes: `Shift marked exported to payroll. ${reviewNote}`.trim(),
      });
    }

    if (payrollStatus === "pending" && previousPayrollStatus !== "pending") {
      logs.push({
        id: crypto.randomUUID(),
        userId: actorUserId,
        shiftId,
        actionType: ADMIN_RESOLUTION_ACTIONS.reopenPayroll,
        timestamp: eventTimestamp,
        notes: `Shift returned to pending payroll review. ${reviewNote}`.trim(),
      });
    }
  }

  return logs;
}

function buildPayrollStateTransition(currentShift, actorUserId, eventTimestamp, resolution, finalReviewStatus, finalClockOutAt) {
  const currentPayrollStatus = normalizePayrollStatus(currentShift.payrollStatus);
  const requestedPayrollStatus = resolution.payrollStatus
    ? normalizePayrollStatus(resolution.payrollStatus)
    : currentPayrollStatus;

  if (requestedPayrollStatus === currentPayrollStatus) {
    return {
      payrollStatus: currentPayrollStatus,
      payrollApprovedBy: currentShift.payrollApprovedBy || null,
      payrollApprovedAt: currentShift.payrollApprovedAt || null,
      payrollExportedBy: currentShift.payrollExportedBy || null,
      payrollExportedAt: currentShift.payrollExportedAt || null,
      changed: false,
      previousPayrollStatus: currentPayrollStatus,
    };
  }

  if (!finalClockOutAt) {
    throw new HttpError(400, "Payroll status can only be changed on a closed shift");
  }

  if (finalReviewStatus !== "reviewed") {
    throw new HttpError(400, "Payroll status can only be changed after the shift is reviewed");
  }

  if (requestedPayrollStatus === "exported" && currentPayrollStatus !== "approved") {
    throw new HttpError(409, "Shift must be payroll approved before it can be marked exported");
  }

  if (requestedPayrollStatus === "pending") {
    return {
      payrollStatus: "pending",
      payrollApprovedBy: null,
      payrollApprovedAt: null,
      payrollExportedBy: null,
      payrollExportedAt: null,
      changed: true,
      previousPayrollStatus: currentPayrollStatus,
    };
  }

  if (requestedPayrollStatus === "approved") {
    return {
      payrollStatus: "approved",
      payrollApprovedBy: actorUserId,
      payrollApprovedAt: eventTimestamp,
      payrollExportedBy: null,
      payrollExportedAt: null,
      changed: true,
      previousPayrollStatus: currentPayrollStatus,
    };
  }

  return {
    payrollStatus: "exported",
    payrollApprovedBy: currentShift.payrollApprovedBy || actorUserId,
    payrollApprovedAt: currentShift.payrollApprovedAt || eventTimestamp,
    payrollExportedBy: actorUserId,
    payrollExportedAt: eventTimestamp,
    changed: true,
    previousPayrollStatus: currentPayrollStatus,
  };
}

export async function applyAdminShiftResolution(shiftId, actorUserId, resolution = {}) {
  if (!shiftId || typeof shiftId !== "string") {
    throw new HttpError(400, "shiftId is required");
  }

  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  const eventTimestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = (db.shifts || []).find((item) => item.id === shiftId) || null;
    if (!shift) throw new HttpError(404, "Shift not found");

    const activeBreak = Array.isArray(shift.breaks)
      ? [...shift.breaks].reverse().find((item) => item.startAt && !item.endAt) || null
      : null;

    if (resolution.closeOpenShiftAt && shift.clockOutAt) {
      throw new HttpError(409, "Shift is already closed");
    }

    let closeActiveBreakAt = resolution.closeActiveBreakAt || null;
    if (resolution.closeOpenShiftAt && activeBreak && !closeActiveBreakAt) {
      closeActiveBreakAt = resolution.closeOpenShiftAt;
    }

    if (closeActiveBreakAt && !activeBreak) {
      throw new HttpError(409, "No active break is open for this shift");
    }

    validateResolutionTimes(shift, activeBreak, resolution.closeOpenShiftAt, closeActiveBreakAt);

    if (closeActiveBreakAt && activeBreak) {
      activeBreak.endAt = ensureIsoTimestamp(closeActiveBreakAt, "closeActiveBreakAt");
    }

    if (resolution.closeOpenShiftAt) {
      shift.clockOutAt = ensureIsoTimestamp(resolution.closeOpenShiftAt, "closeOpenShiftAt");
    }

    const summary = buildShiftHourSummary(shift);
    if (resolution.payableHours !== null && resolution.payableHours !== undefined && !shift.clockOutAt) {
      throw new HttpError(400, "Payable hours can only be set on a closed shift");
    }

    const finalReviewStatus = resolution.reviewStatus || shift.reviewStatus || null;
    const payrollState = buildPayrollStateTransition(
      shift,
      actorUserId,
      eventTimestamp,
      resolution,
      finalReviewStatus,
      shift.clockOutAt
    );

    shift.actualHours = summary.actualHours;
    shift.payableHours =
      resolution.payableHours !== null && resolution.payableHours !== undefined
        ? resolution.payableHours
        : summary.payableHours;
    shift.reviewStatus = finalReviewStatus;
    shift.reviewNote = resolution.reviewNote;
    shift.reviewedBy = actorUserId;
    shift.reviewedAt = eventTimestamp;
    shift.payrollStatus = payrollState.payrollStatus;
    shift.payrollApprovedBy = payrollState.payrollApprovedBy;
    shift.payrollApprovedAt = payrollState.payrollApprovedAt;
    shift.payrollExportedBy = payrollState.payrollExportedBy;
    shift.payrollExportedAt = payrollState.payrollExportedAt;
    shift.updatedAt = eventTimestamp;

    if (!Array.isArray(db.timeLogs)) db.timeLogs = [];
    db.timeLogs.push(
      ...buildAdminResolutionLogs({
        actorUserId,
        shiftId,
        eventTimestamp,
        previousPayrollStatus: payrollState.previousPayrollStatus,
        payrollStatus: payrollState.payrollStatus,
        reviewStatus: shift.reviewStatus,
        reviewNote: resolution.reviewNote,
        closeOpenShiftAt: shift.clockOutAt && resolution.closeOpenShiftAt ? shift.clockOutAt : null,
        closeActiveBreakAt,
        payableHours:
          resolution.payableHours !== null && resolution.payableHours !== undefined
            ? resolution.payableHours
            : null,
      }).map((item) => ({
        ...item,
        location: null,
        geofence: null,
        createdAt: eventTimestamp,
      }))
    );

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const shiftResult = await client.query(`SELECT * FROM shifts WHERE id = $1 LIMIT 1 FOR UPDATE`, [shiftId]);
      if (shiftResult.rows.length === 0) {
        throw new HttpError(404, "Shift not found");
      }

      const breaksResult = await client.query(
        `SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at FOR UPDATE`,
        [shiftId]
      );

      const currentShift = normalizeDbShift(shiftResult.rows[0], breaksResult.rows);
      const activeBreak =
        [...(currentShift.breaks || [])].reverse().find((item) => item.startAt && !item.endAt) || null;

      if (resolution.closeOpenShiftAt && currentShift.clockOutAt) {
        throw new HttpError(409, "Shift is already closed");
      }

      let closeActiveBreakAt = resolution.closeActiveBreakAt || null;
      if (resolution.closeOpenShiftAt && activeBreak && !closeActiveBreakAt) {
        closeActiveBreakAt = resolution.closeOpenShiftAt;
      }

      if (closeActiveBreakAt && !activeBreak) {
        throw new HttpError(409, "No active break is open for this shift");
      }

      validateResolutionTimes(currentShift, activeBreak, resolution.closeOpenShiftAt, closeActiveBreakAt);

      const nextShift = {
        ...currentShift,
        clockOutAt: resolution.closeOpenShiftAt
          ? ensureIsoTimestamp(resolution.closeOpenShiftAt, "closeOpenShiftAt")
          : currentShift.clockOutAt,
        breaks: (currentShift.breaks || []).map((item) => {
          if (!closeActiveBreakAt || item.id !== activeBreak?.id) return item;
          return {
            ...item,
            endAt: ensureIsoTimestamp(closeActiveBreakAt, "closeActiveBreakAt"),
          };
        }),
      };

      const summary = buildShiftHourSummary(nextShift);
      if (resolution.payableHours !== null && resolution.payableHours !== undefined && !nextShift.clockOutAt) {
        throw new HttpError(400, "Payable hours can only be set on a closed shift");
      }

      if (closeActiveBreakAt && activeBreak) {
        await client.query(`UPDATE breaks SET end_at = $1 WHERE id = $2`, [
          ensureIsoTimestamp(closeActiveBreakAt, "closeActiveBreakAt"),
          activeBreak.id,
        ]);
      }

      const finalPayableHours =
        resolution.payableHours !== null && resolution.payableHours !== undefined
          ? resolution.payableHours
          : summary.payableHours;
      const finalReviewStatus = resolution.reviewStatus || currentShift.reviewStatus || null;
      const payrollState = buildPayrollStateTransition(
        currentShift,
        actorUserId,
        eventTimestamp,
        resolution,
        finalReviewStatus,
        nextShift.clockOutAt
      );

      await client.query(
        `UPDATE shifts
        SET clock_out_at = $1,
            actual_hours = $2,
            payable_hours = $3,
            review_status = $4,
            review_note = $5,
            reviewed_by = $6,
            reviewed_at = $7,
            payroll_status = $8,
            payroll_approved_by = $9,
            payroll_approved_at = $10,
            payroll_exported_by = $11,
            payroll_exported_at = $12,
            updated_at = $13
        WHERE id = $14`,
        [
          nextShift.clockOutAt,
          summary.actualHours,
          finalPayableHours,
          finalReviewStatus,
          resolution.reviewNote,
          actorUserId,
          eventTimestamp,
          payrollState.payrollStatus,
          payrollState.payrollApprovedBy,
          payrollState.payrollApprovedAt,
          payrollState.payrollExportedBy,
          payrollState.payrollExportedAt,
          eventTimestamp,
          shiftId,
        ]
      );

      const adminLogs = buildAdminResolutionLogs({
        actorUserId,
        shiftId,
        eventTimestamp,
        previousPayrollStatus: payrollState.previousPayrollStatus,
        payrollStatus: payrollState.payrollStatus,
        reviewStatus: finalReviewStatus,
        reviewNote: resolution.reviewNote,
        closeOpenShiftAt: resolution.closeOpenShiftAt ? nextShift.clockOutAt : null,
        closeActiveBreakAt: closeActiveBreakAt ? ensureIsoTimestamp(closeActiveBreakAt, "closeActiveBreakAt") : null,
        payableHours:
          resolution.payableHours !== null && resolution.payableHours !== undefined
            ? resolution.payableHours
            : null,
      });

      for (const log of adminLogs) {
        await client.query(
          `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [log.id, log.userId, log.shiftId, log.actionType, log.timestamp, null, null, log.notes, eventTimestamp]
        );
      }

      await client.query("COMMIT");
      return getShiftById(shiftId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveClockIn(userId, notes = null, location = null, geofence = null, businessTimeZone = null) {
  const timestamp = nowIso();
  const resolvedBusinessTimeZone = resolveBusinessTimeZone(
    businessTimeZone || geofence?.businessTimeZone || null
  );
  const businessDate = formatBusinessDate(timestamp, resolvedBusinessTimeZone);

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = {
      id: crypto.randomUUID(),
      userId,
      clockInAt: timestamp,
      clockOutAt: null,
      businessDate,
      businessTimeZone: resolvedBusinessTimeZone,
      actualHours: null,
      payableHours: null,
      payrollStatus: "pending",
      payrollApprovedBy: null,
      payrollApprovedAt: null,
      payrollExportedBy: null,
      payrollExportedAt: null,
      breaks: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    db.shifts.push(shift);
    db.timeLogs.push({
      id: crypto.randomUUID(),
      userId,
      shiftId: shift.id,
      actionType: "clock_in",
      timestamp,
      location: normalizeLocation(location),
      geofence: normalizeGeofence(geofence),
      notes: notes || null,
    });

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftId = crypto.randomUUID();
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

      const existingShift = await client.query(
        `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1 FOR UPDATE`,
        [userId]
      );

      if (existingShift.rows.length > 0) {
        throw new HttpError(409, "Cannot clock in: shift already open");
      }

      await client.query(
        `INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, business_date, business_time_zone, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [shiftId, userId, timestamp, null, businessDate, resolvedBusinessTimeZone, timestamp, timestamp]
      );

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "clock_in",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveClockIn] wrote shift and log", {
        userId,
        shiftId,
        logId,
      });

      return {
        id: shiftId,
        userId,
        clockInAt: timestamp,
        clockOutAt: null,
        businessDate,
        businessTimeZone: resolvedBusinessTimeZone,
        payrollStatus: "pending",
        payrollApprovedBy: null,
        payrollApprovedAt: null,
        payrollExportedBy: null,
        payrollExportedAt: null,
        breaks: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (error) {
      await client.query("ROLLBACK");

       if (error?.code === "23505") {
        throw new HttpError(409, "Cannot clock in: shift already open");
      }

      throw error;
    }
  });
}

export async function saveStartBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = db.shifts.find((item) => item.userId === userId && !item.clockOutAt);
    if (!shift) return null;

    shift.breaks.push({
      id: crypto.randomUUID(),
      startAt: timestamp,
      endAt: null,
    });
    shift.updatedAt = timestamp;

    db.timeLogs.push({
      id: crypto.randomUUID(),
      userId,
      shiftId: shift.id,
      actionType: "break_start",
      timestamp,
      location: normalizeLocation(location),
      geofence: normalizeGeofence(geofence),
      notes: notes || null,
    });

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;
    const breakId = crypto.randomUUID();
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(
        `INSERT INTO breaks (id, shift_id, start_at, end_at, created_at)
        VALUES ($1, $2, $3, $4, $5)`,
        [breakId, shiftId, timestamp, null, timestamp]
      );

      await client.query(`UPDATE shifts SET updated_at = $1 WHERE id = $2`, [timestamp, shiftId]);

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "break_start",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveStartBreak] wrote break and log", {
        userId,
        shiftId,
        breakId,
        logId,
      });

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      return normalizeDbShift(shiftData.rows[0], breaksData.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveEndBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = db.shifts.find((item) => item.userId === userId && !item.clockOutAt);
    if (!shift) return null;

    const activeBreak = [...shift.breaks].reverse().find((item) => !item.endAt);
    if (!activeBreak) return null;

    activeBreak.endAt = timestamp;
    shift.updatedAt = timestamp;

    db.timeLogs.push({
      id: crypto.randomUUID(),
      userId,
      shiftId: shift.id,
      actionType: "break_end",
      timestamp,
      location: normalizeLocation(location),
      geofence: normalizeGeofence(geofence),
      notes: notes || null,
    });

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;

    const breakResult = await client.query(
      `SELECT id FROM breaks WHERE shift_id = $1 AND end_at IS NULL ORDER BY start_at DESC LIMIT 1`,
      [shiftId]
    );

    if (breakResult.rows.length === 0) return null;

    const breakId = breakResult.rows[0].id;
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(`UPDATE breaks SET end_at = $1 WHERE id = $2`, [timestamp, breakId]);

      await client.query(`UPDATE shifts SET updated_at = $1 WHERE id = $2`, [timestamp, shiftId]);

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "break_end",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveEndBreak] closed break and wrote log", {
        userId,
        shiftId,
        breakId,
        logId,
      });

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      return normalizeDbShift(shiftData.rows[0], breaksData.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveClockOut(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = db.shifts.find((item) => item.userId === userId && !item.clockOutAt);
    if (!shift) return null;

    shift.clockOutAt = timestamp;
    shift.updatedAt = timestamp;
    const summary = buildShiftHourSummary(shift);
    shift.actualHours = summary.actualHours;
    shift.payableHours = summary.payableHours;

    db.timeLogs.push({
      id: crypto.randomUUID(),
      userId,
      shiftId: shift.id,
      actionType: "clock_out",
      timestamp,
      location: normalizeLocation(location),
      geofence: normalizeGeofence(geofence),
      notes: notes || null,
    });

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(
        `UPDATE shifts SET clock_out_at = $1, updated_at = $2 WHERE id = $3`,
        [timestamp, timestamp, shiftId]
      );

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "clock_out",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      const normalizedShift = normalizeDbShift(shiftData.rows[0], breaksData.rows);
      const summary = buildShiftHourSummary(normalizedShift);

      await client.query(
        `UPDATE shifts SET actual_hours = $1, payable_hours = $2, updated_at = $3 WHERE id = $4`,
        [summary.actualHours, summary.payableHours, timestamp, shiftId]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveClockOut] closed shift and wrote log", {
        userId,
        shiftId,
        logId,
      });

      return {
        ...normalizedShift,
        actualHours: summary.actualHours,
        payableHours: summary.payableHours,
        updatedAt: timestamp,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
