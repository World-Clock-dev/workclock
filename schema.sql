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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rejected_shift_idx ON rejected_clock_outs(shift_id);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_reset_requests_created_idx ON pin_reset_requests(created_at DESC);

-- v4: shift accountability, manager approval workflow, and job-site geofencing
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clock_out_message TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending','approved','adjusted'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES manager_users(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_paid_hours NUMERIC(6,2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_clocked_out BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closed_by_manager BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS stale_notice_seen BOOLEAN NOT NULL DEFAULT true;

INSERT INTO app_settings(key, value) VALUES
  ('full_day_round_threshold_hours', '7.75'),
  ('site_lat', ''),
  ('site_lng', ''),
  ('site_label', '')
ON CONFLICT (key) DO NOTHING;
