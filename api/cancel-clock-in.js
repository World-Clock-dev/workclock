import { sql, json, requireEmployee, requireSameOrigin, audit } from './_db.js';

// Lets an employee undo a mistaken clock-in — e.g. starting the app from
// home by accident — without any GPS/radius requirement, since the whole
// point is that they are not where they meant to be. Only usable shortly
// after clocking in, and always pays exactly $0 for that shift.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;

    const open = await sql`SELECT id,clock_in FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if (!open.length) return json(res, 409, { error: 'You do not have an active Clock In to cancel.' });

    const ageHours = (Date.now() - new Date(open[0].clock_in).getTime()) / 3600000;
    if (ageHours > 2) {
      return json(res, 409, {
        error: 'This Clock In is more than 2 hours old, so it can no longer be cancelled. Use Clock Out instead, or ask your manager to close this shift for you.'
      });
    }

    const rows = await sql`
      UPDATE shifts
      SET clock_out=now(), clock_out_note='Cancelled — mistaken clock-in', cancelled=true
      WHERE id=${open[0].id} AND employee_id=${emp.id} AND clock_out IS NULL
      RETURNING id`;
    if (!rows.length) return json(res, 409, { error: 'This shift was already closed. Please refresh.' });
    await audit('employee', emp.id, 'clock_in_cancelled', { shift_id: rows[0].id });
    return json(res, 200, { ok: true, message: 'Clock In cancelled. This shift will not be paid — clock in again once you are at the right location.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
