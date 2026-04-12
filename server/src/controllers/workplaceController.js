import {
  addWorkplace,
  editWorkplace,
  getWorkplaceById,
  getWorkplaces,
  setWorkplaceActive,
} from "../services/workplaceService.js";
import { toHttpError } from "../utils/errors.js";

export async function listWorkplacesController(req, res) {
  try {
    const includeInactive = req.query.includeInactive !== "false";
    const workplaces = await getWorkplaces(includeInactive);
    res.json({ workplaces });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function getWorkplaceController(req, res) {
  try {
    const workplace = await getWorkplaceById(req.params.workplaceId);
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function createWorkplaceController(req, res) {
  try {
    const workplace = await addWorkplace(req.body || {}, req.user);
    res.status(201).json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function updateWorkplaceController(req, res) {
  try {
    const workplace = await editWorkplace(req.params.workplaceId, req.body || {});
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function setWorkplaceStatusController(req, res) {
  try {
    const workplace = await setWorkplaceActive(req.params.workplaceId, req.body?.active);
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
