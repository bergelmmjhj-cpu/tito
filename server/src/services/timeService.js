import {
  getAllShiftsForUser,
  getOpenShiftForUser,
  getTimeLogsForUser,
  saveClockIn,
  saveClockOut,
  saveEndBreak,
  saveStartBreak,
} from "../models/timeLogModel.js";
import { findUserById } from "../models/userModel.js";
import { findWorkplaceById } from "../models/workplaceModel.js";
import { findWorkplaceByIdFromCrm } from "../models/crmWorkplaceModel.js";
import { calculateDistanceMeters } from "./geofenceService.js";
import { buildShiftHourSummary } from "./payableHoursService.js";
import { HttpError } from "../utils/errors.js";

const NOTES_MAX_LENGTH = 500; // keep notes concise for UI display and log storage
const LOCATION_REQUIRED = process.env.REQUIRE_ATTENDANCE_LOCATION !== "false";
const ENFORCE_CLOCKIN_GEOFENCE = process.env.ENFORCE_CLOCKIN_GEOFENCE === "true";
const ACTION_TYPES = new Set(["clock_in", "break_start", "break_end", "clock_out"]);

function getActiveBreak(shift) {
  if (!shift || !Array.isArray(shift.breaks)) return null;
  for (let i = shift.breaks.length - 1; i >= 0; i -= 1) {
    if (!shift.breaks[i].endAt) return shift.breaks[i];
  }
  return null;
}

async function resolveStatus(userId) {
  const openShift = await getOpenShiftForUser(userId);
  if (!openShift) {
    const allShifts = await getAllShiftsForUser(userId);
    const hasPastShifts = allShifts.length > 0;
    return hasPastShifts ? "clocked_out" : "not_clocked_in";
  }

  return getActiveBreak(openShift) ? "on_break" : "clocked_in";
}

function buildLogsByShift(logs) {
  const map = new Map();

  for (const log of logs) {
    if (!map.has(log.shiftId)) map.set(log.shiftId, []);
    map.get(log.shiftId).push(log);
  }

  return map;
}

function firstLogOfType(logs, actionType) {
  return (logs || []).find((log) => log.actionType === actionType) || null;
}

function deriveShiftStatus(shift) {
  const activeBreak = getActiveBreak(shift);
  if (activeBreak) return "missing_break_end";
  if (!shift.clockOutAt) return "open_shift";
  return "completed";
}

function validateNotes(notes) {
  if (notes === undefined || notes === null || notes === "") return null;
  if (typeof notes !== "string") throw new HttpError(400, "notes must be a string");
  return notes.trim().slice(0, NOTES_MAX_LENGTH);
}

function validateTimestamp(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required`);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${label} must be a valid ISO date string`);
  }

  return new Date(parsed).toISOString();
}

function parseFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a finite number`);
  }
  return value;
}

function validateLocationPayload(location) {
  if (!location || typeof location !== "object") {
    throw new HttpError(400, "location is required");
  }

  const latitude = parseFiniteNumber(location.latitude, "location.latitude");
  const longitude = parseFiniteNumber(location.longitude, "location.longitude");
  const accuracyRaw = location.accuracy;
  const capturedAt = validateTimestamp(location.capturedAt, "location.capturedAt");

  if (latitude < -90 || latitude > 90) {
    throw new HttpError(400, "location.latitude must be between -90 and 90");
  }

  if (longitude < -180 || longitude > 180) {
    throw new HttpError(400, "location.longitude must be between -180 and 180");
  }

  let accuracy = null;
  if (accuracyRaw !== undefined && accuracyRaw !== null && accuracyRaw !== "") {
    accuracy = parseFiniteNumber(accuracyRaw, "location.accuracy");
    if (accuracy < 0) {
      throw new HttpError(400, "location.accuracy must be greater than or equal to 0");
    }
  }

  return {
    latitude,
    longitude,
    accuracy,
    capturedAt,
  };
}

function parseActionLocation(actionType, location) {
  if (actionType === "clock_in" && LOCATION_REQUIRED && !location) {
    throw new HttpError(400, "location is required for clock in");
  }

  if (ACTION_TYPES.has(actionType) && LOCATION_REQUIRED) {
    return validateLocationPayload(location);
  }

  if (location === undefined || location === null || location === "") {
    return null;
  }

  return validateLocationPayload(location);
}

async function resolveWorkplaceAssignment(userId) {
  const user = await findUserById(userId);
  if (!user) throw new HttpError(404, "User not found");

  const workplaceIdRaw = user.profile?.assignedWorkplaceId;
  const workplaceId = typeof workplaceIdRaw === "string" ? workplaceIdRaw.trim() : "";

  if (workplaceIdRaw !== null && workplaceIdRaw !== undefined && !workplaceId) {
    return {
      assignmentRequired: true,
      assignment: null,
      workplace: null,
      assignmentInvalid: true,
      issue: "Assigned workplace reference is invalid. Please contact your admin.",
    };
  }

  if (!workplaceId) {
    return {
      assignmentRequired: false,
      workplace: null,
      assignment: null,
    };
  }

  let workplace = null;
  try {
    workplace = await findWorkplaceByIdFromCrm(workplaceId);
  } catch {
    workplace = null;
  }

  if (!workplace) {
    workplace = await findWorkplaceById(workplaceId);
  }

  return {
    assignmentRequired: true,
    assignment: workplaceId,
    workplace: workplace || null,
  };
}

function normalizeGeofenceInputs(workplace) {
  const latitude = Number(workplace?.latitude);
  const longitude = Number(workplace?.longitude);
  const radiusMeters = Number(workplace?.geofenceRadiusMeters);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, issue: "Assigned workplace latitude is not configured correctly" };
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, issue: "Assigned workplace longitude is not configured correctly" };
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return { valid: false, issue: "Assigned workplace geofence radius is not configured correctly" };
  }

  return {
    valid: true,
    latitude,
    longitude,
    radiusMeters,
  };
}

async function evaluateGeofenceForAction(userId, location) {
  const assignment = await resolveWorkplaceAssignment(userId);
  if (assignment.assignmentInvalid) {
    return {
      assignmentRequired: true,
      workplaceId: null,
      workplaceName: null,
      radiusMeters: null,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
      assignmentInvalid: true,
      issue: assignment.issue,
    };
  }

  if (!assignment.assignmentRequired) {
    return {
      assignmentRequired: false,
      workplaceId: null,
      workplaceName: null,
      radiusMeters: null,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
    };
  }

  if (!assignment.workplace || assignment.workplace.active === false) {
    return {
      assignmentRequired: true,
      workplaceId: assignment.assignment,
      workplaceName: assignment.workplace?.name || null,
      radiusMeters: assignment.workplace?.geofenceRadiusMeters || null,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
      assignmentUnavailable: true,
      issue: "Assigned workplace is unavailable or inactive",
    };
  }

  const normalizedInputs = normalizeGeofenceInputs(assignment.workplace);
  if (!normalizedInputs.valid) {
    return {
      assignmentRequired: true,
      workplaceId: assignment.workplace.id,
      workplaceName: assignment.workplace.name,
      radiusMeters: null,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
      assignmentInvalid: true,
      issue: normalizedInputs.issue,
    };
  }

  if (!location) {
    return {
      assignmentRequired: true,
      workplaceId: assignment.workplace.id,
      workplaceName: assignment.workplace.name,
      radiusMeters: normalizedInputs.radiusMeters,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
    };
  }

  const distanceMeters = calculateDistanceMeters(
    { latitude: location.latitude, longitude: location.longitude },
    { latitude: normalizedInputs.latitude, longitude: normalizedInputs.longitude }
  );

  const radiusMeters = normalizedInputs.radiusMeters;
  const withinGeofence = distanceMeters <= radiusMeters;

  return {
    assignmentRequired: true,
    workplaceId: assignment.workplace.id,
    workplaceName: assignment.workplace.name,
    radiusMeters,
    distanceMeters: Number(distanceMeters.toFixed(2)),
    withinGeofence,
    enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
  };
}

export async function getCurrentStatus(userId) {
  const openShift = await getOpenShiftForUser(userId);
  const assignment = await resolveWorkplaceAssignment(userId);

  return {
    status: await resolveStatus(userId),
    openShift,
    workplaceAssignment: {
      assignedWorkplaceId: assignment.assignment || null,
      assignedWorkplaceName: assignment.workplace?.name || null,
      geofenceRadiusMeters: assignment.workplace?.geofenceRadiusMeters || null,
    },
  };
}

export async function performAction(userId, actionType, notes, location) {
  const normalizedAction = typeof actionType === "string" ? actionType.trim() : "";
  const cleanNotes = validateNotes(notes);
  const cleanLocation = parseActionLocation(normalizedAction, location);
  const geofenceEvaluation = await evaluateGeofenceForAction(userId, cleanLocation);
  const openShift = await getOpenShiftForUser(userId);
  const activeBreak = getActiveBreak(openShift);

  const logCtx = {
    userId,
    action: normalizedAction,
    hasLocation: Boolean(cleanLocation),
    workplaceId: geofenceEvaluation.workplaceId ?? null,
    withinGeofence: geofenceEvaluation.withinGeofence ?? null,
    geofenceEnforced: geofenceEvaluation.enforcementEnabled ?? false,
    openShiftId: openShift?.id ?? null,
    activeBreakId: activeBreak?.id ?? null,
  };

  if (normalizedAction === "clock_in") {
    if (openShift) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "shift_already_open" });
      throw new HttpError(409, "Cannot clock in: shift already open");
    }

    if (geofenceEvaluation.assignmentUnavailable) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "workplace_unavailable" });
      throw new HttpError(409, geofenceEvaluation.issue || "Assigned workplace is unavailable or inactive");
    }

    if (geofenceEvaluation.assignmentInvalid) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "workplace_invalid" });
      throw new HttpError(409, geofenceEvaluation.issue || "Assigned workplace geofence is not configured correctly");
    }

    if (
      ENFORCE_CLOCKIN_GEOFENCE &&
      geofenceEvaluation.assignmentRequired &&
      geofenceEvaluation.withinGeofence === false
    ) {
      console.warn("[performAction] rejected", {
        ...logCtx,
        reason: "outside_geofence",
        distanceMeters: geofenceEvaluation.distanceMeters,
        radiusMeters: geofenceEvaluation.radiusMeters,
      });
      throw new HttpError(
        403,
        `Clock in blocked: ${geofenceEvaluation.distanceMeters}m from ${geofenceEvaluation.workplaceName} (limit ${geofenceEvaluation.radiusMeters}m)`
      );
    }

    await saveClockIn(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "break_start") {
    if (!openShift) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "not_clocked_in" });
      throw new HttpError(409, "Cannot start break: not clocked in");
    }
    if (activeBreak) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "break_already_active" });
      throw new HttpError(409, "Cannot start break: break already active");
    }
    await saveStartBreak(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "break_end") {
    if (!openShift) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "not_clocked_in" });
      throw new HttpError(409, "Cannot end break: not clocked in");
    }
    if (!activeBreak) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "no_active_break" });
      throw new HttpError(409, "Cannot end break: no active break");
    }
    await saveEndBreak(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "clock_out") {
    if (!openShift) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "not_clocked_in" });
      throw new HttpError(409, "Cannot clock out: not clocked in");
    }
    if (activeBreak) {
      console.warn("[performAction] rejected", { ...logCtx, reason: "active_break_open" });
      throw new HttpError(409, "Cannot clock out during break");
    }
    await saveClockOut(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else {
    throw new HttpError(400, "Invalid actionType");
  }

  return {
    ...(await getCurrentStatus(userId)),
    geofenceEvaluation,
  };
}

export async function getAttendanceActionHistory(userId) {
  const logs = await getTimeLogsForUser(userId);
  const sorted = logs
    .slice()
    .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""));

  return sorted.map((log) => ({
    id: log.id,
    shiftId: log.shiftId,
    actionType: log.actionType,
    attendanceTimestamp: log.timestamp || null,
    locationCapturedAt: log.location?.capturedAt || null,
    latitude: typeof log.location?.latitude === "number" ? log.location.latitude : null,
    longitude: typeof log.location?.longitude === "number" ? log.location.longitude : null,
    accuracy: typeof log.location?.accuracy === "number" ? log.location.accuracy : null,
    workplaceId: log.geofence?.workplaceId || null,
    workplaceName: log.geofence?.workplaceName || null,
    geofenceRadiusMeters:
      typeof log.geofence?.radiusMeters === "number" ? log.geofence.radiusMeters : null,
    distanceMeters:
      typeof log.geofence?.distanceMeters === "number" ? log.geofence.distanceMeters : null,
    withinGeofence:
      typeof log.geofence?.withinGeofence === "boolean" ? log.geofence.withinGeofence : null,
    notes: log.notes || null,
  }));
}

export async function getAttendanceHistory(userId) {
  const [shifts, logs] = await Promise.all([getAllShiftsForUser(userId), getTimeLogsForUser(userId)]);
  const logsByShift = buildLogsByShift(logs);
  const sorted = shifts
    .slice()
    .sort((a, b) => Date.parse(b.clockInAt || "") - Date.parse(a.clockInAt || ""));

  return sorted.map((shift) => {
    const shiftLogs = logsByShift.get(shift.id) || [];
    const clockInLog = firstLogOfType(shiftLogs, "clock_in");
    const clockOutLog = firstLogOfType(shiftLogs, "clock_out");
    const breakStart = shift.breaks?.map((item) => item.startAt).filter(Boolean) || [];
    const breakEnd = shift.breaks?.map((item) => item.endAt).filter(Boolean) || [];
    const summary = buildShiftHourSummary(shift);

    return {
      shiftId: shift.id,
      date: shift.clockInAt ? shift.clockInAt.slice(0, 10) : null,
      status: deriveShiftStatus(shift),
      timeIn: shift.clockInAt || null,
      breakStart,
      breakEnd,
      timeOut: shift.clockOutAt || null,
      rawDuration: summary.rawDuration,
      actualHours: summary.actualHours,
      payableHours: summary.payableHours,
      totalHours: summary.actualHours,
      totalMinutes: summary.workedMinutes,
      breakMinutes: summary.breakMinutes,
      clockInNotes: clockInLog?.notes || null,
      clockOutNotes: clockOutLog?.notes || null,
    };
  });
}
