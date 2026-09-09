-- WorkClock database schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS manager_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  normalized_name TEXT NOT NULL UNIQUE,
  email TEXT,
  hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hourly_wage >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  pin_hash TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_sessions (
  token_hash TEXT PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_sessions_expiry_idx ON employee_sessions(expires_at);

CREATE TABLE IF NOT EXISTS manager_sessions (
  token_hash TEXT PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_sessions_expiry_idx ON manager_sessions(expires_at);

CREATE TABLE IF NOT EXISTS shifts (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_in_lat DOUBLE PRECISION NOT NULL,
  clock_in_lng DOUBLE PRECISION NOT NULL,
  clock_out TIMESTAMPTZ,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_out_distance_miles DOUBLE PRECISION,
  clock_out_note TEXT,
  clock_out_message TEXT,
  manager_review_status TEXT NOT NULL DEFAULT 'not_required' CHECK (manager_review_status IN ('not_required','pending','approved_full','approved_actual')),
  manager_reviewed_by BIGINT REFERENCES manager_users(id),
  manager_reviewed_at TIMESTAMPTZ,
  manager_review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shifts_employee_clockin_idx ON shifts(employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS shifts_clockin_idx ON shifts(clock_in);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_employee_idx
  ON shifts(employee_id) WHERE clock_out IS NULL;

CREATE TABLE IF NOT EXISTS rejected_clock_outs (
  id BIGSERIAL PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  distance_miles DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rejected_shift_idx ON rejected_clock_outs(shift_id);
CREATE INDEX IF NOT EXISTS rejected_created_idx ON rejected_clock_outs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings(key, value) VALUES
  ('clock_out_radius_miles', '3'),
  ('project_completed_min_paid_hours', '8'),
  ('max_active_employees', '100')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('manager','employee','system')),
  actor_id BIGINT,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup_idx ON auth_attempts(kind,ip_hash,created_at DESC);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clock_out_message TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manager_review_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manager_reviewed_by BIGINT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manager_reviewed_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manager_review_note TEXT;
ALTER TABLE rejected_clock_outs ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_manager_review_status_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_manager_review_status_check CHECK (manager_review_status IN ('not_required','pending','approved_full','approved_actual'));



ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS manager_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_reset_tokens_expiry_idx ON manager_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS pin_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  requested_name TEXT NOT NULL,
  request_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_reset_requests_created_idx ON pin_reset_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS pin_reset_requests_ip_idx ON pin_reset_requests(request_ip_hash,created_at DESC);
ALTER TABLE pin_reset_requests ADD COLUMN IF NOT EXISTS request_ip_hash TEXT;

CREATE TABLE IF NOT EXISTS manager_force_clockouts (
  id BIGSERIAL PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  manager_id BIGINT NOT NULL REFERENCES manager_users(id),
  clock_out_at TIMESTAMPTZ NOT NULL,
  pay_mode TEXT NOT NULL CHECK (pay_mode IN ('actual','eight','custom')),
  paid_hours NUMERIC(10,2) NOT NULL CHECK (paid_hours >= 0 AND paid_hours <= 24),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_force_clockouts_shift_idx ON manager_force_clockouts(shift_id);
CREATE INDEX IF NOT EXISTS manager_force_clockouts_created_idx ON manager_force_clockouts(created_at DESC);
