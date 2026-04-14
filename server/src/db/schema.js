import { withClient } from "./pool.js";

const SCHEMA_VERSION = 1;

const CREATE_TABLES_SQL = `
  -- Schema version table
  CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    name VARCHAR(511) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30),
    staff_id VARCHAR(50) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    google_id VARCHAR(255) UNIQUE,
    google_email VARCHAR(255),
    password_salt TEXT,
    password_hash TEXT,
    profile JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_from VARCHAR(100) DEFAULT 'manual'
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
  CREATE INDEX IF NOT EXISTS idx_users_staff_id ON users(LOWER(staff_id));
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

  -- Workplaces table
  CREATE TABLE IF NOT EXISTS workplaces (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    contact_name VARCHAR(255),
    contact_phone VARCHAR(30),
    contact_email VARCHAR(255),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    geofence_radius_meters INTEGER DEFAULT 150,
    time_zone VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    crm JSONB DEFAULT '{"source":"local","externalId":null,"syncStatus":"not_synced","ownerType":"local_admin"}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_workplaces_active ON workplaces(active);

  -- Worker workplace assignments
  CREATE TABLE IF NOT EXISTS user_workplace_assignments (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_workplace_id ON user_workplace_assignments(workplace_id);

  -- Shifts table
  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clock_in_at TIMESTAMP NOT NULL,
    clock_out_at TIMESTAMP,
    business_date VARCHAR(10),
    business_time_zone VARCHAR(100),
    actual_hours NUMERIC(10, 2),
    payable_hours NUMERIC(10, 2),
    review_status VARCHAR(50),
    review_note TEXT,
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    payroll_status VARCHAR(50) DEFAULT 'pending',
    payroll_approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    payroll_approved_at TIMESTAMP,
    payroll_exported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    payroll_exported_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
  CREATE INDEX IF NOT EXISTS idx_shifts_clock_in_at ON shifts(clock_in_at);
  CREATE INDEX IF NOT EXISTS idx_shifts_payroll_status ON shifts(payroll_status);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_one_open_per_user ON shifts(user_id) WHERE clock_out_at IS NULL;

  -- Breaks table
  CREATE TABLE IF NOT EXISTS breaks (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_breaks_shift_id ON breaks(shift_id);

  -- Time logs / attendance records
  CREATE TABLE IF NOT EXISTS time_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('clock_in', 'break_start', 'break_end', 'clock_out', 'admin_review', 'admin_close_shift', 'admin_end_break', 'admin_payable_adjustment', 'admin_payroll_approved', 'admin_payroll_exported', 'admin_payroll_reopened')),
    timestamp TIMESTAMP NOT NULL,
    location JSONB,
    geofence JSONB,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_time_logs_shift_id ON time_logs(shift_id);
  CREATE INDEX IF NOT EXISTS idx_time_logs_timestamp ON time_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_time_logs_action_type ON time_logs(action_type);

  -- Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`;

export async function initializeSchema() {
  try {
    // Split by semicolon and execute each statement
    const statements = CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await withClient(async (client) => {
        await client.query(statement);
      });
    }

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database schema:", error.message);
    throw error;
  }
}

export async function getSchemaVersion() {
  try {
    const result = await withClient(async (client) => {
      const res = await client.query(
        "SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1"
      );
      return res.rows[0]?.version || 0;
    });
    return result;
  } catch {
    return 0;
  }
}

export async function setSchemaVersion(version) {
  await withClient(async (client) => {
    await client.query("INSERT INTO _schema_version (version) VALUES ($1)", [version]);
  });
}
