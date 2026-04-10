import { readDatabase, updateDatabase } from "../db/database.js";

export function listWorkplaces() {
  const db = readDatabase();
  return (db.workplaces || []).slice();
}

export function findWorkplaceById(workplaceId) {
  const db = readDatabase();
  return (db.workplaces || []).find((item) => item.id === workplaceId) || null;
}

export function createWorkplace(workplace) {
  return updateDatabase((db) => {
    if (!Array.isArray(db.workplaces)) db.workplaces = [];
    db.workplaces.push(workplace);
    return workplace;
  });
}

export function updateWorkplace(workplaceId, update) {
  return updateDatabase((db) => {
    if (!Array.isArray(db.workplaces)) db.workplaces = [];
    const idx = db.workplaces.findIndex((item) => item.id === workplaceId);
    if (idx === -1) return null;

    db.workplaces[idx] = { ...db.workplaces[idx], ...update };
    return db.workplaces[idx];
  });
}
