import { initializeDatabase } from "../src/db/database.js";
import { promoteUserToAdmin } from "../src/services/adminBootstrapService.js";

function readIdentifier() {
  const arg = process.argv[2];
  if (arg && arg.trim()) return arg.trim();

  if (process.env.PROMOTE_IDENTIFIER && process.env.PROMOTE_IDENTIFIER.trim()) {
    return process.env.PROMOTE_IDENTIFIER.trim();
  }

  return "";
}

function main() {
  const identifier = readIdentifier();
  if (!identifier) {
    console.error("Usage: node scripts/promoteUserToAdmin.js <staffId-or-email>");
    process.exitCode = 1;
    return;
  }

  initializeDatabase();
  const result = promoteUserToAdmin(identifier);

  if (!result.updated) {
    console.log(`No changes made: ${result.reason} (${result.user.email})`);
    return;
  }

  console.log(`Promoted to admin: ${result.user.email} (${result.user.staffId})`);
}

try {
  main();
} catch (error) {
  console.error(`Failed to promote user: ${error.message}`);
  process.exitCode = 1;
}
