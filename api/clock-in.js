import { sql, json, validCoords, requireEmployee, requireSameOrigin, audit } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {}, lat = Number(b.lat), lng = Number(b.lng);
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    try {
      const sh = await sql`INSERT INTO shifts(employee_id,clock_in_lat,clock_in_lng) VALUES(${emp.id},${lat},${lng}) RETURNING id,clock_in`;
      await audit('employee', emp.id, 'clock_in', { shift_id: sh[0].id });
      const prior = await sql`
        SELECT r.id,r.created_at,r.distance_miles,r.lat,r.lng,r.reason,r.note
        FROM rejected_clock_outs r JOIN shifts s ON s.id=r.shift_id
        WHERE s.employee_id=${emp.id} AND r.created_at < CURRENT_DATE AND r.created_at >= now()-interval '30 days'
        ORDER BY r.created_at DESC LIMIT 1`;
      return json(res, 200, {
        ok: true,
        employee: { id: emp.id, name: emp.name, title: emp.title },
        shift: sh[0],
        ruleAlert: prior[0] ? 'Notice: a previous clock-out attempt did not follow the location rule. Your manager has been notified.' : null,
        ruleAlertId: prior[0]?.id || null
      });
    } catch (e) {
      if (e?.code === '23505') return json(res, 409, { error: 'Already clocked-in.' });
      throw e;
    }
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
