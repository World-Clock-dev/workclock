-- WorkClock database schema for Cloudflare D1 (SQLite).
-- Same 13 tables, columns, constraints and indexes as schema.sql (Neon/Postgres).
--
-- Type mapping from Postgres:
--   BIGSERIAL            -> INTEGER PRIMARY KEY AUTOINCREMENT (ids never reused)
--   TIMESTAMPTZ          -> TEXT, ISO-8601 UTC, e.g. 2026-11-18T02:51:00.123Z
--   BOOLEAN              -> INTEGER 0/1
--   NUMERIC(10,2)        -> REAL
--   DOUBLE PRECISION     -> REAL
--   JSONB                -> TEXT holding JSON
-- The data layer (api/_db.js) converts values back to the shapes Neon returned.
-- D1 enforces foreign keys, so ON DELETE CASCADE / SET NULL behave as before.

CREATE TABLE IF NOT EXISTS manager_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  password_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT,
  normalized_name TEXT NOT NULL UNIQUE,
  email TEXT,
  hourly_wage REAL NOT NULL DEFAULT 0 CHECK (hourly_wage >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','vacation','terminated')),
  pin_hash TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(employment_status);

CREATE TABLE IF NOT EXISTS employee_sessions (
  token_hash TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS employee_sessions_expiry_idx ON employee_sessions(expires_at);

CREATE TABLE IF NOT EXISTS manager_sessions (
  token_hash TEXT PRIMARY KEY,
  manager_user_id INTEGER NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS manager_sessions_expiry_idx ON manager_sessions(expires_at);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  clock_in TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  clock_in_lat REAL NOT NULL,
  clock_in_lng REAL NOT NULL,
  clock_out TEXT,
  clock_out_lat REAL,
  clock_out_lng REAL,
  clock_out_distance_miles REAL,
  clock_out_note TEXT,
  clock_out_message TEXT,
  manager_review_status TEXT NOT NULL DEFAULT 'not_required' CHECK (manager_review_status IN ('not_required','pending','approved_full','approved_actual','approved_custom')),
  manager_custom_paid_hours REAL CHECK (manager_custom_paid_hours IS NULL OR (manager_custom_paid_hours >= 0 AND manager_custom_paid_hours <= 24)),
  manager_original_clock_out TEXT,
  manager_original_clock_in TEXT,
  manager_reviewed_by INTEGER REFERENCES manager_users(id),
  manager_reviewed_at TEXT,
  manager_review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS shifts_employee_clockin_idx ON shifts(employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS shifts_clockin_idx ON shifts(clock_in);
-- One open shift per employee (partial unique index, same as Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_employee_idx
  ON shifts(employee_id) WHERE clock_out IS NULL;

CREATE TABLE IF NOT EXISTS rejected_clock_outs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  distance_miles REAL NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS rejected_shift_idx ON rejected_clock_outs(shift_id);
CREATE INDEX IF NOT EXISTS rejected_created_idx ON rejected_clock_outs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO app_settings(key, value) VALUES
  ('clock_out_radius_miles', '3'),
  ('project_completed_min_paid_hours', '8'),
  ('max_active_employees', '100'),
  ('data_retention_months', '6')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('manager','employee','system')),
  actor_id INTEGER,
  action TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup_idx ON auth_attempts(kind, ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS manager_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  manager_user_id INTEGER NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS manager_reset_tokens_expiry_idx ON manager_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS pin_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  requested_name TEXT NOT NULL,
  request_ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS pin_reset_requests_created_idx ON pin_reset_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS pin_reset_requests_ip_idx ON pin_reset_requests(request_ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS manager_force_clockouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  manager_id INTEGER NOT NULL REFERENCES manager_users(id),
  clock_out_at TEXT NOT NULL,
  pay_mode TEXT NOT NULL CHECK (pay_mode IN ('actual','eight','custom')),
  paid_hours REAL NOT NULL CHECK (paid_hours >= 0 AND paid_hours <= 24),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS manager_force_clockouts_shift_idx ON manager_force_clockouts(shift_id);
CREATE INDEX IF NOT EXISTS manager_force_clockouts_created_idx ON manager_force_clockouts(created_at DESC);

CREATE TABLE IF NOT EXISTS retention_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron','manager')),
  manager_id INTEGER REFERENCES manager_users(id),
  retention_months INTEGER NOT NULL,
  cutoff TEXT NOT NULL,
  deleted TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS retention_runs_created_idx ON retention_runs(created_at DESC);

-- Legacy columns that exist in the live Neon database from earlier versions of
-- WorkClock. The current code does not use them; they are kept so migrated
-- rows are copied exactly, with the same defaults as in Neon.
ALTER TABLE employees ADD COLUMN job_title TEXT NOT NULL DEFAULT 'Employee';
ALTER TABLE rejected_clock_outs ADD COLUMN message TEXT;
ALTER TABLE shifts ADD COLUMN approval_status TEXT;
ALTER TABLE shifts ADD COLUMN approved_at TEXT;
ALTER TABLE shifts ADD COLUMN approved_by INTEGER;
ALTER TABLE shifts ADD COLUMN approved_by_manager_id INTEGER;
ALTER TABLE shifts ADD COLUMN approved_paid_hours REAL;
ALTER TABLE shifts ADD COLUMN auto_clocked_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shifts ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shifts ADD COLUMN clock_out_source TEXT NOT NULL DEFAULT 'employee';
ALTER TABLE shifts ADD COLUMN closed_by_manager INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shifts ADD COLUMN paid_minutes INTEGER;
ALTER TABLE shifts ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'actual';
ALTER TABLE shifts ADD COLUMN stale_notice_seen INTEGER NOT NULL DEFAULT 1;
