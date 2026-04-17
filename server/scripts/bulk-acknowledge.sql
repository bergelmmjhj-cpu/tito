\set ON_ERROR_STOP on

-- Default to dry-run when APPLY is not explicitly provided.
\if :{?APPLY}
\else
\set APPLY false
\endif

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS _bulk_ack_backup_users (
  id text,
  email text,
  role text,
  agreements_acknowledged_at timestamp,
  agreement_version text
) ON COMMIT DROP;

CREATE TEMP TABLE IF NOT EXISTS _bulk_ack_backup_user_agreements (
  user_id text,
  agreement_type text,
  acknowledged_at timestamp,
  version text,
  ip_address text
) ON COMMIT DROP;

DO $$
DECLARE
  v_apply boolean := lower(coalesce(:'APPLY', 'false')) IN ('1', 'true', 't', 'yes', 'y', 'on');
  v_reason text := 'data loss recovery - original acknowledgment records lost';
  v_action text := 'bulk_acknowledge_agreements';
  v_version text := 'v3.0';
  v_ip text := 'data-loss-recovery';

  has_users_ack boolean;
  has_users_version boolean;
  has_user_agreements boolean;
  has_audit_log boolean;

  v_backup_count integer := 0;
  v_updated_workers integer := 0;
  v_updated_agreements integer := 0;
  v_inserted_agreements integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='users'
      AND column_name='agreements_acknowledged_at'
  ) INTO has_users_ack;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='users'
      AND column_name='agreement_version'
  ) INTO has_users_version;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name='user_agreements'
  ) INTO has_user_agreements;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name='audit_log'
  ) INTO has_audit_log;

  IF has_users_ack THEN
    RAISE NOTICE 'Schema detected: users.agreements_acknowledged_at';

    IF has_users_version THEN
      INSERT INTO _bulk_ack_backup_users (id, email, role, agreements_acknowledged_at, agreement_version)
      SELECT id, email, role, agreements_acknowledged_at, agreement_version
      FROM users
      WHERE role = 'worker'
        AND agreements_acknowledged_at IS NULL;
    ELSE
      INSERT INTO _bulk_ack_backup_users (id, email, role, agreements_acknowledged_at, agreement_version)
      SELECT id, email, role, agreements_acknowledged_at, NULL::text
      FROM users
      WHERE role = 'worker'
        AND agreements_acknowledged_at IS NULL;
    END IF;

    SELECT COUNT(*) INTO v_backup_count FROM _bulk_ack_backup_users;
    RAISE NOTICE 'Workers to update: %', v_backup_count;

    IF has_users_version THEN
      UPDATE users
      SET agreements_acknowledged_at = NOW(),
          agreement_version = COALESCE(agreement_version, v_version)
      WHERE role = 'worker'
        AND agreements_acknowledged_at IS NULL;
    ELSE
      UPDATE users
      SET agreements_acknowledged_at = NOW()
      WHERE role = 'worker'
        AND agreements_acknowledged_at IS NULL;
    END IF;

    GET DIAGNOSTICS v_updated_workers = ROW_COUNT;

  ELSIF has_user_agreements THEN
    RAISE NOTICE 'Schema detected: user_agreements table';

    WITH required_types AS (
      SELECT unnest(ARRAY[
        'tito_system',
        'site_rules',
        'worker_agreement',
        'privacy_policy'
      ]::text[]) AS agreement_type
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
    INSERT INTO _bulk_ack_backup_user_agreements (user_id, agreement_type, acknowledged_at, version, ip_address)
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
    WHERE ua.user_id IS NULL OR ua.acknowledged_at IS NULL;

    SELECT COUNT(*) INTO v_backup_count FROM _bulk_ack_backup_user_agreements;
    RAISE NOTICE 'Agreement rows to repair/create: %', v_backup_count;

    UPDATE user_agreements ua
    SET acknowledged_at = NOW(),
        version = COALESCE(ua.version, v_version),
        ip_address = COALESCE(ua.ip_address, v_ip)
    FROM users u
    WHERE u.id = ua.user_id
      AND u.role = 'worker'
      AND ua.agreement_type IN ('tito_system','site_rules','worker_agreement','privacy_policy')
      AND ua.acknowledged_at IS NULL;

    GET DIAGNOSTICS v_updated_agreements = ROW_COUNT;

    WITH required_types AS (
      SELECT unnest(ARRAY[
        'tito_system',
        'site_rules',
        'worker_agreement',
        'privacy_policy'
      ]::text[]) AS agreement_type
    ),
    workers AS (
      SELECT id AS user_id
      FROM users
      WHERE role = 'worker'
    )
    INSERT INTO user_agreements (user_id, agreement_type, acknowledged_at, version, ip_address)
    SELECT w.user_id, rt.agreement_type, NOW(), v_version, v_ip
    FROM workers w
    CROSS JOIN required_types rt
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_agreements ua
      WHERE ua.user_id = w.user_id
        AND ua.agreement_type = rt.agreement_type
    );

    GET DIAGNOSTICS v_inserted_agreements = ROW_COUNT;

  ELSE
    RAISE EXCEPTION
      'No supported agreement schema found (neither users.agreements_acknowledged_at nor user_agreements)';
  END IF;

  IF has_audit_log THEN
    INSERT INTO audit_log (
      user_id,
      action,
      target_type,
      target_id,
      old_value,
      new_value,
      created_at
    )
    VALUES (
      NULL,
      v_action,
      'system',
      'worker_agreements',
      jsonb_build_object(
        'reason', v_reason,
        'apply_mode', v_apply,
        'backup_count', v_backup_count
      ),
      jsonb_build_object(
        'updated_workers', v_updated_workers,
        'updated_agreements', v_updated_agreements,
        'inserted_agreements', v_inserted_agreements,
        'version', v_version,
        'agreement_types', ARRAY['tito_system','site_rules','worker_agreement','privacy_policy']
      ),
      NOW()
    );
  END IF;

  RAISE NOTICE 'Summary: backup_count=%, updated_workers=%, updated_agreements=%, inserted_agreements=%',
    v_backup_count, v_updated_workers, v_updated_agreements, v_inserted_agreements;
END $$;

SELECT * FROM _bulk_ack_backup_users ORDER BY id LIMIT 200;
SELECT * FROM _bulk_ack_backup_user_agreements ORDER BY user_id, agreement_type LIMIT 400;

\if :APPLY
COMMIT;
\else
ROLLBACK;
\endif