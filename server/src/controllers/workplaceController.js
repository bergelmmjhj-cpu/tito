import {
  addWorkplace,
  editWorkplace,
  getWorkplaceById,
  getWorkplaces,
  setWorkplaceActive,
} from "../services/workplaceService.js";
import { toHttpError } from "../utils/errors.js";

export function listWorkplacesController(req, res) {
  try {
    const includeInactive = req.query.includeInactive !== "false";
    const workplaces = getWorkplaces(includeInactive);
    res.json({ workplaces });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function getWorkplaceController(req, res) {
  try {
    const workplace = getWorkplaceById(req.params.workplaceId);
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function createWorkplaceController(req, res) {
  try {
    const workplace = addWorkplace(req.body || {}, req.user);
    res.status(201).json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function updateWorkplaceController(req, res) {
  try {
    const workplace = editWorkplace(req.params.workplaceId, req.body || {});
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function setWorkplaceStatusController(req, res) {
  try {
    const workplace = setWorkplaceActive(req.params.workplaceId, req.body?.active);
    res.json({ workplace });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
