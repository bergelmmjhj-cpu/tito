import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { buildShiftHourSummary } from "../services/payableHoursService.js";
import { nowIso } from "../utils/time.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

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

function normalizeDbShift(dbShift, breaks = []) {
  const normalizedBreaks = breaks.map((b) => ({
    id: b.id,
    startAt: normalizeTimestamp(b.start_at),
    endAt: normalizeTimestamp(b.end_at),
  }));
  const summary = buildShiftHourSummary({
    clockInAt: normalizeTimestamp(dbShift.clock_in_at),
    clockOutAt: normalizeTimestamp(dbShift.clock_out_at),
    breaks: normalizedBreaks,
  });

  return {
    id: dbShift.id,
    userId: dbShift.user_id,
    clockInAt: normalizeTimestamp(dbShift.clock_in_at),
    clockOutAt: normalizeTimestamp(dbShift.clock_out_at),
    actualHours: toNumberOrNull(dbShift.actual_hours) ?? summary.actualHours,
    payableHours: toNumberOrNull(dbShift.payable_hours) ?? summary.payableHours,
    breaks: normalizedBreaks,
    createdAt: normalizeTimestamp(dbShift.created_at),
    updatedAt: normalizeTimestamp(dbShift.updated_at),
  };
}

function safeJsonParse(value, label) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[normalizeDbTimeLog] Failed to parse ${label}:`, String(value).slice(0, 80));
    return null;
  }
}

function normalizeDbTimeLog(dbLog) {
  return {
    id: dbLog.id,
    userId: dbLog.user_id,
    shiftId: dbLog.shift_id,
    actionType: dbLog.action_type,
    timestamp: normalizeTimestamp(dbLog.timestamp),
    location: safeJsonParse(dbLog.location, "location"),
    geofence: safeJsonParse(dbLog.geofence, "geofence"),
    notes: dbLog.notes,
    createdAt: normalizeTimestamp(dbLog.created_at),
  };
}

export async function getAllShiftsForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.shifts.filter((shift) => shift.userId === userId);
  }

  const result = await query(
    `SELECT s.* FROM shifts s WHERE s.user_id = $1 ORDER BY s.clock_in_at DESC`,
    [userId]
  );

  console.info("[timeLogModel.getAllShiftsForUser] fetched shifts", {
    userId,
    rowCount: result.rows.length,
  });

  return Promise.all(
    result.rows.map(async (shift) => {
      try {
        const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
          shift.id,
        ]);
        return normalizeDbShift(shift, breaksResult.rows);
      } catch (breaksError) {
        console.error(`[getAllShiftsForUser] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
        // Fallback: return shift without breaks rather than failing entire operation
        return normalizeDbShift(shift, []);
      }
    })
  );
}

export async function getAllShifts() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.shifts || []).slice();
  }

  const result = await query(`SELECT s.* FROM shifts s ORDER BY s.clock_in_at DESC`);

  console.info("[timeLogModel.getAllShifts] fetched shifts", {
    rowCount: result.rows.length,
  });

  return Promise.all(
    result.rows.map(async (shift) => {
      try {
        const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
          shift.id,
        ]);
        return normalizeDbShift(shift, breaksResult.rows);
      } catch (breaksError) {
        console.error(`[getAllShifts] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
        return normalizeDbShift(shift, []);
      }
    })
  );
}

export async function getOpenShiftForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.shifts.find((shift) => shift.userId === userId && !shift.clockOutAt) || null;
  }

  const result = await query(
    `SELECT s.* FROM shifts s WHERE s.user_id = $1 AND s.clock_out_at IS NULL LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const shift = result.rows[0];
  try {
    const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
      shift.id,
    ]);
    return normalizeDbShift(shift, breaksResult.rows);
  } catch (breaksError) {
    console.error(`[getOpenShiftForUser] Failed to load breaks for shift ${shift.id}:`, breaksError.message);
    // Fallback: return shift without breaks rather than failing
    return normalizeDbShift(shift, []);
  }
}

export async function getTimeLogsForUser(userId) {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return db.timeLogs.filter((log) => log.userId === userId);
  }

  const result = await query(
    `SELECT * FROM time_logs WHERE user_id = $1 ORDER BY timestamp DESC`,
    [userId]
  );

  console.info("[timeLogModel.getTimeLogsForUser] fetched logs", {
    userId,
    rowCount: result.rows.length,
  });

  return result.rows.map(normalizeDbTimeLog);
}

export async function getAllTimeLogs() {
  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    return (db.timeLogs || []).slice();
  }

  const result = await query(`SELECT * FROM time_logs ORDER BY timestamp DESC`);

  console.info("[timeLogModel.getAllTimeLogs] fetched logs", {
    rowCount: result.rows.length,
  });

  return result.rows.map(normalizeDbTimeLog);
}

export async function saveClockIn(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = {
      id: crypto.randomUUID(),
      userId,
      clockInAt: timestamp,
      clockOutAt: null,
      actualHours: null,
      payableHours: null,
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

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftId = crypto.randomUUID();
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(
        `INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [shiftId, userId, timestamp, null, timestamp, timestamp]
      );

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "clock_in",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveClockIn] wrote shift and log", {
        userId,
        shiftId,
        logId,
      });

      return {
        id: shiftId,
        userId,
        clockInAt: timestamp,
        clockOutAt: null,
        breaks: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveStartBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
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

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;
    const breakId = crypto.randomUUID();
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(
        `INSERT INTO breaks (id, shift_id, start_at, end_at, created_at)
        VALUES ($1, $2, $3, $4, $5)`,
        [breakId, shiftId, timestamp, null, timestamp]
      );

      await client.query(`UPDATE shifts SET updated_at = $1 WHERE id = $2`, [timestamp, shiftId]);

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "break_start",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveStartBreak] wrote break and log", {
        userId,
        shiftId,
        breakId,
        logId,
      });

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      return normalizeDbShift(shiftData.rows[0], breaksData.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveEndBreak(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
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

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;

    const breakResult = await client.query(
      `SELECT id FROM breaks WHERE shift_id = $1 AND end_at IS NULL ORDER BY start_at DESC LIMIT 1`,
      [shiftId]
    );

    if (breakResult.rows.length === 0) return null;

    const breakId = breakResult.rows[0].id;
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(`UPDATE breaks SET end_at = $1 WHERE id = $2`, [timestamp, breakId]);

      await client.query(`UPDATE shifts SET updated_at = $1 WHERE id = $2`, [timestamp, shiftId]);

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "break_end",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveEndBreak] closed break and wrote log", {
        userId,
        shiftId,
        breakId,
        logId,
      });

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      return normalizeDbShift(shiftData.rows[0], breaksData.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveClockOut(userId, notes = null, location = null, geofence = null) {
  const timestamp = nowIso();

  if (!isDatabaseReady()) {
    const db = await readDatabaseFromJson();
    const shift = db.shifts.find((item) => item.userId === userId && !item.clockOutAt);
    if (!shift) return null;

    shift.clockOutAt = timestamp;
    shift.updatedAt = timestamp;
    const summary = buildShiftHourSummary(shift);
    shift.actualHours = summary.actualHours;
    shift.payableHours = summary.payableHours;

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

    await writeDatabaseToJson(db);
    return shift;
  }

  return withClient(async (client) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) return null;

    const shiftId = shiftResult.rows[0].id;
    const logId = crypto.randomUUID();

    await client.query("BEGIN");

    try {
      await client.query(
        `UPDATE shifts SET clock_out_at = $1, updated_at = $2 WHERE id = $3`,
        [timestamp, timestamp, shiftId]
      );

      await client.query(
        `INSERT INTO time_logs (id, user_id, shift_id, action_type, timestamp, location, geofence, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          userId,
          shiftId,
          "clock_out",
          timestamp,
          location ? JSON.stringify(normalizeLocation(location)) : null,
          geofence ? JSON.stringify(normalizeGeofence(geofence)) : null,
          notes,
          timestamp,
        ]
      );

      const shiftData = await client.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
      const breaksData = await client.query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shiftId,
      ]);
      const normalizedShift = normalizeDbShift(shiftData.rows[0], breaksData.rows);
      const summary = buildShiftHourSummary(normalizedShift);

      await client.query(
        `UPDATE shifts SET actual_hours = $1, payable_hours = $2, updated_at = $3 WHERE id = $4`,
        [summary.actualHours, summary.payableHours, timestamp, shiftId]
      );

      await client.query("COMMIT");

      console.info("[timeLogModel.saveClockOut] closed shift and wrote log", {
        userId,
        shiftId,
        logId,
      });

      return {
        ...normalizedShift,
        actualHours: summary.actualHours,
        payableHours: summary.payableHours,
        updatedAt: timestamp,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
