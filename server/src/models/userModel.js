import { readDatabase } from "../db/database.js";

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

export function findUserById(userId) {
  const db = readDatabase();
  return db.users.find((user) => user.id === userId) || null;
}
