import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  checkDatabaseConnected,
  getInitializationDiagnostics,
  getStorageMode,
  initializeDatabase,
} from "./src/db/initialization.js";
import { initializeCrmPool, isCrmPoolReady } from "./src/db/crmPool.js";
import { ensureBootstrapAdminExists } from "./src/services/adminBootstrapService.js";
import { initializeGoogleAuth } from "./src/services/googleAuthService.js";
import { createAuthRouter } from "./src/routes/authRoutes.js";
import { createTimeRoutes } from "./src/routes/timeRoutes.js";
import { createLegacyRoutes } from "./src/routes/legacyRoutes.js";
import { createWorkplaceRoutes } from "./src/routes/workplaceRoutes.js";
import { createAdminRoutes } from "./src/routes/adminRoutes.js";
import { createCrmRoutes } from "./src/routes/crmRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host") || "";
  return host ? `${protocol}://${host}` : "";
}

function parseAllowedOrigins() {
  return String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildCorsOptions(environment) {
  const configuredOrigins = parseAllowedOrigins();

  return (req, callback) => {
    const requestOrigin = req.headers.origin;

    if (!requestOrigin) {
      callback(null, { origin: false });
      return;
    }

    if (environment !== "production" && configuredOrigins.length === 0) {
      callback(null, { origin: true });
      return;
    }

    const sameOrigin = requestOrigin === getRequestOrigin(req);
    const allowed = sameOrigin || configuredOrigins.includes(requestOrigin);
    callback(null, { origin: allowed });
  };
}

async function startServer() {
  try {
    const environment = process.env.NODE_ENV || "development";
    console.log(
      `[startup] environment=${environment} storage_mode=${process.env.DATABASE_URL ? "postgres" : "json"}`
    );

    await initializeDatabase();
    const initDiagnostics = getInitializationDiagnostics();
    console.log(
      `[startup] database_initialized=${initDiagnostics.initialized} schema_initialized=${initDiagnostics.schemaInitialized}`
    );

    try {
      initializeCrmPool();
      console.log(`[startup] crm_database_initialized=${isCrmPoolReady()}`);
    } catch (error) {
      console.warn(`[startup] crm_database_initialization_failed: ${error.message}`);
    }

    try {
      initializeGoogleAuth();
      console.log(`[startup] google_oauth=enabled`);
    } catch (error) {
      console.warn(`[startup] google_oauth=disabled reason=${error.message}`);
    }

    try {
      const result = await ensureBootstrapAdminExists("startup_bootstrap");
      if (result.created) {
        console.log(`[startup] bootstrap_admin=created email=${result.admin.email}`);
        if (
          (result.reason === "created_dev_fallback" || result.reason === "created_emergency_fallback") &&
          result.fallbackCredentials
        ) {
          console.warn(
            `[startup] bootstrap_admin_${result.reason} identifier=${result.fallbackCredentials.identifier} password=${result.fallbackCredentials.password}`
          );
        }
      } else if (result.reason === "password_synced") {
        console.log(`[startup] bootstrap_admin=password_synced email=${result.admin.email}`);
      } else if (result.reason === "identifier_synced") {
        console.log(`[startup] bootstrap_admin=identifier_synced email=${result.admin.email}`);
      } else if (result.reason === "promoted_existing_user") {
        console.log(`[startup] bootstrap_admin=promoted_existing_user email=${result.admin.email}`);
      } else if (result.reason === "placeholder_replaced") {
        console.log(`[startup] bootstrap_admin=placeholder_replaced new_email=${result.admin.email}`);
      } else {
        console.log(`[startup] bootstrap_admin=skipped reason=${result.reason}`);
      }
    } catch (error) {
      console.error(`Bootstrap admin setup failed: ${error.message}`);
    }

    // Trust proxy headers from Railway
    app.set('trust proxy', 1);

  app.use(cors(buildCorsOptions(environment)));
    app.use(express.json());
    app.use(express.static(join(__dirname, "../client")));

    app.get("/health", async (req, res) => {
      const dbConnected = await checkDatabaseConnected();
      res.json({
        status: "ok",
        environment,
        storageMode: getStorageMode(),
        databaseConnected: dbConnected,
        crmDatabaseConnected: isCrmPoolReady(),
        timestamp: new Date().toISOString(),
      });
    });

    app.use("/api/auth", createAuthRouter());
    app.use("/api/time", createTimeRoutes());
    app.use("/api/workplaces", createWorkplaceRoutes());
    app.use("/api/crm", createCrmRoutes());
    app.use("/api/admin", createAdminRoutes());
    app.use("/", createLegacyRoutes());

    app.listen(PORT, () => {
      console.log(`TimeClock API + frontend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
