import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
  return logs.find((s) => !s.clockOutAt) || null;
}

function getShiftDurationMinutes(shift) {
  if (!shift.clockOutAt) return 0;

  const start = Date.parse(shift.clockInAt);
  const end = Date.parse(shift.clockOutAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  return Math.max(0, Math.round((end - start) / 60000));
}

function buildWorkerSummary(workerId) {
  const logs = getWorkerLogs(workerId);
  const closedShifts = logs.filter((shift) => shift.clockOutAt);
  const totalMinutes = closedShifts.reduce(
    (sum, shift) => sum + getShiftDurationMinutes(shift),
    0
  );

  return {
    workerId,
    totalShifts: logs.length,
    closedShifts: closedShifts.length,
    openShift: findOpenShift(workerId),
    totalMinutes,
    totalHours: Number((totalMinutes / 60).toFixed(2)),
  };
}

// GET /
app.get("/", (req, res) => {
  res.type("text").send("TimeClock API running");
});

// POST /clock-in
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
      openShift: existingOpen,
    });
  }

  const record = {
    id: `${wid}-${Date.now()}`,
    workerId: wid,
    hotelName: hname,
    clockInAt: nowIso(),
    clockOutAt: null,
    status: "open",
  };

  getWorkerLogs(wid).push(record);
  res.status(201).json(record);
});

// POST /clock-out
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

// GET /logs/:workerId
app.get("/logs/:workerId", (req, res) => {
  const wid = (req.params.workerId || "").trim();
  if (!wid) return res.status(400).json({ error: "workerId param is required" });

  const logs = getWorkerLogs(wid);
  res.json(logs);
});

// GET /summary/:workerId
app.get("/summary/:workerId", (req, res) => {
  const wid = (req.params.workerId || "").trim();
  if (!wid) return res.status(400).json({ error: "workerId param is required" });

  res.json(buildWorkerSummary(wid));
});

app.listen(PORT, () => {
  console.log(`TimeClock API listening on http://localhost:${PORT}`);
});
