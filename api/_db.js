import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/* ---------------------------------------------------------------------------
   Cloudflare D1 (SQLite) data layer.

   The handlers keep the same `sql\`...\`` tagged-template style they used with
   Neon. Interpolated values become bound `?` parameters (never string-spliced),
   and every returned row is shaped the way the Neon driver returned it, so the
   browser receives byte-for-byte compatible JSON:
     BIGINT ids          -> strings   ("12")
     NUMERIC(10,2)       -> strings   ("15.00")
     BOOLEAN             -> true/false (SQLite stores 1/0)
     JSONB               -> objects
   Timestamps are stored as ISO-8601 UTC text ("2026-11-18T02:51:00.123Z"),
   which sorts and compares correctly as text and parses with new Date().
--------------------------------------------------------------------------- */

let DB = null;
export function bindEnv(env) {
  DB = env?.DB || null;
  for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
}
export function setDatabase(db) { DB = db; }

const BIGINT_COLS = new Set(['id','employee_id','shift_id','actor_id','manager_id','manager_user_id','manager_reviewed_by']);
const NUMERIC2_COLS = new Set(['hourly_wage','manager_custom_paid_hours','paid_hours','manager_force_paid_hours']);
const BOOL_COLS = new Set(['active','has_pin']);
const JSON_COLS = new Set(['metadata','deleted']);

/* Postgres NUMERIC(10,2) rounds half away from zero in decimal; plain
   toFixed(2) works in binary and can round 7.335 down. */
function numeric2(v) {
  const r = Math.sign(v) * Number(Math.round(Number(Math.abs(v) + 'e2')) + 'e-2');
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

/* Postgres NUMERIC(10,2) columns round on write; do the same before storing. */
export const round2 = v => (v == null || !Number.isFinite(Number(v))) ? v : Number(numeric2(Number(v)));

function pgRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v == null) { out[k] = v; continue; }
    if (BIGINT_COLS.has(k) && typeof v === 'number') out[k] = String(v);
    else if (NUMERIC2_COLS.has(k) && typeof v === 'number') out[k] = numeric2(v);
    else if (BOOL_COLS.has(k)) out[k] = !!v;
    else if (JSON_COLS.has(k) && typeof v === 'string') { try { out[k] = JSON.parse(v); } catch { out[k] = v; } }
    else out[k] = v;
  }
  return out;
}

function bindValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  return v;
}

export async function sql(strings, ...values) {
  if (!DB) throw new Error('D1 binding "DB" is not configured.');
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += '?' + strings[i + 1];
  try {
    const r = await DB.prepare(text).bind(...values.map(bindValue)).all();
    return (r.results || []).map(pgRow);
  } catch (e) {
    const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
    if (/UNIQUE constraint failed/i.test(msg)) e.code = '23505';
    throw e;
  }
}

/* Time helpers replacing Postgres now() / interval arithmetic. */
export const nowIso = () => new Date().toISOString();
export const isoIn = ms => new Date(Date.now() + ms).toISOString();
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
/* Postgres CURRENT_DATE as a timestamp: today's midnight, UTC (Neon's session timezone). */
export function todayStartIso() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
/* Postgres `now() - interval 'N months'`: same day of month N months back,
   clamped to the last day when that month is shorter (Aug 31 -> Feb 28). */
export function monthsAgoIso(months, from = new Date()) {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}
/* Accept any Date.parse-able input and store/compare it as canonical ISO text. */
export function toIso(v) { if (v == null || v === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }

/* Replaces pgcrypto crypt()/gen_salt('bf'). Existing $2a$ hashes made by
   Postgres verify unchanged, so no PIN or password has to be reset. Cost 6 is
   pgcrypto's gen_salt('bf') default, kept so new hashes match the old ones. */
export const BCRYPT_COST = 6;
export async function hashSecret(plain) { return bcrypt.hash(String(plain), BCRYPT_COST); }
export async function verifySecret(plain, hash) {
  if (!hash) return false;
  try { return await bcrypt.compare(String(plain), String(hash)); } catch { return false; }
}

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  return s;
}

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
  const R = 3958.7613, rad = x => x * Math.PI / 180;
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

export function hashToken(token) {
  return crypto.createHmac('sha256', sessionSecret()).update(String(token)).digest('hex');
}
export function newToken() { return crypto.randomBytes(32).toString('base64url'); }
export function hashIp(req) {
  const raw = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return hashToken(raw || 'unknown');
}

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

async function sessionUser(req, type) {
  const cookieName = type === 'manager' ? 'wc_manager' : 'wc_employee';
  const token = getCookie(req, cookieName);
  if (!token) return null;
  const h = hashToken(token);
  if (type === 'manager') {
    const rows = await sql`
      SELECT m.id, m.username, m.active
      FROM manager_sessions s
      JOIN manager_users m ON m.id=s.manager_user_id
      WHERE s.token_hash=${h} AND s.expires_at>${nowIso()} AND m.active=1
      LIMIT 1`;
    return rows[0] || null;
  }
  const rows = await sql`
    SELECT e.id,e.name,e.title,e.hourly_wage,e.active
    FROM employee_sessions s JOIN employees e ON e.id=s.employee_id
    WHERE s.token_hash=${h} AND s.expires_at>${nowIso()} AND e.active=1 LIMIT 1`;
  return rows[0] || null;
}
export async function getManager(req) { return sessionUser(req, 'manager'); }
export async function requireManager(req, res) {
  const manager = await getManager(req);
  if (!manager) { json(res, 401, { error: 'Manager login required.' }); return null; }
  return manager;
}
export async function getEmployeeSession(req) { return sessionUser(req, 'employee'); }
export async function requireEmployee(req, res) {
  const employee = await getEmployeeSession(req);
  if (!employee) { json(res, 401, { error: 'Employee login required.' }); return null; }
  return employee;
}
function cookieSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || (!!host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host));
}
function cookieString(req, name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieSecure(req) ? '; Secure' : ''}`;
}
export function setManagerCookie(req, res, token) { res.setHeader('Set-Cookie', cookieString(req, 'wc_manager', token, 43200)); }
export function clearManagerCookie(req, res) { res.setHeader('Set-Cookie', cookieString(req, 'wc_manager', '', 0)); }
export function setEmployeeCookie(req, res, token) { res.setHeader('Set-Cookie', cookieString(req, 'wc_employee', token, 43200)); }
export function clearEmployeeCookie(req, res) { res.setHeader('Set-Cookie', cookieString(req, 'wc_employee', '', 0)); }

export async function settingNumber(key, fallback) {
  const rows = await sql`SELECT value FROM app_settings WHERE key=${key} LIMIT 1`;
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) ? n : fallback;
}
export async function audit(actorType, actorId, action, metadata = {}) {
  await sql`INSERT INTO audit_logs(actor_type,actor_id,action,metadata) VALUES(${actorType},${actorId},${action},${JSON.stringify(metadata)})`;
}
