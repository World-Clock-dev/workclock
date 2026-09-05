import { sql, json, requireManager, requireSameOrigin, clearManagerCookie, getCookie, hashToken, audit } from './_db.js';

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const b = req.body || {}, current = String(b.currentPassword || ''), next = String(b.newPassword || '');
    if (!current || !next) return json(res, 400, { error: 'Current and new password are required.' });
    if (next.length < 12 || next.length > 200) return json(res, 400, { error: 'New password must be 12–200 characters.' });
    const ok = await sql`SELECT id FROM manager_users WHERE id=${manager.id} AND active=true AND password_hash=crypt(${current},password_hash) LIMIT 1`;
    if (!ok.length) return json(res, 401, { error: 'Current manager password is incorrect.' });
    await sql`UPDATE manager_users SET password_hash=crypt(${next},gen_salt('bf')),password_changed_at=now(),failed_login_attempts=0,locked_until=null WHERE id=${manager.id}`;
    await sql`DELETE FROM manager_sessions WHERE manager_user_id=${manager.id}`;
    clearManagerCookie(res);
    await audit('manager', manager.id, 'manager_password_changed');
    return json(res, 200, { ok: true, signedOut: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
