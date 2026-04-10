import { readDatabase } from "../db/database.js";

export function findUserByIdentifier(identifier) {
  const normalized = identifier.trim().toLowerCase();
  const db = readDatabase();

  return (
    db.users.find((user) => {
      if (user.staffId.toLowerCase() === normalized) return true;
      return user.email.toLowerCase() === normalized;
    }) || null
  );
}

export function findUserById(userId) {
  const db = readDatabase();
  return db.users.find((user) => user.id === userId) || null;
}
