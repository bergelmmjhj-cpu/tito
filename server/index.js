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
import { ensureBootstrapAdminExists } from "./src/services/adminBootstrapService.js";
import { createAuthRouter } from "./src/routes/authRoutes.js";
import { createTimeRoutes } from "./src/routes/timeRoutes.js";
import { createLegacyRoutes } from "./src/routes/legacyRoutes.js";
import { createWorkplaceRoutes } from "./src/routes/workplaceRoutes.js";
import { createAdminRoutes } from "./src/routes/adminRoutes.js";

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
      const result = await ensureBootstrapAdminExists("startup_bootstrap");
      if (result.created) {
        console.log(`[startup] bootstrap_admin=created email=${result.admin.email}`);
      } else if (result.reason === "password_synced") {
        console.log(`[startup] bootstrap_admin=password_synced email=${result.admin.email}`);
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
        timestamp: new Date().toISOString(),
      });
    });

    app.use("/api/auth", createAuthRouter());
    app.use("/api/time", createTimeRoutes());
    app.use("/api/workplaces", createWorkplaceRoutes());
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
