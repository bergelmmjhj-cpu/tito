import {
  getAttendanceActionHistory,
  getCurrentStatus,
  performAction,
} from "../services/timeService.js";
import { toHttpError } from "../utils/errors.js";

export function statusController(req, res) {
  try {
    const data = getCurrentStatus(req.user.id);
    res.json({ user: req.user, ...data });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function actionController(req, res) {
  try {
    const { actionType, notes, location } = req.body || {};
    const result = performAction(req.user.id, actionType, notes, location);
    res.json({
      user: req.user,
      ...result,
    });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function historyController(req, res) {
  try {
    const history = getAttendanceActionHistory(req.user.id);
    res.json({ user: req.user, history });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
