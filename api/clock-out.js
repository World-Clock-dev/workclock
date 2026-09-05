import { sql, json, validCoords, distanceMiles, requireEmployee, requireSameOrigin, settingNumber, audit } from './_db.js';

const ALLOWED_NOTES = new Set(['Ending shift','Doctor appointment','Emergency','Project completed','Client request']);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {}, lat = Number(b.lat), lng = Number(b.lng), note = String(b.note || 'Ending shift').trim();
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    if (!ALLOWED_NOTES.has(note)) return json(res, 400, { error: 'Please select a valid Clock Out note.' });
    const sh = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if (!sh.length) return json(res, 409, { error: 'You do not have an active Clock In.' });
    const miles = distanceMiles(Number(sh[0].clock_in_lat), Number(sh[0].clock_in_lng), lat, lng);
    const radius = await settingNumber('clock_out_radius_miles', 3);
    if (miles > radius) {
      await sql`INSERT INTO rejected_clock_outs(shift_id,lat,lng,distance_miles,reason) VALUES(${sh[0].id},${lat},${lng},${miles},${`More than ${radius.toFixed(2)} miles from clock-in location`})`;
      await audit('employee', emp.id, 'clock_out_rejected', { shift_id: sh[0].id, distance_miles: miles });
      return json(res, 403, { error: `CLOCK OUT REJECTED — you are ${miles.toFixed(2)} miles from Clock In. You must be within ${radius.toFixed(2)} miles.`, distance: miles });
    }
    const rows = await sql`
      UPDATE shifts
      SET clock_out=now(),clock_out_lat=${lat},clock_out_lng=${lng},clock_out_distance_miles=${miles},clock_out_note=${note}
      WHERE id=${sh[0].id} AND employee_id=${emp.id} AND clock_out IS NULL
      RETURNING id,clock_in,clock_out,clock_out_distance_miles,clock_out_note`;
    if (!rows.length) return json(res, 409, { error: 'This shift was already clocked out. Please refresh.' });
    await audit('employee', emp.id, 'clock_out', { shift_id: rows[0].id, distance_miles: miles, note });
    return json(res, 200, { ok: true, distance: miles, shift: rows[0] });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
