import { initializeDatabase } from "../src/db/database.js";
import { ensureBootstrapAdminExists } from "../src/services/adminBootstrapService.js";

async function main() {
  initializeDatabase();
  const result = await ensureBootstrapAdminExists("manual_seed_script");

  if (result.created) {
    console.log(`Admin created: ${result.admin.email} (${result.admin.staffId})`);
    return;
  }

  console.log("Admin user already exists. No changes made.");
}

try {
  main();
} catch (error) {
  console.error(`Failed to seed admin: ${error.message}`);
  process.exitCode = 1;
}
