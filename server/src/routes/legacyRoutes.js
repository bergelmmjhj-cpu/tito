import { Router } from "express";
import { findUserByIdentifier } from "../models/userModel.js";
import { getAttendanceHistory, getCurrentStatus, performAction } from "../services/timeService.js";
import { toHttpError } from "../utils/errors.js";

function toLegacyShift(historyItem, workerId) {
  return {
    id: historyItem.shiftId,
    workerId,
    hotelName: "N/A",
    clockInAt: historyItem.timeIn,
    clockOutAt: historyItem.timeOut,
    status: historyItem.timeOut ? "closed" : "open",
  };
}

function toLegacySummary(userId, status, history) {
  const closed = history.filter((item) => item.timeOut);
  const totalMinutes = closed.reduce((sum, item) => sum + (item.totalMinutes || 0), 0);

  return {
    workerId: userId,
    totalShifts: history.length,
    closedShifts: closed.length,
    openShift: status.openShift,
    totalMinutes,
    totalHours: Number((totalMinutes / 60).toFixed(2)),
  };
}

export function createLegacyRoutes() {
  const router = Router();

  router.post("/clock-in", (req, res) => {
    try {
      const { workerId } = req.body || {};
      if (typeof workerId !== "string" || !workerId.trim()) {
        return res.status(400).json({ error: "workerId is required and must be a string" });
      }

      const user = findUserByIdentifier(workerId.trim());
      if (!user) return res.status(404).json({ error: "Unknown workerId" });

      performAction(user.id, "clock_in");
      const status = getCurrentStatus(user.id);
      res.status(201).json(status.openShift);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  router.post("/clock-out", (req, res) => {
    try {
      const { workerId } = req.body || {};
      if (typeof workerId !== "string" || !workerId.trim()) {
        return res.status(400).json({ error: "workerId is required and must be a string" });
      }

      const user = findUserByIdentifier(workerId.trim());
      if (!user) return res.status(404).json({ error: "Unknown workerId" });

      performAction(user.id, "clock_out");
      const status = getCurrentStatus(user.id);
      res.json(status.openShift);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  router.get("/logs/:workerId", (req, res) => {
    const workerId = (req.params.workerId || "").trim();
    if (!workerId) return res.status(400).json({ error: "workerId param is required" });

    const user = findUserByIdentifier(workerId);
    if (!user) return res.status(404).json({ error: "Unknown workerId" });

    const history = getAttendanceHistory(user.id);
    res.json(history.map((item) => toLegacyShift(item, workerId)));
  });

  router.get("/summary/:workerId", (req, res) => {
    const workerId = (req.params.workerId || "").trim();
    if (!workerId) return res.status(400).json({ error: "workerId param is required" });

    const user = findUserByIdentifier(workerId);
    if (!user) return res.status(404).json({ error: "Unknown workerId" });

    const status = getCurrentStatus(user.id);
    const history = getAttendanceHistory(user.id);
    res.json(toLegacySummary(workerId, status, history));
  });

  return router;
}
