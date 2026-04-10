import {
  assignWorkerToWorkplace,
  listAssignableWorkplaces,
  listWorkersWithAssignments,
} from "../services/adminWorkerService.js";
import { toHttpError } from "../utils/errors.js";

export function listWorkersController(req, res) {
  try {
    const workers = listWorkersWithAssignments();
    res.json({ workers });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function assignWorkerWorkplaceController(req, res) {
  try {
    const worker = assignWorkerToWorkplace(req.params.workerUserId, req.body?.workplaceId ?? null);
    res.json({ worker });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function listAssignableWorkplacesController(req, res) {
  try {
    const workplaces = listAssignableWorkplaces();
    res.json({ workplaces });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
