import { initializeDatabase } from "../src/db/initialization.js";
import { withClient } from "../src/db/pool.js";

function normalizeKeyPart(value) {
  if (typeof value !== "string" || !value.trim()) return "(UNKNOWN)";
  return value.trim().toUpperCase();
}

function buildGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${normalizeKeyPart(row.name)}|${normalizeKeyPart(row.city)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      items: items.slice().sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || "")),
    }))
    .filter((group) => group.items.length > 1);
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    dryRun: flags.has("--dry-run") || !flags.has("--apply"),
    apply: flags.has("--apply"),
  };
}

async function run() {
  const args = parseArgs(process.argv);
  await initializeDatabase();

  await withClient(async (client) => {
    const result = await client.query(
      `SELECT id, name, city, created_at
       FROM workplaces
       ORDER BY created_at ASC`
    );

    const groups = buildGroups(result.rows || []);
    if (groups.length === 0) {
      console.log("No duplicate hotels found.");
      return;
    }

    console.log(`Found ${groups.length} duplicate hotel group(s).`);
    for (const group of groups) {
      const canonical = group.items[0];
      const duplicateIds = group.items.slice(1).map((item) => item.id);
      console.log(`- ${group.key}: keep ${canonical.id}, merge [${duplicateIds.join(", ")}]`);
    }

    if (args.dryRun && !args.apply) {
      console.log("Dry run complete. Re-run with --apply to perform merge updates.");
      return;
    }

    await client.query("BEGIN");
    try {
      let updatedAssignments = 0;
      let updatedLogs = 0;
      let deactivatedHotels = 0;

      for (const group of groups) {
        const canonical = group.items[0];
        const duplicates = group.items.slice(1);

        for (const duplicate of duplicates) {
          const duplicateId = duplicate.id;

          const assignmentsResult = await client.query(
            `UPDATE user_workplace_assignments
             SET workplace_id = $1, updated_at = NOW()
             WHERE workplace_id = $2`,
            [canonical.id, duplicateId]
          );
          updatedAssignments += assignmentsResult.rowCount || 0;

          // Table may not exist yet in older environments.
          try {
            const hotelAssignmentsResult = await client.query(
              `UPDATE hotel_assignments
               SET workplace_id = $1
               WHERE workplace_id = $2`,
              [canonical.id, duplicateId]
            );
            updatedAssignments += hotelAssignmentsResult.rowCount || 0;
          } catch {
            // Ignore when table is unavailable.
          }

          const profileUpdate = await client.query(
            `UPDATE users
             SET profile = jsonb_set(profile, '{assignedWorkplaceId}', to_jsonb($1::text), true),
                 updated_at = NOW()
             WHERE profile->>'assignedWorkplaceId' = $2`,
            [canonical.id, duplicateId]
          );
          updatedAssignments += profileUpdate.rowCount || 0;

          const logUpdate = await client.query(
            `UPDATE time_logs
             SET geofence =
               jsonb_set(
                 jsonb_set(COALESCE(geofence, '{}'::jsonb), '{workplaceId}', to_jsonb($1::text), true),
                 '{resolvedWorkplaceId}',
                 to_jsonb($1::text),
                 true
               )
             WHERE (geofence->>'workplaceId' = $2 OR geofence->>'resolvedWorkplaceId' = $2)`,
            [canonical.id, duplicateId]
          );
          updatedLogs += logUpdate.rowCount || 0;

          const deactivateResult = await client.query(
            `UPDATE workplaces
             SET active = FALSE,
                 crm = jsonb_set(COALESCE(crm, '{}'::jsonb), '{mergedIntoId}', to_jsonb($1::text), true),
                 updated_at = NOW()
             WHERE id = $2`,
            [canonical.id, duplicateId]
          );
          deactivatedHotels += deactivateResult.rowCount || 0;
        }
      }

      await client.query("COMMIT");
      console.log("Merge apply complete.");
      console.log(`- Reassigned rows: ${updatedAssignments}`);
      console.log(`- Updated time logs: ${updatedLogs}`);
      console.log(`- Deactivated duplicates: ${deactivatedHotels}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

run().catch((error) => {
  console.error(`Failed to dedupe hotels: ${error.message}`);
  process.exitCode = 1;
});
