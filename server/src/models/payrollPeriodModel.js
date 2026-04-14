import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";
import { nowIso } from "../utils/time.js";
import { HttpError } from "../utils/errors.js";

const PERIOD_STATUSES = new Set(["open", "locked"]);
const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 100;
const LABEL_MAX_LENGTH = 120;

function normalizeRows(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function normalizeStatus(value) {
  return PERIOD_STATUSES.has(value) ? value : "open";
}

function normalizeLabel(value, startDate, endDate) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, LABEL_MAX_LENGTH);
  }

  return `${startDate} to ${endDate}`;
}

function normalizeDbDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return normalizeDate(value);
}

function normalizePeriod(period) {
  const startDate = normalizeDate(period.startDate);
  const endDate = normalizeDate(period.endDate);

  return {
    id: period.id,
    label: normalizeLabel(period.label, startDate || "", endDate || ""),
    startDate,
    endDate,
    status: normalizeStatus(period.status),
    createdBy: period.createdBy || null,
    createdAt: period.createdAt || null,
    lockedBy: period.lockedBy || null,
    lockedAt: period.lockedAt || null,
    reopenedBy: period.reopenedBy || null,
    reopenedAt: period.reopenedAt || null,
  };
}

function normalizeDbPeriod(row) {
  return normalizePeriod({
    id: row.id,
    label: row.label,
    startDate: normalizeDbDate(row.start_date),
    endDate: normalizeDbDate(row.end_date),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at instanceof Date ? row.locked_at.toISOString() : row.locked_at,
    reopenedBy: row.reopened_by,
    reopenedAt: row.reopened_at instanceof Date ? row.reopened_at.toISOString() : row.reopened_at,
  });
}

function sortNewestFirst(a, b) {
  if (a.endDate !== b.endDate) {
    return a.endDate < b.endDate ? 1 : -1;
  }

  if (a.startDate !== b.startDate) {
    return a.startDate < b.startDate ? 1 : -1;
  }

  return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
}

function assertValidDateRange(startDate, endDate) {
  if (!startDate) {
    throw new HttpError(400, "startDate must use YYYY-MM-DD format");
  }

  if (!endDate) {
    throw new HttpError(400, "endDate must use YYYY-MM-DD format");
  }

  if (startDate > endDate) {
    throw new HttpError(400, "startDate must be on or before endDate");
  }
}

function assertNoOverlap(periods, startDate, endDate, ignoreId = null) {
  const overlap = periods.find((period) => {
    if (!period || period.id === ignoreId) return false;
    if (!period.startDate || !period.endDate) return false;
    return period.startDate <= endDate && period.endDate >= startDate;
  });

  if (overlap) {
    throw new HttpError(409, `Pay period overlaps existing period ${overlap.label}`);
  }
}

function assertPeriodAvailableForLock(period) {
  if (!period) {
    throw new HttpError(404, "Pay period not found");
  }

  if (period.status === "locked") {
    throw new HttpError(409, "Pay period is already locked");
  }
}

function assertPeriodAvailableForReopen(period) {
  if (!period) {
    throw new HttpError(404, "Pay period not found");
  }

  if (period.status !== "locked") {
    throw new HttpError(409, "Pay period is already open");
  }
}

function toSafeLimit(limit) {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
}

export async function listPayrollPeriods(limit = DEFAULT_LIST_LIMIT) {
  const safeLimit = toSafeLimit(limit);

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return normalizeRows(db.payrollPeriods)
      .map(normalizePeriod)
      .sort(sortNewestFirst)
      .slice(0, safeLimit);
  }

  const result = await query(
    `SELECT * FROM payroll_periods ORDER BY end_date DESC, start_date DESC, created_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(normalizeDbPeriod);
}

export async function getPayrollPeriodById(periodId) {
  if (!periodId || typeof periodId !== "string") return null;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const period = normalizeRows(db.payrollPeriods).find((item) => item.id === periodId) || null;
    return period ? normalizePeriod(period) : null;
  }

  const result = await query(`SELECT * FROM payroll_periods WHERE id = $1 LIMIT 1`, [periodId]);
  if (result.rows.length === 0) return null;
  return normalizeDbPeriod(result.rows[0]);
}

export async function getPayrollPeriodForBusinessDate(businessDate) {
  const normalizedDate = normalizeDate(businessDate);
  if (!normalizedDate) return null;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (
      normalizeRows(db.payrollPeriods)
        .map(normalizePeriod)
        .sort(sortNewestFirst)
        .find((period) => period.startDate <= normalizedDate && period.endDate >= normalizedDate) || null
    );
  }

  const result = await query(
    `SELECT *
     FROM payroll_periods
     WHERE start_date <= $1 AND end_date >= $1
     ORDER BY start_date DESC, created_at DESC
     LIMIT 1`,
    [normalizedDate]
  );
  if (result.rows.length === 0) return null;
  return normalizeDbPeriod(result.rows[0]);
}

export async function createPayrollPeriod({ actorUserId, startDate, endDate, label }) {
  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  const normalizedStartDate = normalizeDate(startDate);
  const normalizedEndDate = normalizeDate(endDate);
  assertValidDateRange(normalizedStartDate, normalizedEndDate);

  const createdAt = nowIso();
  const period = normalizePeriod({
    id: crypto.randomUUID(),
    label,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    status: "open",
    createdBy: actorUserId,
    createdAt,
    lockedBy: null,
    lockedAt: null,
    reopenedBy: null,
    reopenedAt: null,
  });

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.payrollPeriods)) db.payrollPeriods = [];

    const existingPeriods = normalizeRows(db.payrollPeriods).map(normalizePeriod);
    assertNoOverlap(existingPeriods, period.startDate, period.endDate);

    db.payrollPeriods.push(period);
    await writeDatabaseToJson(db);
    return period;
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const overlapResult = await client.query(
        `SELECT id, label
         FROM payroll_periods
         WHERE start_date <= $2 AND end_date >= $1
         LIMIT 1
         FOR UPDATE`,
        [period.startDate, period.endDate]
      );

      if (overlapResult.rows.length > 0) {
        throw new HttpError(409, `Pay period overlaps existing period ${overlapResult.rows[0].label || overlapResult.rows[0].id}`);
      }

      await client.query(
        `INSERT INTO payroll_periods (
          id, label, start_date, end_date, status, created_by, created_at, locked_by, locked_at, reopened_by, reopened_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          period.id,
          period.label,
          period.startDate,
          period.endDate,
          period.status,
          period.createdBy,
          period.createdAt,
          period.lockedBy,
          period.lockedAt,
          period.reopenedBy,
          period.reopenedAt,
        ]
      );

      await client.query("COMMIT");
      return period;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function lockPayrollPeriod(periodId, actorUserId) {
  if (!periodId || typeof periodId !== "string") {
    throw new HttpError(400, "periodId is required");
  }

  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  const lockedAt = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.payrollPeriods)) db.payrollPeriods = [];

    const period = db.payrollPeriods.find((item) => item.id === periodId) || null;
    assertPeriodAvailableForLock(period);

    period.status = "locked";
    period.lockedBy = actorUserId;
    period.lockedAt = lockedAt;

    await writeDatabaseToJson(db);
    return normalizePeriod(period);
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await client.query(
        `SELECT * FROM payroll_periods WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [periodId]
      );
      const period = result.rows[0] ? normalizeDbPeriod(result.rows[0]) : null;
      assertPeriodAvailableForLock(period);

      await client.query(
        `UPDATE payroll_periods
         SET status = 'locked', locked_by = $2, locked_at = $3
         WHERE id = $1`,
        [periodId, actorUserId, lockedAt]
      );

      await client.query("COMMIT");
      return getPayrollPeriodById(periodId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function reopenPayrollPeriod(periodId, actorUserId) {
  if (!periodId || typeof periodId !== "string") {
    throw new HttpError(400, "periodId is required");
  }

  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  const reopenedAt = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.payrollPeriods)) db.payrollPeriods = [];

    const period = db.payrollPeriods.find((item) => item.id === periodId) || null;
    assertPeriodAvailableForReopen(period);

    period.status = "open";
    period.reopenedBy = actorUserId;
    period.reopenedAt = reopenedAt;

    await writeDatabaseToJson(db);
    return normalizePeriod(period);
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await client.query(
        `SELECT * FROM payroll_periods WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [periodId]
      );
      const period = result.rows[0] ? normalizeDbPeriod(result.rows[0]) : null;
      assertPeriodAvailableForReopen(period);

      await client.query(
        `UPDATE payroll_periods
         SET status = 'open', reopened_by = $2, reopened_at = $3
         WHERE id = $1`,
        [periodId, actorUserId, reopenedAt]
      );

      await client.query("COMMIT");
      return getPayrollPeriodById(periodId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}