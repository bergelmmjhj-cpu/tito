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
import { calculateDistanceMeters } from "./geofenceService.js";
import { HttpError } from "../utils/errors.js";
import { minutesBetween } from "../utils/time.js";

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

function resolveStatus(userId) {
  const openShift = getOpenShiftForUser(userId);
  if (!openShift) {
    const hasPastShifts = getAllShiftsForUser(userId).length > 0;
    return hasPastShifts ? "clocked_out" : "not_clocked_in";
  }

  return getActiveBreak(openShift) ? "on_break" : "clocked_in";
}

function calculateBreakMinutes(shift) {
  if (!Array.isArray(shift.breaks)) return 0;
  return shift.breaks.reduce((sum, item) => {
    if (!item.startAt || !item.endAt) return sum;
    return sum + minutesBetween(item.startAt, item.endAt);
  }, 0);
}

function calculateWorkedMinutes(shift) {
  if (!shift.clockInAt || !shift.clockOutAt) return 0;
  const total = minutesBetween(shift.clockInAt, shift.clockOutAt);
  const breakMinutes = calculateBreakMinutes(shift);
  return Math.max(0, total - breakMinutes);
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

function resolveWorkplaceAssignment(userId) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "User not found");

  const workplaceId = user.profile?.assignedWorkplaceId || null;
  if (!workplaceId) {
    return {
      assignmentRequired: false,
      workplace: null,
      assignment: null,
    };
  }

  const workplace = findWorkplaceById(workplaceId);
  return {
    assignmentRequired: true,
    assignment: workplaceId,
    workplace: workplace || null,
  };
}

function evaluateGeofenceForAction(userId, location) {
  const assignment = resolveWorkplaceAssignment(userId);
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
    };
  }

  if (!location) {
    return {
      assignmentRequired: true,
      workplaceId: assignment.workplace.id,
      workplaceName: assignment.workplace.name,
      radiusMeters: assignment.workplace.geofenceRadiusMeters,
      distanceMeters: null,
      withinGeofence: null,
      enforcementEnabled: ENFORCE_CLOCKIN_GEOFENCE,
    };
  }

  const distanceMeters = calculateDistanceMeters(
    { latitude: location.latitude, longitude: location.longitude },
    { latitude: assignment.workplace.latitude, longitude: assignment.workplace.longitude }
  );

  const radiusMeters = assignment.workplace.geofenceRadiusMeters;
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

export function getCurrentStatus(userId) {
  const openShift = getOpenShiftForUser(userId);
  const assignment = resolveWorkplaceAssignment(userId);

  return {
    status: resolveStatus(userId),
    openShift,
    workplaceAssignment: {
      assignedWorkplaceId: assignment.assignment || null,
      assignedWorkplaceName: assignment.workplace?.name || null,
      geofenceRadiusMeters: assignment.workplace?.geofenceRadiusMeters || null,
    },
  };
}

export function performAction(userId, actionType, notes, location) {
  const normalizedAction = typeof actionType === "string" ? actionType.trim() : "";
  const cleanNotes = validateNotes(notes);
  const cleanLocation = parseActionLocation(normalizedAction, location);
  const geofenceEvaluation = evaluateGeofenceForAction(userId, cleanLocation);
  const openShift = getOpenShiftForUser(userId);
  const activeBreak = getActiveBreak(openShift);

  if (normalizedAction === "clock_in") {
    if (openShift) throw new HttpError(409, "Cannot clock in: shift already open");

    if (geofenceEvaluation.assignmentUnavailable) {
      throw new HttpError(409, "Assigned workplace is unavailable or inactive");
    }

    if (
      ENFORCE_CLOCKIN_GEOFENCE &&
      geofenceEvaluation.assignmentRequired &&
      geofenceEvaluation.withinGeofence === false
    ) {
      throw new HttpError(
        403,
        `Clock in blocked: ${geofenceEvaluation.distanceMeters}m from ${geofenceEvaluation.workplaceName} (limit ${geofenceEvaluation.radiusMeters}m)`
      );
    }

    saveClockIn(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "break_start") {
    if (!openShift) throw new HttpError(409, "Cannot start break: not clocked in");
    if (activeBreak) throw new HttpError(409, "Cannot start break: break already active");
    saveStartBreak(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "break_end") {
    if (!openShift) throw new HttpError(409, "Cannot end break: not clocked in");
    if (!activeBreak) throw new HttpError(409, "Cannot end break: no active break");
    saveEndBreak(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else if (normalizedAction === "clock_out") {
    if (!openShift) throw new HttpError(409, "Cannot clock out: not clocked in");
    if (activeBreak) throw new HttpError(409, "Cannot clock out during break");
    saveClockOut(userId, cleanNotes, cleanLocation, geofenceEvaluation);
  } else {
    throw new HttpError(400, "Invalid actionType");
  }

  return {
    ...getCurrentStatus(userId),
    geofenceEvaluation,
  };
}

export function getAttendanceActionHistory(userId) {
  const logs = getTimeLogsForUser(userId)
    .slice()
    .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""));

  return logs.map((log) => ({
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

export function getAttendanceHistory(userId) {
  const shifts = getAllShiftsForUser(userId)
    .slice()
    .sort((a, b) => Date.parse(b.clockInAt || "") - Date.parse(a.clockInAt || ""));

  return shifts.map((shift) => {
    const breakStart = shift.breaks?.map((item) => item.startAt).filter(Boolean) || [];
    const breakEnd = shift.breaks?.map((item) => item.endAt).filter(Boolean) || [];
    const totalMinutes = calculateWorkedMinutes(shift);

    return {
      shiftId: shift.id,
      date: shift.clockInAt ? shift.clockInAt.slice(0, 10) : null,
      timeIn: shift.clockInAt || null,
      breakStart,
      breakEnd,
      timeOut: shift.clockOutAt || null,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      totalMinutes,
    };
  });
}
