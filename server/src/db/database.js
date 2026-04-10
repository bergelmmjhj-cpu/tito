import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialDatabase, migrateDatabase } from "./migrations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.resolve(DATA_DIR, "db.json");

function writeDatabase(db) {
  fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

export function initializeDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    writeDatabase(createInitialDatabase());
    return;
  }

  const raw = fs.readFileSync(DB_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : null;
  const migrated = migrateDatabase(parsed);
  writeDatabase(migrated);
}

export function readDatabase() {
  const raw = fs.readFileSync(DB_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return migrateDatabase(parsed);
}

export function updateDatabase(mutator) {
  const db = readDatabase();
  const result = mutator(db);
  writeDatabase(db);
  return result;
}
