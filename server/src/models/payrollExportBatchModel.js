import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";
import { nowIso } from "../utils/time.js";
import { HttpError } from "../utils/errors.js";

function toRoundedHours(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeShiftIds(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim());
}

function normalizeRows(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeFilters(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBatch(batch) {
  const shiftIds = normalizeShiftIds(batch.shiftIds);
  return {
    id: batch.id,
    createdBy: batch.createdBy || null,
    createdAt: batch.createdAt || null,
    fileName: batch.fileName || `payroll-export-${batch.id || "batch"}.csv`,
    shiftCount:
      typeof batch.shiftCount === "number" && Number.isFinite(batch.shiftCount)
        ? batch.shiftCount
        : shiftIds.length,
    totalPayableHours: toRoundedHours(batch.totalPayableHours),
    filters: normalizeFilters(batch.filters),
    shiftIds,
    rows: normalizeRows(batch.rows),
    csvContent: typeof batch.csvContent === "string" ? batch.csvContent : "",
  };
}

function parseJsonColumn(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDbBatch(row) {
  return normalizeBatch({
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    fileName: row.file_name,
    shiftCount: Number(row.shift_count) || 0,
    totalPayableHours: row.total_payable_hours,
    filters: parseJsonColumn(row.filters, {}),
    shiftIds: parseJsonColumn(row.shift_ids, []),
    rows: parseJsonColumn(row.rows_snapshot, []),
    csvContent: row.csv_content,
  });
}

function sortNewestFirst(a, b) {
  return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
}

function assertShiftEligibleForExport(shift) {
  if (!shift) {
    throw new HttpError(404, "One or more shifts could not be found for payroll export");
  }

  if (!shift.clockOutAt) {
    throw new HttpError(409, "Payroll export only supports closed shifts");
  }

  if (shift.reviewStatus !== "reviewed") {
    throw new HttpError(409, "Payroll export only supports reviewed shifts");
  }

  if (shift.payrollStatus !== "approved") {
    throw new HttpError(409, "Payroll export only supports payroll-approved shifts");
  }
}

function buildBatchLogs(batchId, shiftIds, actorUserId, timestamp) {
  return shiftIds.map((shiftId) => ({
    id: crypto.randomUUID(),
    userId: actorUserId,
    shiftId,
    actionType: "admin_payroll_exported",
    timestamp,
    notes: `Shift exported in payroll batch ${batchId}.`,
    createdAt: timestamp,
  }));
}

export async function listPayrollExportBatches(limit = 10) {
  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 10;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return normalizeRows(db.payrollExportBatches)
      .map(normalizeBatch)
      .sort(sortNewestFirst)
      .slice(0, safeLimit);
  }

  const result = await query(
    `SELECT * FROM payroll_export_batches ORDER BY created_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(normalizeDbBatch);
}

export async function getPayrollExportBatchById(batchId) {
  if (!batchId || typeof batchId !== "string") return null;

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const batch = normalizeRows(db.payrollExportBatches).find((item) => item.id === batchId) || null;
    return batch ? normalizeBatch(batch) : null;
  }

  const result = await query(`SELECT * FROM payroll_export_batches WHERE id = $1 LIMIT 1`, [batchId]);
  if (result.rows.length === 0) return null;
  return normalizeDbBatch(result.rows[0]);
}

export async function createPayrollExportBatch({ actorUserId, filters = {}, rows = [], csvContent = "", fileName }) {
  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(409, "No payroll-approved shifts are available to export");
  }

  if (typeof csvContent !== "string" || !csvContent.trim()) {
    throw new HttpError(400, "csvContent is required");
  }

  const shiftIds = [...new Set(rows.map((row) => row?.shiftId).filter((item) => typeof item === "string" && item))];
  if (shiftIds.length === 0) {
    throw new HttpError(409, "No payroll-approved shifts are available to export");
  }

  const batchId = crypto.randomUUID();
  const createdAt = nowIso();
  const totalPayableHours = toRoundedHours(
    rows.reduce((sum, row) => sum + (typeof row?.payableHours === "number" ? row.payableHours : 0), 0)
  );

  const batch = normalizeBatch({
    id: batchId,
    createdBy: actorUserId,
    createdAt,
    fileName: fileName || `payroll-export-${createdAt.slice(0, 10)}-${batchId.slice(0, 8)}.csv`,
    shiftCount: shiftIds.length,
    totalPayableHours,
    filters,
    shiftIds,
    rows,
    csvContent,
  });

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.payrollExportBatches)) db.payrollExportBatches = [];
    if (!Array.isArray(db.timeLogs)) db.timeLogs = [];

    const shiftIndex = new Map(normalizeRows(db.shifts).map((shift) => [shift.id, shift]));
    for (const shiftId of shiftIds) {
      assertShiftEligibleForExport(shiftIndex.get(shiftId));
    }

    for (const shiftId of shiftIds) {
      const shift = shiftIndex.get(shiftId);
      shift.payrollStatus = "exported";
      shift.payrollExportedBy = actorUserId;
      shift.payrollExportedAt = createdAt;
      shift.updatedAt = createdAt;
    }

    db.timeLogs.push(
      ...buildBatchLogs(batchId, shiftIds, actorUserId, createdAt).map((log) => ({
        ...log,
        location: null,
        geofence: null,
      }))
    );
    db.payrollExportBatches.unshift(batch);
    await writeDatabaseToJson(db);
    return batch;
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const shiftsResult = await client.query(
        `SELECT id, clock_out_at, review_status, payroll_status FROM shifts WHERE id = ANY($1::text[]) FOR UPDATE`,
        [shiftIds]
      );

      if (shiftsResult.rows.length !== shiftIds.length) {
        throw new HttpError(404, "One or more shifts could not be found for payroll export");
      }

      const shiftIndex = new Map(
        shiftsResult.rows.map((row) => [row.id, {
          id: row.id,
          clockOutAt: row.clock_out_at instanceof Date ? row.clock_out_at.toISOString() : row.clock_out_at,
          reviewStatus: row.review_status || null,
          payrollStatus: row.payroll_status || null,
        }])
      );

      for (const shiftId of shiftIds) {
        assertShiftEligibleForExport(shiftIndex.get(shiftId));
      }

      await client.query(
        `INSERT INTO payroll_export_batches (
          id, created_by, shift_count, total_payable_hours, filters, shift_ids, rows_snapshot, csv_content, file_name, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)`,
        [
          batch.id,
          batch.createdBy,
          batch.shiftCount,
          batch.totalPayableHours,
          JSON.stringify(batch.filters),
          JSON.stringify(batch.shiftIds),
          JSON.stringify(batch.rows),
          batch.csvContent,
          batch.fileName,
          batch.createdAt,
        ]
      );

      await client.query(
        `UPDATE shifts
        SET payroll_status = 'exported',
            payroll_exported_by = $1,
            payroll_exported_at = $2,
            updated_at = $2
        WHERE id = ANY($3::text[])`,
        [actorUserId, createdAt, shiftIds]
      );

      for (const log of buildBatchLogs(batchId, shiftIds, actorUserId, createdAt)) {
        await client.query(
          `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [log.id, log.userId, log.shiftId, log.actionType, log.timestamp, null, null, log.notes, log.createdAt]
        );
      }

      await client.query("COMMIT");
      return batch;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}