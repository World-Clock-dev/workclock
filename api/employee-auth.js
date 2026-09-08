import { sql, norm, json, newToken, hashToken, setEmployeeCookie, clearEmployeeCookie, getEmployeeSession, getCookie, requireSameOrigin, audit } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const emp = await getEmployeeSession(req);
      return json(res, 200, { authenticated: !!emp, employee: emp ? { id: emp.id, name: emp.name } : null });
    }
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'POST') {
      const b = req.body || {};
      const name = norm(b.name);
      const pin = String(b.pin || '').trim();
      if (!name || !/^\d{4}$/.test(pin)) return json(res, 400, { error: 'Enter your approved name and 4-digit PIN.' });
      const rows = await sql`SELECT id,name,pin_hash,failed_pin_attempts,pin_locked_until FROM employees WHERE normalized_name=${name} AND active=true LIMIT 1`;
      if (!rows.length) return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      const e = rows[0];
      if (e.pin_locked_until && new Date(e.pin_locked_until) > new Date()) return json(res, 429, { error: 'Too many incorrect PIN attempts. Try again in 10 minutes or contact your manager.' });
      if (!e.pin_hash) return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      const ok = await sql`SELECT crypt(${pin}, ${e.pin_hash})=${e.pin_hash} AS ok`;
      if (!ok[0]?.ok) {
        const changed = await sql`
          UPDATE employees
          SET failed_pin_attempts=failed_pin_attempts+1,
              pin_locked_until=CASE WHEN failed_pin_attempts+1>=5 THEN now()+interval '10 minutes' ELSE pin_locked_until END,
              updated_at=now()
          WHERE id=${e.id}
          RETURNING failed_pin_attempts, pin_locked_until`;
        const next = Number(changed[0]?.failed_pin_attempts || 0);
        if (next >= 5) return json(res, 429, { error: 'Too many incorrect PIN attempts. Login locked for 10 minutes.' });
        return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      }
      await sql`UPDATE employees SET failed_pin_attempts=0,pin_locked_until=null,updated_at=now() WHERE id=${e.id}`;
      const old = getCookie(req, 'wc_employee');
      if (old) await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(old)}`;
      const token = newToken();
      await sql`INSERT INTO employee_sessions(token_hash,employee_id,expires_at) VALUES(${hashToken(token)},${e.id},now()+interval '12 hours')`;
      setEmployeeCookie(res, token);
      await audit('employee', e.id, 'employee_login');
      return json(res, 200, { ok: true, employee: { id: e.id, name: e.name } });
    }
    if (req.method === 'DELETE') {
      const tok = getCookie(req, 'wc_employee');
      if (tok) await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(tok)}`;
      clearEmployeeCookie(res);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
