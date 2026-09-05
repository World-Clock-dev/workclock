import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');

export const sql = neon(DATABASE_URL);
export const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const json = (res, status, data) => {
  res.status(status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
};
export const noBody = (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
  return false;
};

export function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

export function getCookie(req, name) {
  const cookie = String(req.headers.cookie || '');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return m?.[1] || null;
}
export function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
export function newToken() { return crypto.randomBytes(32).toString('base64url'); }

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : null;
}
export function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const expected = requestOrigin(req);
  if (!expected || origin !== expected) {
    json(res, 403, { error: 'Cross-site request blocked.' });
    return false;
  }
  return true;
}

export async function getManager(req) {
  const token = getCookie(req, 'wc_manager');
  if (!token) return null;
  const h = hashToken(token);
  const rows = await sql`
    SELECT m.id, m.username, m.active
    FROM manager_sessions s
    JOIN manager_users m ON m.id=s.manager_user_id
    WHERE s.token_hash=${h} AND s.expires_at>now() AND m.active=true
    LIMIT 1`;
  return rows[0] || null;
}
export async function requireManager(req, res) {
  const manager = await getManager(req);
  if (!manager) { json(res, 401, { error: 'Manager login required.' }); return null; }
  return manager;
}
export function setManagerCookie(res, token) {
  res.setHeader('Set-Cookie', `wc_manager=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
}
export function clearManagerCookie(res) {
  res.setHeader('Set-Cookie', 'wc_manager=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

export async function getEmployeeSession(req) {
  const token = getCookie(req, 'wc_employee');
  if (!token) return null;
  const h = hashToken(token);
  const rows = await sql`
    SELECT e.id,e.name,e.hourly_wage,e.active
    FROM employee_sessions s JOIN employees e ON e.id=s.employee_id
    WHERE s.token_hash=${h} AND s.expires_at>now() AND e.active=true LIMIT 1`;
  return rows[0] || null;
}
export async function requireEmployee(req, res) {
  const employee = await getEmployeeSession(req);
  if (!employee) { json(res, 401, { error: 'Employee login required.' }); return null; }
  return employee;
}
export function setEmployeeCookie(res, token) {
  res.setHeader('Set-Cookie', `wc_employee=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
}
export function clearEmployeeCookie(res) {
  res.setHeader('Set-Cookie', 'wc_employee=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

export async function settingNumber(key, fallback) {
  const rows = await sql`SELECT value FROM app_settings WHERE key=${key} LIMIT 1`;
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) ? n : fallback;
}
export async function audit(actorType, actorId, action, metadata = {}) {
  await sql`INSERT INTO audit_logs(actor_type,actor_id,action,metadata) VALUES(${actorType},${actorId},${action},${JSON.stringify(metadata)}::jsonb)`;
}

// ---------------------------------------------------------------------------
// Shared pay-period settings and site geofence
// ---------------------------------------------------------------------------
export async function getPaySettings() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key IN
    ('clock_out_radius_miles','project_completed_min_paid_hours','full_day_round_threshold_hours','max_active_employees')`;
  const m = {}; for (const r of rows) m[r.key] = r.value;
  return {
    clock_out_radius_miles: Number(m.clock_out_radius_miles ?? 3),
    project_completed_min_paid_hours: Number(m.project_completed_min_paid_hours ?? 8),
    full_day_round_threshold_hours: Number(m.full_day_round_threshold_hours ?? 7.75),
    max_active_employees: Number(m.max_active_employees ?? 100),
  };
}
export async function getSite() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key IN ('site_lat','site_lng','site_label')`;
  const m = {}; for (const r of rows) m[r.key] = r.value;
  const lat = Number(m.site_lat), lng = Number(m.site_lng);
  const configured = m.site_lat && m.site_lng && Number.isFinite(lat) && Number.isFinite(lng);
  return { configured, lat: configured ? lat : null, lng: configured ? lng : null, label: m.site_label || '' };
}

// ---------------------------------------------------------------------------
// Shift pay calculation — the single source of truth used by every endpoint
// that shows or totals hours/earnings, so the rules can never drift apart.
// ---------------------------------------------------------------------------
export function hoursBetween(clockIn, clockOut) {
  return Math.max(0, (new Date(clockOut || Date.now()) - new Date(clockIn)) / 3600000);
}
const FULL_DAY_REASONS = new Set(['project completed', 'client request']);
export function computePaidHours(shift, settings) {
  if (shift.cancelled) return 0;
  const actual = hoursBetween(shift.clock_in, shift.clock_out);
  if (!shift.clock_out) return actual; // still an open shift — show the running total, no pay rule applies yet
  const minimum = Number(settings.project_completed_min_paid_hours ?? 8);
  const threshold = Number(settings.full_day_round_threshold_hours ?? 7.75);
  // A manager's explicit override always wins, regardless of reason or hours.
  if (shift.approval_status === 'adjusted' && shift.approved_paid_hours != null) {
    return Number(shift.approved_paid_hours);
  }
  // An unattended 12-hour auto clock-out isn't a real worked duration — assume
  // a standard day until a manager reviews it and says otherwise.
  if (shift.auto_clocked_out) return minimum;
  // Close enough to a full day that the reason picked in the last few minutes
  // shouldn't matter — round up, and never let it reduce genuine overtime.
  if (actual >= threshold) return Math.max(actual, minimum);
  // Project completed / client request, left meaningfully early: paid the
  // standard minimum provisionally, pending manager review.
  if (FULL_DAY_REASONS.has(String(shift.clock_out_note || '').toLowerCase())) return minimum;
  // Personal reason, doctor, emergency, or an early plain "ending shift":
  // paid exactly the hours actually worked.
  return actual;
}
export function needsApproval(shift, settings) {
  if (shift.cancelled || !shift.clock_out) return false;
  const actual = hoursBetween(shift.clock_in, shift.clock_out);
  const threshold = Number(settings.full_day_round_threshold_hours ?? 7.75);
  if (actual >= threshold) return false; // already earns the minimum on its own merits, nothing to review
  return FULL_DAY_REASONS.has(String(shift.clock_out_note || '').toLowerCase()) && shift.approval_status === 'pending';
}
