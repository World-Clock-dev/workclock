import { sql, json, requireManager, requireSameOrigin, audit } from './_db.js';

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;

    const employeeId = Number(req.body?.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) return json(res, 400, { error: 'A valid employee is required.' });

    const sh = await sql`SELECT id FROM shifts WHERE employee_id=${employeeId} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if (!sh.length) return json(res, 409, { error: 'That employee does not have an active Clock In.' });

    const rows = await sql`
      UPDATE shifts
      SET clock_out=now(), clock_out_note='Manager clock-out', closed_by_manager=true
      WHERE id=${sh[0].id} AND clock_out IS NULL
      RETURNING id`;
    if (!rows.length) return json(res, 409, { error: 'This shift was already closed. Please refresh.' });
    await audit('manager', manager.id, 'manager_clock_out', { shift_id: rows[0].id, employee_id: employeeId });
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
