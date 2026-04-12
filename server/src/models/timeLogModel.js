import crypto from "node:crypto";
import { query, withClient } from "../db/pool.js";
import { nowIso } from "../utils/time.js";
import { isDatabaseReady, readDatabaseFromJson, writeDatabaseToJson } from "../db/initialization.js";

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
  return {
    id: dbShift.id,
    userId: dbShift.user_id,
    clockInAt: dbShift.clock_in_at,
    clockOutAt: dbShift.clock_out_at,
    breaks: breaks.map((b) => ({
      id: b.id,
      startAt: b.start_at,
      endAt: b.end_at,
    })),
    createdAt: dbShift.created_at,
    updatedAt: dbShift.updated_at,
  };
}

function normalizeDbTimeLog(dbLog) {
  return {
    id: dbLog.id,
    userId: dbLog.user_id,
    shiftId: dbLog.shift_id,
    actionType: dbLog.action_type,
    timestamp: dbLog.timestamp,
    location: dbLog.location ? (typeof dbLog.location === "string" ? JSON.parse(dbLog.location) : dbLog.location) : null,
    geofence: dbLog.geofence ? (typeof dbLog.geofence === "string" ? JSON.parse(dbLog.geofence) : dbLog.geofence) : null,
    notes: dbLog.notes,
    createdAt: dbLog.created_at,
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

  return Promise.all(
    result.rows.map(async (shift) => {
      const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
        shift.id,
      ]);
      return normalizeDbShift(shift, breaksResult.rows);
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
  const breaksResult = await query(`SELECT * FROM breaks WHERE shift_id = $1 ORDER BY start_at`, [
    shift.id,
  ]);
  return normalizeDbShift(shift, breaksResult.rows);
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

      await client.query("COMMIT");

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
