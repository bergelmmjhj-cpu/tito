import crypto from "node:crypto";
import { withClient } from "../db/pool.js";
import {
  isDatabaseReady,
  readDatabaseFromJson,
  writeDatabaseToJson,
} from "../db/initialization.js";

const DEFAULT_AUTO_CLOCK_OUT_HOURS = Number(process.env.AUTO_CLOCK_OUT_HOURS || 14);

function toFixedHours(value) {
  return Number(Number(value).toFixed(2));
}

export function getAutoClockOutHours() {
  const parsed = Number(process.env.AUTO_CLOCK_OUT_HOURS || DEFAULT_AUTO_CLOCK_OUT_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 14;
  return parsed;
}

function buildAutoClockOutNote(hours) {
  return `Auto-clocked out by system after ${hours} hour threshold`;
}

async function runJsonAutoClockOut(hours) {
  const db = await readDatabaseFromJson();
  if (!Array.isArray(db.shifts)) return { processed: 0, shiftIds: [] };

  const nowMs = Date.now();
  const thresholdMs = hours * 60 * 60 * 1000;
  let processed = 0;
  const shiftIds = [];

  if (!Array.isArray(db.timeLogs)) db.timeLogs = [];

  for (const shift of db.shifts) {
    if (!shift || shift.clockOutAt) continue;
    const clockInMs = Date.parse(shift.clockInAt || "");
    if (Number.isNaN(clockInMs)) continue;
    if (nowMs - clockInMs < thresholdMs) continue;

    const autoClockOutAt = new Date(clockInMs + thresholdMs).toISOString();
    const note = buildAutoClockOutNote(hours);
    const nowIso = new Date().toISOString();

    shift.clockOutAt = autoClockOutAt;
    shift.actualHours = toFixedHours(hours);
    shift.payableHours = toFixedHours(hours);
    shift.reviewStatus = "reviewed";
    shift.reviewNote = note;
    shift.reviewedAt = nowIso;
    shift.updatedAt = nowIso;

    db.timeLogs.push({
      id: crypto.randomUUID(),
      userId: shift.userId,
      shiftId: shift.id,
      actionType: "auto_clock_out",
      timestamp: nowIso,
      location: null,
      geofence: null,
      notes: note,
      createdAt: nowIso,
    });

    processed += 1;
    shiftIds.push(shift.id);
  }

  if (processed > 0) {
    await writeDatabaseToJson(db);
  }

  return { processed, shiftIds };
}

async function runPostgresAutoClockOut(hours) {
  const note = buildAutoClockOutNote(hours);
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const updated = await client.query(
        `WITH stale_shifts AS (
           SELECT id, user_id, clock_in_at,
                  (clock_in_at + ($1::text || ' hours')::interval) AS auto_clock_out_at
           FROM shifts
           WHERE clock_out_at IS NULL
             AND clock_in_at < NOW() - ($1::text || ' hours')::interval
         )
         UPDATE shifts s
         SET clock_out_at = ss.auto_clock_out_at,
             actual_hours = $1::numeric(10,2),
             payable_hours = $1::numeric(10,2),
             review_status = 'reviewed',
             review_note = $2,
             reviewed_at = NOW(),
             updated_at = NOW()
         FROM stale_shifts ss
         WHERE s.id = ss.id
         RETURNING s.id, s.user_id`,
        [hours, note]
      );

      for (const row of updated.rows || []) {
        await client.query(
          `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
           VALUES ($1, $2, $3, $4, NOW(), NULL, NULL, $5, NOW())`,
          [crypto.randomUUID(), row.user_id, row.id, "auto_clock_out", note]
        );
      }

      await client.query("COMMIT");
      const shiftIds = (updated.rows || []).map((row) => row.id);
      return { processed: shiftIds.length, shiftIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function runAutoClockOutSweep() {
  const hours = getAutoClockOutHours();

  if (!isDatabaseReady()) {
    return runJsonAutoClockOut(hours);
  }

  return runPostgresAutoClockOut(hours);
}
