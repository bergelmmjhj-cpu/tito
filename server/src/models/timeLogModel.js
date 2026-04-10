import crypto from "node:crypto";
import { readDatabase, updateDatabase } from "../db/database.js";
import { nowIso } from "../utils/time.js";

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

export function getAllShiftsForUser(userId) {
  const db = readDatabase();
  return db.shifts.filter((shift) => shift.userId === userId);
}

export function getOpenShiftForUser(userId) {
  const db = readDatabase();
  return db.shifts.find((shift) => shift.userId === userId && !shift.clockOutAt) || null;
}

export function getTimeLogsForUser(userId) {
  const db = readDatabase();
  return db.timeLogs.filter((log) => log.userId === userId);
}

export function saveClockIn(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  return updateDatabase((db) => {
    const shift = {
      id: crypto.randomUUID(),
      userId,
      clockInAt: timestamp,
      clockOutAt: null,
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

    return shift;
  });
}

export function saveStartBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  return updateDatabase((db) => {
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

    return shift;
  });
}

export function saveEndBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  return updateDatabase((db) => {
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

    return shift;
  });
}

export function saveClockOut(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  return updateDatabase((db) => {
    const shift = db.shifts.find((item) => item.userId === userId && !item.clockOutAt);
    if (!shift) return null;

    shift.clockOutAt = timestamp;
    shift.updatedAt = timestamp;

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

    return shift;
  });
}
