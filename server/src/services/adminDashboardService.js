import { query } from "../db/pool.js";
import { isDatabaseReady } from "../db/initialization.js";
import { listWorkplacesFromCrm } from "../models/crmWorkplaceModel.js";
import { isCrmPoolReady } from "../db/crmPool.js";

const OPEN_SHIFT_THRESHOLD_HOURS = Number(process.env.OPEN_SHIFT_THRESHOLD_HOURS || 8);
const AUTO_CLOCK_OUT_HOURS = Number(process.env.AUTO_CLOCK_OUT_HOURS || 14);

export function classifyOpenShiftAgeHours(ageHours, thresholdHours = OPEN_SHIFT_THRESHOLD_HOURS) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return "open";
  return ageHours >= thresholdHours ? "missing_clock_out" : "open";
}

export function getDashboardThresholds() {
  return {
    openShiftThresholdHours: OPEN_SHIFT_THRESHOLD_HOURS,
    autoClockOutHours: AUTO_CLOCK_OUT_HOURS,
  };
}

async function safeQuery(sql, params = []) {
  try {
    if (!isDatabaseReady()) return null;
    const result = await query(sql, params);
    return result.rows;
  } catch {
    return null;
  }
}

async function countActiveWorkers() {
  const rows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM users WHERE role = 'worker' AND is_active = true`
  );
  return rows?.[0]?.count ?? 0;
}

async function countClockedIn() {
  const rows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM shifts WHERE clock_out_at IS NULL`
  );
  return rows?.[0]?.count ?? 0;
}

async function countOpenShifts() {
  const rows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM shifts
     WHERE clock_out_at IS NULL
       AND clock_in_at >= NOW() - ($1::text || ' hours')::interval`,
    [OPEN_SHIFT_THRESHOLD_HOURS]
  );
  return rows?.[0]?.count ?? 0;
}

async function countMissingClockOuts() {
  const rows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM shifts
     WHERE clock_out_at IS NULL
       AND clock_in_at < NOW() - ($1::text || ' hours')::interval`,
    [OPEN_SHIFT_THRESHOLD_HOURS]
  );
  return rows?.[0]?.count ?? 0;
}

async function countExceptionsToday() {
  // Exceptions = open shifts today + shifts with open breaks today
  const rows = await safeQuery(
    `SELECT COUNT(DISTINCT s.id)::int AS count
     FROM shifts s
     LEFT JOIN breaks b ON b.shift_id = s.id AND b.end_at IS NULL
     WHERE s.business_date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
       AND (s.clock_out_at IS NULL OR b.id IS NOT NULL)`
  );
  return rows?.[0]?.count ?? 0;
}

async function countActiveWorkplaces() {
  // Try local workplaces table first
  const rows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM workplaces WHERE active = true`
  );
  let localCount = rows?.[0]?.count ?? 0;

  // Also count from CRM if available
  let crmCount = 0;
  if (isCrmPoolReady()) {
    try {
      const workplaces = await listWorkplacesFromCrm();
      crmCount = (workplaces || []).filter((w) => w.active !== false).length;
    } catch {
      crmCount = 0;
    }
  }

  // Return whichever is higher (prefer CRM if it exists)
  return crmCount > 0 ? crmCount : localCount;
}

async function sumHoursToday() {
  const rows = await safeQuery(
    `SELECT COALESCE(SUM(COALESCE(actual_hours, payable_hours, 0)), 0)::numeric(10,2) AS total
     FROM shifts
     WHERE DATE(clock_in_at AT TIME ZONE COALESCE(NULLIF(business_time_zone, ''), 'UTC'))
         = DATE(NOW() AT TIME ZONE COALESCE(NULLIF(business_time_zone, ''), 'UTC'))`
  );
  return Number(rows?.[0]?.total ?? 0);
}

async function sumHoursThisWeek() {
  const rows = await safeQuery(
    `SELECT COALESCE(SUM(actual_hours), 0)::numeric(10,2) AS total
     FROM shifts
     WHERE clock_in_at >= DATE_TRUNC('week', CURRENT_DATE)`
  );
  return Number(rows?.[0]?.total ?? 0);
}

export async function getAdminDashboardStats() {
  const [
    activeStaff,
    clockedIn,
    openShifts,
    missingClockOuts,
    exceptionsToday,
    activeWorkplaces,
    hoursToday,
    hoursThisWeek,
  ] = await Promise.all([
    countActiveWorkers(),
    countClockedIn(),
    countOpenShifts(),
    countMissingClockOuts(),
    countExceptionsToday(),
    countActiveWorkplaces(),
    sumHoursToday(),
    sumHoursThisWeek(),
  ]);

  return {
    activeStaff,
    clockedIn,
    openShifts,
    missingClockOuts,
    exceptionsToday,
    activeWorkplaces,
    hoursToday: Number(hoursToday.toFixed(2)),
    hoursThisWeek: Number(hoursThisWeek.toFixed(2)),
    thresholds: {
      openShiftThresholdHours: OPEN_SHIFT_THRESHOLD_HOURS,
      autoClockOutHours: AUTO_CLOCK_OUT_HOURS,
    },
    tooltips: {
      openShifts: `Open shifts are clocked-in shifts with no clock-out and elapsed time under ${OPEN_SHIFT_THRESHOLD_HOURS} hours.`,
      missingClockOuts: `Missing clock-outs are open shifts at or beyond ${OPEN_SHIFT_THRESHOLD_HOURS} hours without clock-out.`,
      hoursToday: "Hours Today sums shift hours by each shift's local business time zone date (UTC fallback).",
    },
    generatedAt: new Date().toISOString(),
  };
}
