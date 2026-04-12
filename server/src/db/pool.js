import pg from "pg";

let pool = null;

export function initializePool() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Please configure your PostgreSQL connection."
    );
  }

  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err);
    process.exit(1);
  });

  return pool;
}

export function getPool() {
  if (!pool) {
    throw new Error("Database pool not initialized. Call initializePool() first.");
  }
  return pool;
}

export async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function withClient(callback) {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
  }
}
