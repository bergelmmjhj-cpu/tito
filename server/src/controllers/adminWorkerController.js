import {
  assignWorkerToWorkplace,
  listAssignableWorkplaces,
  listWorkersWithAssignments,
} from "../services/adminWorkerService.js";
import { toHttpError } from "../utils/errors.js";

export async function listWorkersController(req, res) {
  try {
    const workers = await listWorkersWithAssignments();
    res.json({ workers });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function assignWorkerWorkplaceController(req, res) {
  try {
    const worker = await assignWorkerToWorkplace(req.params.workerUserId, req.body?.workplaceId ?? null);
    res.json({ worker });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function listAssignableWorkplacesController(req, res) {
  try {
    const workplaces = await listAssignableWorkplaces();
    res.json({ workplaces });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
