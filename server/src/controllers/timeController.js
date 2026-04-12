import {
  getAttendanceActionHistory,
  getCurrentStatus,
  performAction,
} from "../services/timeService.js";
import { toHttpError } from "../utils/errors.js";

export async function statusController(req, res) {
  try {
    const data = await getCurrentStatus(req.user.id);
    res.json({ user: req.user, ...data });
  } catch (error) {
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
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function historyController(req, res) {
  try {
    const history = await getAttendanceActionHistory(req.user.id);
    res.json({ user: req.user, history });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
