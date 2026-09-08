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
      return json(res, 200, { ok: true, employee: { id: emp.id, name: emp.name }, shift: sh[0] });
    } catch (e) {
      if (e?.code === '23505') return json(res, 409, { error: 'You are already clocked in.' });
      throw e;
    }
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
