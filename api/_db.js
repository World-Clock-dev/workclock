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
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(token)).digest('hex');
}
export function newToken() { return crypto.randomBytes(32).toString('base64url'); }
export function hashIp(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
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
      WHERE s.token_hash=${h} AND s.expires_at>now() AND m.active=true
      LIMIT 1`;
    return rows[0] || null;
  }
  const rows = await sql`
    SELECT e.id,e.name,e.title,e.hourly_wage,e.active
    FROM employee_sessions s JOIN employees e ON e.id=s.employee_id
    WHERE s.token_hash=${h} AND s.expires_at>now() AND e.active=true LIMIT 1`;
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
  await sql`INSERT INTO audit_logs(actor_type,actor_id,action,metadata) VALUES(${actorType},${actorId},${action},${JSON.stringify(metadata)}::jsonb)`;
}
