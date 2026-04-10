import { readDatabase, updateDatabase } from "../db/database.js";

export function findUserByIdentifier(identifier) {
  const normalized = identifier.trim().toLowerCase();
  const db = readDatabase();

  return (
    db.users.find((user) => {
      const staffId = typeof user.staffId === "string" ? user.staffId.toLowerCase() : "";
      const email = typeof user.email === "string" ? user.email.toLowerCase() : "";
      if (staffId === normalized) return true;
      return email === normalized;
    }) || null
  );
}

export function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  const db = readDatabase();
  return db.users.find((user) => (user.email || "").toLowerCase() === normalized) || null;
}

export function findUserByStaffId(staffId) {
  const normalized = staffId.trim().toLowerCase();
  const db = readDatabase();
  return db.users.find((user) => (user.staffId || "").toLowerCase() === normalized) || null;
}

export function listUsers() {
  const db = readDatabase();
  return db.users.slice();
}

export function createUser(userRecord) {
  return updateDatabase((db) => {
    db.users.push(userRecord);
    return userRecord;
  });
}

export function updateUserById(userId, patch) {
  return updateDatabase((db) => {
    const index = db.users.findIndex((user) => user.id === userId);
    if (index === -1) return null;

    db.users[index] = { ...db.users[index], ...patch };
    return db.users[index];
  });
}

export function findUserById(userId) {
  const db = readDatabase();
  return db.users.find((user) => user.id === userId) || null;
}
