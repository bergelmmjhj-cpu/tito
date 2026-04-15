import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "../client");

app.use(cors());
app.use(express.json());
app.use(express.static(clientDir));

// In-memory store (v1)
const shiftsByWorker = new Map(); // workerId -> array of shift records

function nowIso() {
  return new Date().toISOString();
}

function getWorkerLogs(workerId) {
  if (!shiftsByWorker.has(workerId)) shiftsByWorker.set(workerId, []);
  return shiftsByWorker.get(workerId);
}

function findOpenShift(workerId) {
  const logs = getWorkerLogs(workerId);
  // open = no clockOutAt
  return logs.find((s) => !s.clockOutAt) || null;
}

app.get("/api/health", (req, res) => {
  res.type("text").send("TimeClock API running");
});

app.get("/", (req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.post("/clock-in", (req, res) => {
  const { workerId, hotelName } = req.body || {};

  if (typeof workerId !== "string" || !workerId.trim()) {
    return res.status(400).json({ error: "workerId is required and must be a string" });
  }
  if (typeof hotelName !== "string" || !hotelName.trim()) {
    return res.status(400).json({ error: "hotelName is required and must be a string" });
  }

  const wid = workerId.trim();
  const hname = hotelName.trim();

  const existingOpen = findOpenShift(wid);
  if (existingOpen) {
    return res.status(409).json({
      error: "Worker already has an open shift",
      openShift: existingOpen
    });
  }

  const record = {
    id: `${wid}-${Date.now()}`,
    workerId: wid,
    hotelName: hname,
    clockInAt: nowIso(),
    clockOutAt: null,
    status: "open"
  };

  const logs = getWorkerLogs(wid);
  logs.push(record);

  res.status(201).json(record);
});

app.post("/clock-out", (req, res) => {
  const { workerId } = req.body || {};

  if (typeof workerId !== "string" || !workerId.trim()) {
    return res.status(400).json({ error: "workerId is required and must be a string" });
  }

  const wid = workerId.trim();
  const openShift = findOpenShift(wid);

  if (!openShift) {
    return res.status(404).json({ error: "No open shift found for workerId" });
  }

  openShift.clockOutAt = nowIso();
  openShift.status = "closed";

  res.json(openShift);
});

app.get("/logs/:workerId", (req, res) => {
  const wid = (req.params.workerId || "").trim();
  if (!wid) return res.status(400).json({ error: "workerId param is required" });

  const logs = getWorkerLogs(wid);
  res.json(logs);
});

app.listen(PORT, () => {
  console.log(`TimeClock API listening on http://localhost:${PORT}`);
});
