import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeDatabase } from "./src/db/initialization.js";
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
    await initializeDatabase();

    try {
      const result = await ensureBootstrapAdminExists("startup_bootstrap");
      if (result.created) {
        console.log(`Bootstrap admin created: ${result.admin.email}`);
      }
    } catch (error) {
      console.error(`Bootstrap admin setup failed: ${error.message}`);
    }

    app.use(cors());
    app.use(express.json());
    app.use(express.static(join(__dirname, "../client")));

    app.get("/health", (req, res) => {
      res.type("text").send("TimeClock API running");
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
