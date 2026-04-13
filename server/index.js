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

    app.use(cors());
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
