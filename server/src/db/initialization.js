import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShiftHourSummary } from "../services/payableHoursService.js";
import { initializePool } from "./pool.js";
import { initializeSchema, getSchemaVersion, setSchemaVersion } from "./schema.js";
import { query, withClient } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.resolve(DATA_DIR, "db.json");

let isInitialized = false;
let storageMode = "json";
let schemaInitialized = false;
let lastInitializationError = null;

export async function initializeDatabase() {
  if (isInitialized) return;

  console.log("Initializing database...");

  // Use DATABASE_URL if available, otherwise use JSON fallback
  const dbUrl = process.env.DATABASE_URL;
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  if (!dbUrl) {
    if (isProduction) {
      const error = "DATABASE_URL is required in production. JSON fallback is disabled.";
      lastInitializationError = error;
      throw new Error(error);
    }

    storageMode = "json";
    schemaInitialized = false;
    lastInitializationError = null;
    console.warn("DATABASE_URL not set. Using JSON file storage (development mode).");
    isInitialized = true;
    return;
  }

  try {
    storageMode = "postgres";
    // Initialize PostgreSQL connection pool
    initializePool();
    console.log("Connected to PostgreSQL");

    // Apply alterations FIRST to add missing columns to existing tables.
    // For new databases these are no-ops; for existing databases they add
    // any columns that were introduced after the initial schema was created.
    await applySchemaAlterations();

    // Create schema if not exists (safe for both new and existing databases)
    await initializeSchema();
    schemaInitialized = true;

    // Check if we need to migrate data from JSON
    const schemaVersion = await getSchemaVersion();
    if (schemaVersion === 0) {
      // First time setup, try to migrate from JSON if available
      await migrateFromJsonIfExists();
      await setSchemaVersion(1);
    }

    isInitialized = true;
    lastInitializationError = null;
    console.log("Database initialization complete");
  } catch (error) {
    lastInitializationError = error?.message || "unknown_error";
    schemaInitialized = false;
    console.error("Database initialization failed:", error.message);
    throw error;
  }
}

async function applySchemaAlterations() {
  // Add google_id and google_email columns if they don't exist (for existing databases
  // that were created before these columns were added to the CREATE TABLE statement).
  // Each alteration is wrapped in its own try/catch so a single failure never blocks startup.
  //
  // NOTE: password_salt and password_hash are already defined as nullable in the
  // CREATE TABLE statement in schema.js, so no DROP NOT NULL migration is needed.
  // For pre-existing databases that had NOT NULL on those columns, the ALTER TABLE
  // below will handle it safely via the per-statement catch block.
  const alterations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255)`,
    `CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`,
    `ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL`,
    `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
    `ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS time_zone VARCHAR(100)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS business_date VARCHAR(10)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS business_time_zone VARCHAR(100)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payable_hours NUMERIC(10, 2)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS review_status VARCHAR(50)`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS review_note TEXT`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_status VARCHAR(50) DEFAULT 'pending'`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_approved_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_approved_at TIMESTAMP`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_exported_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_exported_at TIMESTAMP`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS payroll_export_batch_id TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_shifts_payroll_status ON shifts(payroll_status)`,
    `CREATE INDEX IF NOT EXISTS idx_shifts_payroll_export_batch_id ON shifts(payroll_export_batch_id)`,
    `CREATE TABLE IF NOT EXISTS payroll_periods (
      id TEXT PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      locked_at TIMESTAMP,
      reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reopened_at TIMESTAMP
    )`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS label VARCHAR(120)`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS start_date DATE`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS end_date DATE`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'open'`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS locked_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_periods_start_date ON payroll_periods(start_date)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_periods_end_date ON payroll_periods(end_date)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(status)`,
    `CREATE TABLE IF NOT EXISTS payroll_export_batches (
      id TEXT PRIMARY KEY,
      status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reopened', 'replaced')),
      pay_period_id TEXT REFERENCES payroll_periods(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reopened_at TIMESTAMP,
      reopened_note TEXT,
      supersedes_batch_id TEXT REFERENCES payroll_export_batches(id) ON DELETE SET NULL,
      replaced_by_batch_id TEXT REFERENCES payroll_export_batches(id) ON DELETE SET NULL,
      shift_count INTEGER NOT NULL,
      total_payable_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
      filters JSONB NOT NULL DEFAULT '{}',
      shift_ids JSONB NOT NULL DEFAULT '[]',
      rows_snapshot JSONB NOT NULL DEFAULT '[]',
      csv_content TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS pay_period_id TEXT REFERENCES payroll_periods(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS reopened_note TEXT`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS supersedes_batch_id TEXT REFERENCES payroll_export_batches(id) ON DELETE SET NULL`,
    `ALTER TABLE payroll_export_batches ADD COLUMN IF NOT EXISTS replaced_by_batch_id TEXT REFERENCES payroll_export_batches(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_created_at ON payroll_export_batches(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_created_by ON payroll_export_batches(created_by)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_pay_period_id ON payroll_export_batches(pay_period_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_status ON payroll_export_batches(status)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_supersedes ON payroll_export_batches(supersedes_batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_export_batches_replaced_by ON payroll_export_batches(replaced_by_batch_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_one_open_per_user ON shifts(user_id) WHERE clock_out_at IS NULL`,
    `ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_action_type_check`,
    `ALTER TABLE time_logs ADD CONSTRAINT time_logs_action_type_check CHECK (action_type IN ('clock_in', 'break_start', 'break_end', 'clock_out', 'admin_review', 'admin_close_shift', 'admin_end_break', 'admin_payable_adjustment', 'admin_payroll_approved', 'admin_payroll_exported', 'admin_payroll_reopened'))`,
  ];

  for (const sql of alterations) {
    try {
      await withClient(async (client) => {
        await client.query(sql);
      });
    } catch (error) {
      // Log but don't fail — some alterations may not apply in all environments
      console.warn(`[schema-migration] Alteration skipped: ${error.message}`);
    }
  }
}

async function migrateFromJsonIfExists() {
  if (!fs.existsSync(DB_FILE)) {
    console.log("No JSON data file found, starting with empty database");
    return;
  }

  console.log("Migrating data from JSON to PostgreSQL...");

  const raw = fs.readFileSync(DB_FILE, "utf8");
  const data = raw.trim() ? JSON.parse(raw) : null;

  if (!data) {
    console.log("JSON data file was empty");
    return;
  }

  try {
    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        // Migrate users
        if (Array.isArray(data.users) && data.users.length > 0) {
          for (const user of data.users) {
            await client.query(
              `INSERT INTO users (
                id, first_name, last_name, name, email, phone, staff_id, role, 
                is_active, password_salt, password_hash, profile, created_at, updated_at, created_from
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              ON CONFLICT (id) DO NOTHING`,
              [
                user.id,
                user.firstName || "",
                user.lastName || "",
                user.name || "",
                user.email,
                user.phone || null,
                user.staffId,
                user.role || "worker",
                user.isActive !== false,
                user.passwordSalt,
                user.passwordHash,
                JSON.stringify(user.profile || {}),
                user.createdAt || new Date().toISOString(),
                user.updatedAt || new Date().toISOString(),
                user.profile?.createdFrom || "migrated",
              ]
            );
          }
          console.log(`Migrated ${data.users.length} users`);
        }

        // Migrate workplaces
        if (Array.isArray(data.workplaces) && data.workplaces.length > 0) {
          for (const wp of data.workplaces) {
            await client.query(
              `INSERT INTO workplaces (
                id, name, address, city, state, postal_code, country,
                contact_name, contact_phone, contact_email,
                latitude, longitude, geofence_radius_meters, time_zone, active, crm,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
              ON CONFLICT (id) DO NOTHING`,
              [
                wp.id,
                wp.name || "Unnamed",
                wp.address || null,
                wp.city || null,
                wp.state || null,
                wp.postalCode || null,
                wp.country || null,
                wp.contactName || null,
                wp.contactPhone || null,
                wp.contactEmail || null,
                wp.latitude || null,
                wp.longitude || null,
                wp.geofenceRadiusMeters || 150,
                wp.timeZone || null,
                wp.active !== false,
                JSON.stringify(wp.crm || {}),
                wp.createdAt || new Date().toISOString(),
                wp.updatedAt || new Date().toISOString(),
              ]
            );
          }
          console.log(`Migrated ${data.workplaces.length} workplaces`);
        }

        // Migrate shifts with breaks
        if (Array.isArray(data.shifts) && data.shifts.length > 0) {
          for (const shift of data.shifts) {
            const summary = buildShiftHourSummary(shift);
            await client.query(
              `INSERT INTO shifts (
                id, user_id, clock_in_at, clock_out_at, business_date, business_time_zone,
                actual_hours, payable_hours, review_status, review_note, reviewed_by, reviewed_at,
                payroll_status, payroll_approved_by, payroll_approved_at, payroll_exported_by, payroll_exported_at,
                payroll_export_batch_id, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
              ON CONFLICT (id) DO NOTHING`,
              [
                shift.id,
                shift.userId,
                shift.clockInAt,
                shift.clockOutAt || null,
                shift.businessDate || null,
                shift.businessTimeZone || null,
                shift.actualHours ?? summary.actualHours,
                shift.payableHours ?? summary.payableHours,
                shift.reviewStatus || null,
                shift.reviewNote || null,
                shift.reviewedBy || null,
                shift.reviewedAt || null,
                shift.payrollStatus || "pending",
                shift.payrollApprovedBy || null,
                shift.payrollApprovedAt || null,
                shift.payrollExportedBy || null,
                shift.payrollExportedAt || null,
                shift.payrollExportBatchId || null,
                shift.createdAt || new Date().toISOString(),
                shift.updatedAt || new Date().toISOString(),
              ]
            );

            // Migrate breaks for this shift
            if (Array.isArray(shift.breaks)) {
              for (const brk of shift.breaks) {
                const breakId = brk.id || crypto.randomUUID();
                await client.query(
                  `INSERT INTO breaks (id, shift_id, start_at, end_at, created_at)
                  VALUES ($1, $2, $3, $4, $5)
                  ON CONFLICT (id) DO NOTHING`,
                  [
                    breakId,
                    shift.id,
                    brk.startAt,
                    brk.endAt || null,
                    new Date().toISOString(),
                  ]
                );
              }
            }
          }
          console.log(`Migrated ${data.shifts.length} shifts`);
        }

        // Migrate time logs
        if (Array.isArray(data.timeLogs) && data.timeLogs.length > 0) {
          for (const log of data.timeLogs) {
            await client.query(
              `INSERT INTO time_logs (
                id, user_id, shift_id, action_type, timestamp, 
                location, geofence, notes, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id) DO NOTHING`,
              [
                log.id,
                log.userId,
                log.shiftId,
                log.actionType,
                log.timestamp,
                log.location ? JSON.stringify(log.location) : null,
                log.geofence ? JSON.stringify(log.geofence) : null,
                log.notes || null,
                log.createdAt || new Date().toISOString(),
              ]
            );
          }
          console.log(`Migrated ${data.timeLogs.length} time logs`);
        }

        if (Array.isArray(data.payrollExportBatches) && data.payrollExportBatches.length > 0) {
          if (Array.isArray(data.payrollPeriods) && data.payrollPeriods.length > 0) {
            for (const period of data.payrollPeriods) {
              await client.query(
                `INSERT INTO payroll_periods (
                  id, label, start_date, end_date, status, created_by, created_at, locked_by, locked_at, reopened_by, reopened_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING`,
                [
                  period.id,
                  period.label || `${period.startDate || ""} to ${period.endDate || ""}`.trim(),
                  period.startDate || null,
                  period.endDate || null,
                  period.status || "open",
                  period.createdBy || null,
                  period.createdAt || new Date().toISOString(),
                  period.lockedBy || null,
                  period.lockedAt || null,
                  period.reopenedBy || null,
                  period.reopenedAt || null,
                ]
              );
            }
            console.log(`Migrated ${data.payrollPeriods.length} payroll periods`);
          }

          for (const batch of data.payrollExportBatches) {
            await client.query(
              `INSERT INTO payroll_export_batches (
                id, status, pay_period_id, created_by, reopened_by, reopened_at, reopened_note,
                supersedes_batch_id, replaced_by_batch_id,
                shift_count, total_payable_hours, filters, shift_ids, rows_snapshot, csv_content, file_name, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17)
              ON CONFLICT (id) DO NOTHING`,
              [
                batch.id,
                batch.status || "active",
                batch.payPeriodId || null,
                batch.createdBy || null,
                batch.reopenedBy || null,
                batch.reopenedAt || null,
                batch.reopenedNote || null,
                batch.supersedesBatchId || null,
                batch.replacedByBatchId || null,
                typeof batch.shiftCount === "number" ? batch.shiftCount : Array.isArray(batch.shiftIds) ? batch.shiftIds.length : 0,
                typeof batch.totalPayableHours === "number" ? Number(batch.totalPayableHours.toFixed(2)) : 0,
                JSON.stringify(batch.filters && typeof batch.filters === "object" ? batch.filters : {}),
                JSON.stringify(Array.isArray(batch.shiftIds) ? batch.shiftIds : []),
                JSON.stringify(Array.isArray(batch.rows) ? batch.rows : []),
                typeof batch.csvContent === "string" ? batch.csvContent : "",
                batch.fileName || `payroll-export-${String(batch.createdAt || new Date().toISOString()).slice(0, 10)}-${String(batch.id || "batch").slice(0, 8)}.csv`,
                batch.createdAt || new Date().toISOString(),
              ]
            );
          }
          console.log(`Migrated ${data.payrollExportBatches.length} payroll export batches`);
        }

        // Migrate user assignments if present
        if (data.users) {
          for (const user of data.users) {
            if (user.profile?.assignedWorkplaceId) {
              await client.query(
                `INSERT INTO user_workplace_assignments (user_id, workplace_id, assigned_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE SET workplace_id = $2`,
                [user.id, user.profile.assignedWorkplaceId, new Date().toISOString()]
              );
            }
          }
        }

        await client.query("COMMIT");
        console.log("Data migration complete");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  } catch (error) {
    console.error("Data migration failed:", error.message);
    // Don't throw - allow app to continue with empty database
  }
}

export function isDatabaseReady() {
  return isInitialized && process.env.DATABASE_URL;
}

export function getStorageMode() {
  return storageMode;
}

export function getInitializationDiagnostics() {
  return {
    initialized: isInitialized,
    storageMode,
    schemaInitialized,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    lastInitializationError,
  };
}

export async function checkDatabaseConnected() {
  if (!isDatabaseReady()) return false;

  try {
    const result = await query("SELECT 1 AS ok");
    return Boolean(result?.rows?.[0]?.ok === 1 || result?.rows?.[0]?.ok === "1");
  } catch {
    return false;
  }
}

// Fallback functions for when DATABASE_URL is not set (backward compatibility)
export async function readDatabaseFromJson() {
  if (!fs.existsSync(DB_FILE)) {
    return createInitialDatabase();
  }

  const raw = fs.readFileSync(DB_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : null;
  return parsed || createInitialDatabase();
}

export async function writeDatabaseToJson(db) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, DB_FILE);
}

function createInitialDatabase() {
  return {
    schemaVersion: 9,
    users: [],
    workplaces: [],
    shifts: [],
    timeLogs: [],
    payrollPeriods: [],
    payrollExportBatches: [],
  };
}
