import {
  getAllShiftsForUser,
  getOpenShiftForUser,
  saveClockIn,
  saveClockOut,
  saveEndBreak,
  saveStartBreak,
} from "../models/timeLogModel.js";
import { HttpError } from "../utils/errors.js";
import { minutesBetween } from "../utils/time.js";

const NOTES_MAX_LENGTH = 500; // keep notes concise for UI display and log storage

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

export function getCurrentStatus(userId) {
  const openShift = getOpenShiftForUser(userId);
  return {
    status: resolveStatus(userId),
    openShift,
  };
}

export function performAction(userId, actionType, notes) {
  const normalizedAction = typeof actionType === "string" ? actionType.trim() : "";
  const cleanNotes = validateNotes(notes);
  const openShift = getOpenShiftForUser(userId);
  const activeBreak = getActiveBreak(openShift);

  if (normalizedAction === "clock_in") {
    if (openShift) throw new HttpError(409, "Cannot clock in: shift already open");
    saveClockIn(userId, cleanNotes);
  } else if (normalizedAction === "break_start") {
    if (!openShift) throw new HttpError(409, "Cannot start break: not clocked in");
    if (activeBreak) throw new HttpError(409, "Cannot start break: break already active");
    saveStartBreak(userId, cleanNotes);
  } else if (normalizedAction === "break_end") {
    if (!openShift) throw new HttpError(409, "Cannot end break: not clocked in");
    if (!activeBreak) throw new HttpError(409, "Cannot end break: no active break");
    saveEndBreak(userId, cleanNotes);
  } else if (normalizedAction === "clock_out") {
    if (!openShift) throw new HttpError(409, "Cannot clock out: not clocked in");
    if (activeBreak) throw new HttpError(409, "Cannot clock out during break");
    saveClockOut(userId, cleanNotes);
  } else {
    throw new HttpError(400, "Invalid actionType");
  }

  return getCurrentStatus(userId);
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
