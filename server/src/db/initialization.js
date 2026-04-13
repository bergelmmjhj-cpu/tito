import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializePool } from "./pool.js";
import { initializeSchema, getSchemaVersion, setSchemaVersion } from "./schema.js";
import { query, withClient } from "./pool.js";
import crypto from "node:crypto";

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

    // Create schema if not exists
    await initializeSchema();
    schemaInitialized = true;

    // Check if we need to migrate data from JSON
    const schemaVersion = await getSchemaVersion();
    if (schemaVersion === 0) {
      // First time setup, try to migrate from JSON if available
      await migrateFromJsonIfExists();
      await setSchemaVersion(1);
    }

    // Apply incremental schema migrations for existing databases
    await applySchemaAlterations();

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
  // Add google_id and google_email columns if they don't exist (for existing databases)
  const alterations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255)`,
    `CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`,
    // Allow password_salt and password_hash to be nullable for OAuth-only users
    `ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL`,
    `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
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
                latitude, longitude, geofence_radius_meters, active, crm,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
            await client.query(
              `INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (id) DO NOTHING`,
              [
                shift.id,
                shift.userId,
                shift.clockInAt,
                shift.clockOutAt || null,
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
    schemaVersion: 1,
    users: [],
    workplaces: [],
    shifts: [],
    timeLogs: [],
  };
}
