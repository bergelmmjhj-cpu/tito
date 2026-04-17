import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeDatabase } from "../src/db/initialization.js";
import { withClient } from "../src/db/pool.js";

const AGREEMENT_TYPES = [
  "tito_system",
  "site_rules",
  "worker_agreement",
  "privacy_policy",
];
const AGREEMENT_VERSION = "v3.0";
const FALLBACK_IP = "data-loss-recovery";
const ACTION = "bulk_acknowledge_agreements";
const REASON = "data loss recovery - original acknowledgment records lost";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_FILE = path.resolve(__dirname, "../data/bulk-acknowledge-audit.log");

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const dryRun = flags.has("--dry-run");
  const apply = flags.has("--apply") || !dryRun;
  return { dryRun, apply };
}

function appendAuditFile(entry) {
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

async function detectSchema(client) {
  const result = await client.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'agreements_acknowledged_at'
      ) AS has_users_ack,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'agreement_version'
      ) AS has_users_version,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'user_agreements'
      ) AS has_user_agreements,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'audit_log'
      ) AS has_audit_log
  `);

  return result.rows[0] || {
    has_users_ack: false,
    has_users_version: false,
    has_user_agreements: false,
    has_audit_log: false,
  };
}

async function runUsersPath(client, hasUsersVersion) {
  const backup = await client.query(
    hasUsersVersion
      ? `
        SELECT id, email, role, agreements_acknowledged_at, agreement_version
        FROM users
        WHERE role = 'worker'
          AND agreements_acknowledged_at IS NULL
        ORDER BY id
      `
      : `
        SELECT id, email, role, agreements_acknowledged_at, NULL::text AS agreement_version
        FROM users
        WHERE role = 'worker'
          AND agreements_acknowledged_at IS NULL
        ORDER BY id
      `
  );

  const update = await client.query(
    hasUsersVersion
      ? `
        UPDATE users
        SET agreements_acknowledged_at = NOW(),
            agreement_version = COALESCE(agreement_version, $1)
        WHERE role = 'worker'
          AND agreements_acknowledged_at IS NULL
      `
      : `
        UPDATE users
        SET agreements_acknowledged_at = NOW()
        WHERE role = 'worker'
          AND agreements_acknowledged_at IS NULL
      `,
    hasUsersVersion ? [AGREEMENT_VERSION] : []
  );

  return {
    schemaPath: "users",
    backupPreview: backup.rows,
    backupCount: backup.rowCount,
    updatedWorkers: update.rowCount,
    updatedAgreements: 0,
    insertedAgreements: 0,
  };
}

async function runUserAgreementsPath(client) {
  const backup = await client.query(
    `
      WITH required_types AS (
        SELECT unnest($1::text[]) AS agreement_type
      ),
      workers AS (
        SELECT id AS user_id
        FROM users
        WHERE role = 'worker'
      ),
      expected AS (
        SELECT w.user_id, rt.agreement_type
        FROM workers w
        CROSS JOIN required_types rt
      )
      SELECT
        e.user_id,
        e.agreement_type,
        ua.acknowledged_at,
        ua.version,
        ua.ip_address
      FROM expected e
      LEFT JOIN user_agreements ua
        ON ua.user_id = e.user_id
       AND ua.agreement_type = e.agreement_type
      WHERE ua.user_id IS NULL OR ua.acknowledged_at IS NULL
      ORDER BY e.user_id, e.agreement_type
    `,
    [AGREEMENT_TYPES]
  );

  const update = await client.query(
    `
      UPDATE user_agreements ua
      SET acknowledged_at = NOW(),
          version = COALESCE(ua.version, $1),
          ip_address = COALESCE(ua.ip_address, $2)
      FROM users u
      WHERE u.id = ua.user_id
        AND u.role = 'worker'
        AND ua.agreement_type = ANY($3::text[])
        AND ua.acknowledged_at IS NULL
    `,
    [AGREEMENT_VERSION, FALLBACK_IP, AGREEMENT_TYPES]
  );

  const insert = await client.query(
    `
      WITH required_types AS (
        SELECT unnest($1::text[]) AS agreement_type
      ),
      workers AS (
        SELECT id AS user_id
        FROM users
        WHERE role = 'worker'
      )
      INSERT INTO user_agreements (user_id, agreement_type, acknowledged_at, version, ip_address)
      SELECT w.user_id, rt.agreement_type, NOW(), $2, $3
      FROM workers w
      CROSS JOIN required_types rt
      WHERE NOT EXISTS (
        SELECT 1
        FROM user_agreements ua
        WHERE ua.user_id = w.user_id
          AND ua.agreement_type = rt.agreement_type
      )
    `,
    [AGREEMENT_TYPES, AGREEMENT_VERSION, FALLBACK_IP]
  );

  return {
    schemaPath: "user_agreements",
    backupPreview: backup.rows,
    backupCount: backup.rowCount,
    updatedWorkers: 0,
    updatedAgreements: update.rowCount,
    insertedAgreements: insert.rowCount,
  };
}

async function writeAudit(client, hasAuditLog, summary, actor, dryRun) {
  const event = {
    action: ACTION,
    reason: REASON,
    executedAt: new Date().toISOString(),
    actor,
    dryRun,
    schemaPath: summary.schemaPath,
    counts: {
      backupCount: summary.backupCount,
      updatedWorkers: summary.updatedWorkers,
      updatedAgreements: summary.updatedAgreements,
      insertedAgreements: summary.insertedAgreements,
    },
    agreementTypes: AGREEMENT_TYPES,
    version: AGREEMENT_VERSION,
  };

  if (hasAuditLog) {
    await client.query(
      `
        INSERT INTO audit_log (
          user_id,
          action,
          target_type,
          target_id,
          old_value,
          new_value,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW())
      `,
      [
        null,
        ACTION,
        "system",
        "worker_agreements",
        JSON.stringify({ reason: REASON, backupCount: summary.backupCount }),
        JSON.stringify(event),
      ]
    );
    return;
  }

  appendAuditFile(event);
}

async function run() {
  const { dryRun, apply } = parseArgs(process.argv);
  const actor = process.env.BULK_ACK_ACTOR || process.env.USER || "system";

  await initializeDatabase();

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const schema = await detectSchema(client);

      let summary;
      if (schema.has_users_ack) {
        summary = await runUsersPath(client, schema.has_users_version);
      } else if (schema.has_user_agreements) {
        summary = await runUserAgreementsPath(client);
      } else {
        throw new Error(
          "No supported agreement schema found. Expected users.agreements_acknowledged_at or user_agreements."
        );
      }

      console.log("Backup preview (first 50 rows):");
      console.log(JSON.stringify(summary.backupPreview.slice(0, 50), null, 2));
      if (summary.backupPreview.length > 50) {
        console.log(`... ${summary.backupPreview.length - 50} additional rows not shown`);
      }

      await writeAudit(client, schema.has_audit_log, summary, actor, dryRun);

      const result = {
        mode: dryRun ? "dry-run" : "apply",
        ...summary,
      };

      console.log("Summary:");
      console.log(JSON.stringify(result, null, 2));

      if (dryRun || !apply) {
        await client.query("ROLLBACK");
        console.log("Dry-run complete. Transaction rolled back.");
      } else {
        await client.query("COMMIT");
        console.log("Apply complete. Transaction committed.");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Error occurred, transaction rolled back: ${error.message}`);
      throw error;
    }
  });
}

run().catch((error) => {
  console.error(`bulk-acknowledge failed: ${error.message}`);
  process.exitCode = 1;
});