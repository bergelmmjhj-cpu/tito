import pg from "pg";

let crmPool = null;

export function initializeCrmPool() {
  const crmDatabaseUrl = process.env.CRM_DATABASE_URL;

  if (!crmDatabaseUrl) {
    console.warn(
      "[crm] CRM_DATABASE_URL is not set. CRM database pool not initialized. " +
        "CRM endpoints will return 503 until CRM_DATABASE_URL is configured."
    );
    return null;
  }

  crmPool = new pg.Pool({
    connectionString: crmDatabaseUrl,
    ssl: crmDatabaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  crmPool.on("error", (err) => {
    console.error("[crm] PostgreSQL CRM pool error:", err);
  });

  console.log("[crm] CRM database pool initialized");
  return crmPool;
}

export function getCrmPool() {
  if (!crmPool) {
    return null;
  }
  return crmPool;
}

export async function crmQuery(text, params = []) {
  const pool = getCrmPool();
  if (!pool) {
    throw new Error("CRM database is not available. CRM_DATABASE_URL is not configured.");
  }
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function withCrmClient(callback) {
  const pool = getCrmPool();
  if (!pool) {
    throw new Error("CRM database is not available. CRM_DATABASE_URL is not configured.");
  }
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closeCrmPool() {
  if (crmPool) {
    await crmPool.end();
    crmPool = null;
  }
}

export function isCrmPoolReady() {
  return crmPool !== null;
}
