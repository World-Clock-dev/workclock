import { sql, json, getManager, requireSameOrigin, settingNumber, audit } from './_db.js';
import crypto from 'node:crypto';

const MIN_MONTHS = 1, MAX_MONTHS = 120, DEFAULT_MONTHS = 6;

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
// are, because deleting one would strand an employee who is still clocked in.
async function purge(cutoffIso) {
  const shifts = await sql`DELETE FROM shifts WHERE clock_in < ${cutoffIso}::timestamptz AND clock_out IS NOT NULL RETURNING id`;
  const audits = await sql`DELETE FROM audit_logs WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const attempts = await sql`DELETE FROM auth_attempts WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const pinResets = await sql`DELETE FROM pin_reset_requests WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  const runs = await sql`DELETE FROM retention_runs WHERE created_at < ${cutoffIso}::timestamptz RETURNING id`;
  // Expired credentials are useless well before the retention window closes.
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

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

    const isCron = cronAuthorized(req);
    const manager = isCron ? null : await getManager(req);
    if (!isCron && !manager) return json(res, 401, { error: 'Manager login or cron secret required.' });

    const months = await retentionMonths();
    const cutoffRow = await sql`SELECT (now() - (${months} || ' months')::interval) AS cutoff`;
    const cutoff = new Date(cutoffRow[0].cutoff);
    const cutoffIso = cutoff.toISOString();

    // Vercel Cron invokes this path with GET, so an authorized cron call always
    // purges. For a signed-in manager, GET is a dry run and POST performs it.
    if (!isCron && req.method === 'GET') {
      const rows = await sql`
        SELECT
          (SELECT count(*)::int FROM shifts WHERE clock_in < ${cutoffIso}::timestamptz AND clock_out IS NOT NULL) AS shifts,
          (SELECT count(*)::int FROM audit_logs WHERE created_at < ${cutoffIso}::timestamptz) AS audit_logs,
          (SELECT count(*)::int FROM auth_attempts WHERE created_at < ${cutoffIso}::timestamptz) AS auth_attempts,
          (SELECT count(*)::int FROM pin_reset_requests WHERE created_at < ${cutoffIso}::timestamptz) AS pin_reset_requests,
          (SELECT min(clock_in) FROM shifts) AS oldest_shift`;
      const last = await sql`SELECT triggered_by,retention_months,cutoff,deleted,created_at FROM retention_runs ORDER BY created_at DESC LIMIT 1`;
      return json(res, 200, {
        retentionMonths: months,
        cutoff: cutoffIso,
        pending: rows[0],
        lastRun: last[0] || null
      });
    }

    if (!isCron && !requireSameOrigin(req, res)) return;

    const deleted = await purge(cutoffIso);
    await sql`INSERT INTO retention_runs(triggered_by,manager_id,retention_months,cutoff,deleted)
              VALUES(${isCron ? 'cron' : 'manager'},${manager?.id ?? null},${months},${cutoffIso}::timestamptz,${JSON.stringify(deleted)}::jsonb)`;
    await audit(isCron ? 'system' : 'manager', manager?.id ?? null, 'retention_purge', { retention_months: months, cutoff: cutoffIso, deleted });

    return json(res, 200, { ok: true, retentionMonths: months, cutoff: cutoffIso, deleted });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
