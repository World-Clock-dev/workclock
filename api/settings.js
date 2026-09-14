import { sql, json, requireManager, getManager, requireSameOrigin, settingNumber, audit } from './_db.js';
import crypto from 'node:crypto';

const LIMITS = {
  clock_out_radius_miles: [0.1, 100],
  project_completed_min_paid_hours: [0, 24],
  max_active_employees: [1, 1000],
  data_retention_months: [1, 120]
};

const MIN_MONTHS = 1, MAX_MONTHS = 120, DEFAULT_MONTHS = 6;

async function readSettings() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key IN ('clock_out_radius_miles','project_completed_min_paid_hours','max_active_employees','data_retention_months')`;
  const settings = {};
  for (const r of rows) settings[r.key] = Number(r.value);
  return settings;
}

/* ---------------------------------------------------------------------------
   Data retention lives in this file rather than its own api/retention.js
   because Vercel's Hobby plan allows at most 12 Serverless Functions and this
   project already uses all 12. Files beginning with "_" are helpers and do not
   count toward that limit, so folding this in keeps the deployment valid.
   Reached via /api/retention, which vercel.json rewrites to this handler.
--------------------------------------------------------------------------- */

function isRetentionRequest(req) {
  const u = new URL(req.url, 'https://workclock.invalid');
  return u.searchParams.get('action') === 'retention' || /\/retention\/?$/.test(u.pathname);
}

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const provided = bearer || String(req.headers['x-cron-secret'] || '');
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function retentionMonths() {
  const n = await settingNumber('data_retention_months', DEFAULT_MONTHS);
  if (!Number.isFinite(n)) return DEFAULT_MONTHS;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.round(n)));
}

// Purge time data older than the cutoff. Employees, manager accounts and app
// settings are never touched. Open shifts are never deleted, however old they
// are, because removing one would strand an employee who is still clocked in.
async function purge(cutoffIso) {
  const shifts = await sql`DELETE FROM shifts WHERE clock_in < ${cutoffIso}::timestamptz AND clock_out IS NOT NULL RETURNING id`;
  const audits = await sql`DELETE FROM audit_logs WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const attempts = await sql`DELETE FROM auth_attempts WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const pinResets = await sql`DELETE FROM pin_reset_requests WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const runs = await sql`DELETE FROM retention_runs WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const empSessions = await sql`DELETE FROM employee_sessions WHERE expires_at < now() RETURNING token_hash`;
  const mgrSessions = await sql`DELETE FROM manager_sessions WHERE expires_at < now() RETURNING token_hash`;
  const resetTokens = await sql`DELETE FROM manager_reset_tokens WHERE expires_at < now() RETURNING token_hash`;
  return {
    shifts: shifts.length,
    rejected_clock_outs: 'cascade',
    manager_force_clockouts: 'cascade',
    audit_logs: audits.length,
    auth_attempts: attempts.length,
    pin_reset_requests: pinResets.length,
    retention_runs: runs.length,
    expired_employee_sessions: empSessions.length,
    expired_manager_sessions: mgrSessions.length,
    expired_reset_tokens: resetTokens.length
  };
}

async function handleRetention(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  const isCron = cronAuthorized(req);
  const manager = isCron ? null : await getManager(req);
  if (!isCron && !manager) return json(res, 401, { error: 'Manager login or cron secret required.' });

  const months = await retentionMonths();
  const cutoffRow = await sql`SELECT (now() - (${months} || ' months')::interval) AS cutoff`;
  const cutoffIso = new Date(cutoffRow[0].cutoff).toISOString();

  // Vercel Cron calls with GET, so an authorized cron request always purges.
  // For a signed-in manager, GET is a dry run and POST performs the deletion.
  if (!isCron && req.method === 'GET') {
    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM shifts WHERE clock_in < ${cutoffIso}::timestamptz AND clock_out IS NOT NULL) AS shifts,
        (SELECT count(*)::int FROM audit_logs WHERE created_at < ${cutoffIso}::timestamptz) AS audit_logs,
        (SELECT count(*)::int FROM auth_attempts WHERE created_at < ${cutoffIso}::timestamptz) AS auth_attempts,
        (SELECT count(*)::int FROM pin_reset_requests WHERE created_at < ${cutoffIso}::timestamptz) AS pin_reset_requests,
        (SELECT min(clock_in) FROM shifts) AS oldest_shift`;
    const last = await sql`SELECT triggered_by,retention_months,cutoff,deleted,created_at FROM retention_runs ORDER BY created_at DESC LIMIT 1`;
    return json(res, 200, { retentionMonths: months, cutoff: cutoffIso, pending: rows[0], lastRun: last[0] || null });
  }

  if (!isCron && !requireSameOrigin(req, res)) return;

  const deleted = await purge(cutoffIso);
  await sql`INSERT INTO retention_runs(triggered_by,manager_id,retention_months,cutoff,deleted)
            VALUES(${isCron ? 'cron' : 'manager'},${manager?.id ?? null},${months},${cutoffIso}::timestamptz,${JSON.stringify(deleted)}::jsonb)`;
  await audit(isCron ? 'system' : 'manager', manager?.id ?? null, 'retention_purge', { retention_months: months, cutoff: cutoffIso, deleted });

  return json(res, 200, { ok: true, retentionMonths: months, cutoff: cutoffIso, deleted });
}

export default async function handler(req, res) {
  try {
    if (isRetentionRequest(req)) return await handleRetention(req, res);

    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method === 'GET') return json(res, 200, { settings: await readSettings() });
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;

    const b = req.body || {};
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (b[key] === undefined) continue;
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < min || n > max) return json(res, 400, { error: `Invalid ${key}.` });
      const value = (key === 'max_active_employees' || key === 'data_retention_months') ? String(Math.round(n)) : String(n);
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES(${key},${value},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      await audit('manager', manager.id, 'setting_updated', { key, value });
    }
    return json(res, 200, { settings: await readSettings() });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
