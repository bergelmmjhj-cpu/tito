-- 005_improvements.sql
-- TITO integrity/workflow baseline improvements.
-- NOTE: Current schema uses TEXT primary keys, so foreign keys here follow that convention.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS hotel_assignments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workplace_id TEXT NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, workplace_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_assignments_workplace_id ON hotel_assignments(workplace_id);

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS payroll_batch_id TEXT;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS payroll_exported_at TIMESTAMP;

ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_action_type_check;
ALTER TABLE time_logs ADD CONSTRAINT time_logs_action_type_check
  CHECK (action_type IN (
    'clock_in',
    'break_start',
    'break_end',
    'clock_out',
    'auto_clock_out',
    'admin_review',
    'admin_close_shift',
    'admin_end_break',
    'admin_payable_adjustment',
    'admin_payroll_approved',
    'admin_payroll_exported',
    'admin_payroll_reopened'
  ));

-- Backfill explicit review statuses from legacy values.
UPDATE shifts
SET review_status = CASE
  WHEN review_status = 'reviewed' THEN 'approved'
  WHEN review_status = 'follow_up_required' THEN 'needs_correction'
  ELSE review_status
END
WHERE review_status IN ('reviewed', 'follow_up_required');

-- Legacy boolean reviewed column backfill if present in historical deployments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'reviewed'
  ) THEN
    EXECUTE $sql$
      UPDATE shifts
      SET review_status = CASE
        WHEN reviewed = TRUE THEN 'approved'
        WHEN reviewed = FALSE THEN 'pending'
        ELSE review_status
      END
      WHERE review_status IS NULL
    $sql$;
  END IF;
END $$;
