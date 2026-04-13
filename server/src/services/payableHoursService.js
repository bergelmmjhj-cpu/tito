import { minutesBetween } from "../utils/time.js";

function normalizeMinutes(durationMinutes) {
  const parsed = Number(durationMinutes);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function toFixedHours(durationMinutes) {
  return Number((normalizeMinutes(durationMinutes) / 60).toFixed(2));
}

export function formatDurationMinutes(durationMinutes) {
  const minutes = normalizeMinutes(durationMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

export function computePayableHoursFromDuration(durationMinutes) {
  const minutes = normalizeMinutes(durationMinutes);
  let payableHours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder >= 55) {
    payableHours += 1;
  } else if (remainder >= 40) {
    payableHours += 0.75;
  } else if (remainder >= 25) {
    payableHours += 0.5;
  } else if (remainder >= 10) {
    payableHours += 0.25;
  }

  return Number(payableHours.toFixed(2));
}

export function calculateBreakMinutesFromShift(shift) {
  if (!Array.isArray(shift?.breaks)) return 0;

  return shift.breaks.reduce((sum, item) => {
    if (!item?.startAt || !item?.endAt) return sum;
    return sum + minutesBetween(item.startAt, item.endAt);
  }, 0);
}

export function calculateWorkedMinutesFromShift(shift) {
  if (!shift?.clockInAt || !shift?.clockOutAt) return null;
  const totalMinutes = minutesBetween(shift.clockInAt, shift.clockOutAt);
  return Math.max(0, totalMinutes - calculateBreakMinutesFromShift(shift));
}

export function buildShiftHourSummary(shift) {
  const breakMinutes = calculateBreakMinutesFromShift(shift);
  const workedMinutes = calculateWorkedMinutesFromShift(shift);

  if (workedMinutes === null) {
    return {
      breakMinutes,
      workedMinutes: null,
      actualHours: null,
      payableHours: null,
      rawDuration: null,
    };
  }

  return {
    breakMinutes,
    workedMinutes,
    actualHours: toFixedHours(workedMinutes),
    payableHours: computePayableHoursFromDuration(workedMinutes),
    rawDuration: formatDurationMinutes(workedMinutes),
  };
}