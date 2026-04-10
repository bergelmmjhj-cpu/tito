import { listUsers, findUserById, updateUserById } from "../models/userModel.js";
import { findWorkplaceById, listWorkplaces } from "../models/workplaceModel.js";
import { HttpError } from "../utils/errors.js";

function sanitizeWorker(worker) {
  return {
    id: worker.id,
    firstName: worker.firstName,
    lastName: worker.lastName,
    name: worker.name,
    email: worker.email,
    phone: worker.phone || null,
    staffId: worker.staffId,
    role: worker.role,
    isActive: worker.isActive !== false,
    assignedWorkplaceId: worker.profile?.assignedWorkplaceId || null,
  };
}

function toWorkerWithWorkplace(worker) {
  const workplaceId = worker.profile?.assignedWorkplaceId || null;
  const workplace = workplaceId ? findWorkplaceById(workplaceId) : null;

  return {
    ...sanitizeWorker(worker),
    assignedWorkplace: workplace
      ? {
          id: workplace.id,
          name: workplace.name,
          city: workplace.city,
          state: workplace.state,
          active: workplace.active !== false,
          geofenceRadiusMeters: workplace.geofenceRadiusMeters,
        }
      : null,
  };
}

export function listWorkersWithAssignments() {
  return listUsers()
    .filter((user) => user.role !== "admin")
    .map(toWorkerWithWorkplace)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export function assignWorkerToWorkplace(workerUserId, workplaceId) {
  const worker = findUserById(workerUserId);
  if (!worker || worker.role === "admin") {
    throw new HttpError(404, "Worker not found");
  }

  let assignedWorkplaceId = null;
  if (workplaceId !== null && workplaceId !== undefined && workplaceId !== "") {
    if (typeof workplaceId !== "string") {
      throw new HttpError(400, "workplaceId must be a string or null");
    }

    const workplace = findWorkplaceById(workplaceId.trim());
    if (!workplace) throw new HttpError(404, "Workplace not found");
    if (workplace.active === false) {
      throw new HttpError(400, "Cannot assign inactive workplace");
    }

    assignedWorkplaceId = workplace.id;
  }

  const updated = updateUserById(worker.id, {
    profile: {
      ...(worker.profile && typeof worker.profile === "object" ? worker.profile : {}),
      assignedWorkplaceId,
    },
    updatedAt: new Date().toISOString(),
  });

  if (!updated) throw new HttpError(404, "Worker not found");
  return toWorkerWithWorkplace(updated);
}

export function listAssignableWorkplaces() {
  return listWorkplaces()
    .filter((item) => item.active !== false)
    .map((item) => ({
      id: item.id,
      name: item.name,
      city: item.city,
      state: item.state,
      geofenceRadiusMeters: item.geofenceRadiusMeters,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
