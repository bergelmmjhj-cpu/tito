import express from "express";
import cors from "cors";
import { initializeDatabase } from "./src/db/database.js";
import { createAuthRouter } from "./src/routes/authRoutes.js";
import { createTimeRoutes } from "./src/routes/timeRoutes.js";
import { createLegacyRoutes } from "./src/routes/legacyRoutes.js";

const app = express();
const PORT = process.env.PORT || 3000;

initializeDatabase();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.type("text").send("TimeClock API running");
});

app.use("/api/auth", createAuthRouter());
app.use("/api/time", createTimeRoutes());
app.use("/", createLegacyRoutes());

app.listen(PORT, () => {
  console.log(`TimeClock API listening on http://localhost:${PORT}`);
});
