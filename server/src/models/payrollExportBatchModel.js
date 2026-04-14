import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";
import { nowIso } from "../utils/time.js";
import { HttpError } from "../utils/errors.js";

const BATCH_STATUSES = new Set(["active", "reopened", "replaced"]);

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

function normalizeBatchStatus(value) {
  return BATCH_STATUSES.has(value) ? value : "active";
}

function normalizeBatch(batch) {
  const shiftIds = normalizeShiftIds(batch.shiftIds);
  return {
    id: batch.id,
    status: normalizeBatchStatus(batch.status),
    payPeriodId: batch.payPeriodId || null,
    createdBy: batch.createdBy || null,
    createdAt: batch.createdAt || null,
    reopenedBy: batch.reopenedBy || null,
    reopenedAt: batch.reopenedAt || null,
    reopenedNote:
      typeof batch.reopenedNote === "string" && batch.reopenedNote.trim()
        ? batch.reopenedNote.trim()
        : null,
    supersedesBatchId: batch.supersedesBatchId || null,
    replacedByBatchId: batch.replacedByBatchId || null,
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
    status: row.status,
    payPeriodId: row.pay_period_id,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    reopenedBy: row.reopened_by,
    reopenedAt: row.reopened_at instanceof Date ? row.reopened_at.toISOString() : row.reopened_at,
    reopenedNote: row.reopened_note,
    supersedesBatchId: row.supersedes_batch_id,
    replacedByBatchId: row.replaced_by_batch_id,
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

function assertBatchAvailableForReopen(batch) {
  if (!batch) {
    throw new HttpError(404, "Payroll export batch not found");
  }

  if (batch.status === "reopened") {
    throw new HttpError(409, "Payroll export batch is already reopened");
  }

  if (batch.status === "replaced") {
    throw new HttpError(409, "Payroll export batch has already been replaced");
  }
}

function assertBatchAvailableForReissue(batch) {
  if (!batch) {
    throw new HttpError(404, "Payroll export batch not found");
  }

  if (batch.status !== "reopened") {
    throw new HttpError(409, "Payroll export batch must be reopened before it can be reissued");
  }

  if (batch.replacedByBatchId) {
    throw new HttpError(409, "Payroll export batch has already been replaced");
  }
}

function matchesBatchExportedShift(shift, batchId) {
  if (!shift) return false;
  if (shift.payrollStatus !== "exported") return false;
  if (typeof shift.payrollExportBatchId === "string" && shift.payrollExportBatchId.trim()) {
    return shift.payrollExportBatchId === batchId;
  }
  return true;
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

export async function createPayrollExportBatch({
  actorUserId,
  filters = {},
  rows = [],
  csvContent = "",
  fileName,
  payPeriodId = null,
  supersedesBatchId = null,
}) {
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
    status: "active",
    payPeriodId,
    createdBy: actorUserId,
    createdAt,
    reopenedBy: null,
    reopenedAt: null,
    reopenedNote: null,
    supersedesBatchId,
    replacedByBatchId: null,
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

    let supersededBatch = null;
    if (supersedesBatchId) {
      supersededBatch = normalizeRows(db.payrollExportBatches).find((item) => item.id === supersedesBatchId) || null;
      assertBatchAvailableForReissue(supersededBatch);
    }

    const shiftIndex = new Map(normalizeRows(db.shifts).map((shift) => [shift.id, shift]));
    for (const shiftId of shiftIds) {
      assertShiftEligibleForExport(shiftIndex.get(shiftId));
    }

    for (const shiftId of shiftIds) {
      const shift = shiftIndex.get(shiftId);
      shift.payrollStatus = "exported";
      shift.payrollExportedBy = actorUserId;
      shift.payrollExportedAt = createdAt;
      shift.payrollExportBatchId = batchId;
      shift.updatedAt = createdAt;
    }

    if (supersededBatch) {
      supersededBatch.status = "replaced";
      supersededBatch.replacedByBatchId = batchId;
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
        `SELECT id, clock_out_at, review_status, payroll_status, payroll_export_batch_id FROM shifts WHERE id = ANY($1::text[]) FOR UPDATE`,
        [shiftIds]
      );

      let supersededBatch = null;
      if (supersedesBatchId) {
        const batchResult = await client.query(
            `SELECT id, status, pay_period_id, replaced_by_batch_id FROM payroll_export_batches WHERE id = $1 LIMIT 1 FOR UPDATE`,
          [supersedesBatchId]
        );
        supersededBatch = batchResult.rows[0]
          ? normalizeBatch({
              id: batchResult.rows[0].id,
              status: batchResult.rows[0].status,
                payPeriodId: batchResult.rows[0].pay_period_id,
              replacedByBatchId: batchResult.rows[0].replaced_by_batch_id,
            })
          : null;
        assertBatchAvailableForReissue(supersededBatch);
      }

      if (shiftsResult.rows.length !== shiftIds.length) {
        throw new HttpError(404, "One or more shifts could not be found for payroll export");
      }

      const shiftIndex = new Map(
        shiftsResult.rows.map((row) => [row.id, {
          id: row.id,
          clockOutAt: row.clock_out_at instanceof Date ? row.clock_out_at.toISOString() : row.clock_out_at,
          reviewStatus: row.review_status || null,
          payrollStatus: row.payroll_status || null,
          payrollExportBatchId: row.payroll_export_batch_id || null,
        }])
      );

      for (const shiftId of shiftIds) {
        assertShiftEligibleForExport(shiftIndex.get(shiftId));
      }

      await client.query(
        `INSERT INTO payroll_export_batches (
          id, status, pay_period_id, created_by, reopened_by, reopened_at, reopened_note,
          supersedes_batch_id, replaced_by_batch_id,
          shift_count, total_payable_hours, filters, shift_ids, rows_snapshot, csv_content, file_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17)`,
        [
          batch.id,
          batch.status,
          batch.payPeriodId,
          batch.createdBy,
          batch.reopenedBy,
          batch.reopenedAt,
          batch.reopenedNote,
          batch.supersedesBatchId,
          batch.replacedByBatchId,
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

      if (supersededBatch) {
        await client.query(
          `UPDATE payroll_export_batches
           SET status = 'replaced', replaced_by_batch_id = $2
           WHERE id = $1`,
          [supersedesBatchId, batch.id]
        );
      }

      await client.query(
        `UPDATE shifts
        SET payroll_status = 'exported',
            payroll_exported_by = $1,
            payroll_exported_at = $2,
            payroll_export_batch_id = $3,
            updated_at = $2
        WHERE id = ANY($4::text[])`,
        [actorUserId, createdAt, batchId, shiftIds]
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

export async function reopenPayrollExportBatch(batchId, actorUserId, note) {
  if (!batchId || typeof batchId !== "string") {
    throw new HttpError(400, "batchId is required");
  }

  if (!actorUserId || typeof actorUserId !== "string") {
    throw new HttpError(400, "actorUserId is required");
  }

  if (typeof note !== "string" || !note.trim()) {
    throw new HttpError(400, "note is required");
  }

  const reopenedAt = nowIso();
  const reopenedNote = note.trim();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    if (!Array.isArray(db.payrollExportBatches)) db.payrollExportBatches = [];
    if (!Array.isArray(db.timeLogs)) db.timeLogs = [];

    const batch = db.payrollExportBatches.find((item) => item.id === batchId) || null;
    assertBatchAvailableForReopen(batch);

    const shiftIndex = new Map(normalizeRows(db.shifts).map((shift) => [shift.id, shift]));
    for (const shiftId of normalizeShiftIds(batch.shiftIds)) {
      const shift = shiftIndex.get(shiftId);
      if (!matchesBatchExportedShift(shift, batchId)) {
        throw new HttpError(409, "Payroll export batch can only be reopened while its shifts remain exported");
      }
    }

    for (const shiftId of normalizeShiftIds(batch.shiftIds)) {
      const shift = shiftIndex.get(shiftId);
      shift.payrollStatus = "approved";
      shift.payrollExportedBy = null;
      shift.payrollExportedAt = null;
      shift.payrollExportBatchId = null;
      shift.updatedAt = reopenedAt;
    }

    batch.status = "reopened";
    batch.reopenedBy = actorUserId;
    batch.reopenedAt = reopenedAt;
    batch.reopenedNote = reopenedNote;

    db.timeLogs.push(
      ...normalizeShiftIds(batch.shiftIds).map((shiftId) => ({
        id: crypto.randomUUID(),
        userId: actorUserId,
        shiftId,
        actionType: "admin_payroll_reopened",
        timestamp: reopenedAt,
        location: null,
        geofence: null,
        notes: `Payroll export batch ${batchId} reopened. ${reopenedNote}`,
        createdAt: reopenedAt,
      }))
    );

    await writeDatabaseToJson(db);
    return normalizeBatch(batch);
  }

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const batchResult = await client.query(
        `SELECT * FROM payroll_export_batches WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [batchId]
      );
      const batch = batchResult.rows[0] ? normalizeDbBatch(batchResult.rows[0]) : null;
      assertBatchAvailableForReopen(batch);

      const shiftsResult = await client.query(
        `SELECT id, payroll_status, payroll_export_batch_id FROM shifts WHERE id = ANY($1::text[]) FOR UPDATE`,
        [batch.shiftIds]
      );

      const shiftIndex = new Map(
        shiftsResult.rows.map((row) => [row.id, {
          id: row.id,
          payrollStatus: row.payroll_status || null,
          payrollExportBatchId: row.payroll_export_batch_id || null,
        }])
      );

      if (shiftIndex.size !== batch.shiftIds.length) {
        throw new HttpError(404, "One or more shifts in the payroll export batch could not be found");
      }

      for (const shiftId of batch.shiftIds) {
        if (!matchesBatchExportedShift(shiftIndex.get(shiftId), batchId)) {
          throw new HttpError(409, "Payroll export batch can only be reopened while its shifts remain exported");
        }
      }

      await client.query(
        `UPDATE payroll_export_batches
         SET status = 'reopened', reopened_by = $2, reopened_at = $3, reopened_note = $4
         WHERE id = $1`,
        [batchId, actorUserId, reopenedAt, reopenedNote]
      );

      await client.query(
        `UPDATE shifts
         SET payroll_status = 'approved',
             payroll_exported_by = NULL,
             payroll_exported_at = NULL,
             payroll_export_batch_id = NULL,
             updated_at = $2
         WHERE id = ANY($1::text[])`,
        [batch.shiftIds, reopenedAt]
      );

      for (const shiftId of batch.shiftIds) {
        await client.query(
          `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            crypto.randomUUID(),
            actorUserId,
            shiftId,
            "admin_payroll_reopened",
            reopenedAt,
            null,
            null,
            `Payroll export batch ${batchId} reopened. ${reopenedNote}`,
            reopenedAt,
          ]
        );
      }

      await client.query("COMMIT");
      return getPayrollExportBatchById(batchId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}