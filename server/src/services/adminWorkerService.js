import { listUsers, findUserById, updateUserById } from "../models/userModel.js";
import { findWorkplaceById, listWorkplaces } from "../models/workplaceModel.js";
import { findWorkplaceByIdFromCrm, listWorkplacesFromCrm } from "../models/crmWorkplaceModel.js";
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

async function toWorkerWithWorkplace(worker) {
  const workplaceId = worker.profile?.assignedWorkplaceId || null;
  let workplace = null;
  if (workplaceId) {
    try {
      workplace = await findWorkplaceByIdFromCrm(workplaceId);
    } catch {
      // Ignore CRM lookup errors and try local fallback.
    }

    if (!workplace) {
      workplace = await findWorkplaceById(workplaceId);
    }
  }

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

export async function listWorkersWithAssignments() {
  const users = await listUsers();
  const filtered = users.filter((user) => user.role !== "admin");
  const withWorkplaces = await Promise.all(filtered.map(toWorkerWithWorkplace));
  return withWorkplaces.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function assignWorkerToWorkplace(workerUserId, workplaceId) {
  const worker = await findUserById(workerUserId);
  if (!worker || worker.role === "admin") {
    throw new HttpError(404, "Worker not found");
  }

  let assignedWorkplaceId = null;
  if (workplaceId !== null && workplaceId !== undefined && workplaceId !== "") {
    if (typeof workplaceId !== "string") {
      throw new HttpError(400, "workplaceId must be a string or null");
    }

    const cleanWorkplaceId = workplaceId.trim();
    let workplace = null;

    try {
      workplace = await findWorkplaceByIdFromCrm(cleanWorkplaceId);
    } catch {
      // Ignore CRM lookup errors and try local fallback.
    }

    if (!workplace) {
      workplace = await findWorkplaceById(cleanWorkplaceId);
    }

    if (!workplace) throw new HttpError(404, "Workplace not found");
    if (workplace.active === false) {
      throw new HttpError(400, "Cannot assign inactive workplace");
    }

    assignedWorkplaceId = workplace.id;
  }

  const updated = await updateUserById(worker.id, {
    profile: {
      ...(worker.profile && typeof worker.profile === "object" ? worker.profile : {}),
      assignedWorkplaceId,
    },
    updatedAt: new Date().toISOString(),
  });

  if (!updated) throw new HttpError(404, "Worker not found");
  return toWorkerWithWorkplace(updated);
}

export async function listAssignableWorkplaces() {
  let workplaces = [];

  try {
    workplaces = await listWorkplacesFromCrm();
  } catch {
    workplaces = [];
  }

  if (!Array.isArray(workplaces) || workplaces.length === 0) {
    workplaces = await listWorkplaces();
  }

  return workplaces
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
