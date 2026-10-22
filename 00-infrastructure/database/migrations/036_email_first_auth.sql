-- Safar Service: allow email-first registration without deleting legacy account data.
-- Existing phone-based users remain valid; NULL phone values do not collide in PostgreSQL unique indexes.
ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

-- Guard against historical case/whitespace variants before enforcing normalized email uniqueness.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE email IS NOT NULL AND deleted_at IS NULL
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Email-first auth migration stopped: duplicate normalized emails exist; reconcile them before retrying.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized_active
  ON users (LOWER(BTRIM(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
