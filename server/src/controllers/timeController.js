import {
  getAttendanceActionHistory,
  getAttendanceHistory,
  getCurrentStatus,
  performAction,
} from "../services/timeService.js";
import { toHttpError } from "../utils/errors.js";

export async function statusController(req, res) {
  try {
    const data = await getCurrentStatus(req.user.id);
    res.json({ user: req.user, ...data });
  } catch (error) {
    console.error("[time.status] failed", {
      userId: req.user?.id || null,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function actionController(req, res) {
  try {
    const { actionType, notes, location } = req.body || {};
    const result = await performAction(req.user.id, actionType, notes, location);
    res.json({
      user: req.user,
      ...result,
    });
  } catch (error) {
    console.error("[time.action] failed", {
      userId: req.user?.id || null,
      actionType: req.body?.actionType || null,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function historyController(req, res) {
  try {
    const history = await getAttendanceActionHistory(req.user.id);
    res.json({ user: req.user, history });
  } catch (error) {
    console.error("[time.history] failed", {
      userId: req.user?.id || null,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function shiftHistoryController(req, res) {
  try {
    const shifts = await getAttendanceHistory(req.user.id);
    res.json({ user: req.user, shifts });
  } catch (error) {
    console.error("[time.shiftHistory] failed", {
      userId: req.user?.id || null,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
