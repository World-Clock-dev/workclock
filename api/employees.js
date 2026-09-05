import { sql, norm, json, requireManager, requireSameOrigin, audit } from './_db.js';

function validEmail(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const e = String(value).trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.toLowerCase() : undefined;
}
function validWage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null;
}
function validId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'GET') {
      const rows = await sql`SELECT id,name,email,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin,
        EXISTS(SELECT 1 FROM shifts s WHERE s.employee_id=e.id AND s.clock_out IS NULL) AS has_open_shift
        FROM employees e WHERE active=true ORDER BY name`;
      return json(res, 200, { employees: rows });
    }
    if (req.method === 'POST') {
      const b = req.body || {}, name = String(b.name || '').trim().replace(/\s+/g, ' '), wage = validWage(b.wage ?? 0), pin = String(b.pin || '').trim(), email = validEmail(b.email);
      if (email === undefined) return json(res, 400, { error: 'Enter a valid employee email or leave it blank.' });
      if (!name || name.length > 120) return json(res, 400, { error: 'Enter a valid employee name (1–120 characters).' });
      if (wage === null) return json(res, 400, { error: 'Enter a valid hourly wage.' });
      if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'Enter a 4-digit employee PIN.' });
      const max = Number((await sql`SELECT value FROM app_settings WHERE key='max_active_employees' LIMIT 1`)[0]?.value || 100);
      const count = await sql`SELECT count(*)::int AS n FROM employees WHERE active=true`;
      const existing = await sql`SELECT id FROM employees WHERE normalized_name=${norm(name)} LIMIT 1`;
      if (count[0].n >= max && !existing.length) return json(res, 400, { error: `Maximum ${max} active employees.` });
      const rows = await sql`
        INSERT INTO employees(name,normalized_name,email,hourly_wage,active,pin_hash,failed_pin_attempts,pin_locked_until,updated_at)
        VALUES(${name},${norm(name)},${email},${wage},true,crypt(${pin},gen_salt('bf')),0,null,now())
        ON CONFLICT(normalized_name) DO UPDATE SET name=excluded.name,email=excluded.email,hourly_wage=excluded.hourly_wage,active=true,pin_hash=excluded.pin_hash,failed_pin_attempts=0,pin_locked_until=null,updated_at=now()
        RETURNING id,name,email,hourly_wage,active,true AS has_pin`;
      await sql`DELETE FROM employee_sessions WHERE employee_id=${rows[0].id}`;
      await audit('manager', manager.id, existing.length ? 'employee_reactivated_or_updated' : 'employee_created', { employee_id: rows[0].id });
      return json(res, 200, { employee: rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = req.body || {}, id = validId(b.id);
      if (!id) return json(res, 400, { error: 'Employee id required.' });
      if (b.pin !== undefined) {
        const pin = String(b.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'PIN must be exactly 4 digits.' });
        const rows = await sql`UPDATE employees SET pin_hash=crypt(${pin},gen_salt('bf')),failed_pin_attempts=0,pin_locked_until=null,updated_at=now() WHERE id=${id} AND active=true RETURNING id,name,email,hourly_wage,active,true AS has_pin`;
        if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
        await sql`DELETE FROM employee_sessions WHERE employee_id=${id}`;
        await audit('manager', manager.id, 'employee_pin_reset', { employee_id: id });
        return json(res, 200, { employee: rows[0] });
      }
      const wage = validWage(b.wage);
      if (wage === null) return json(res, 400, { error: 'Invalid wage.' });
      const rows = await sql`UPDATE employees SET hourly_wage=${wage},updated_at=now() WHERE id=${id} AND active=true RETURNING id,name,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin`;
      if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
      await audit('manager', manager.id, 'employee_wage_updated', { employee_id: id, wage });
      return json(res, 200, { employee: rows[0] });
    }
    if (req.method === 'DELETE') {
      const id = validId(new URL(req.url, 'https://workclock.invalid').searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'Employee id required.' });
      const rows = await sql`UPDATE employees SET active=false,updated_at=now() WHERE id=${id} AND active=true RETURNING id,name`;
      if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
      await sql`DELETE FROM employee_sessions WHERE employee_id=${id}`;
      await audit('manager', manager.id, 'employee_deactivated', { employee_id: id });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
