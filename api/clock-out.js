import { sql, json, validCoords, distanceMiles, requireEmployee, requireSameOrigin, audit, getPaySettings, getSite } from './_db.js';

const ALLOWED_NOTES = new Set(['Ending shift','Doctor appointment','Emergency','Project completed','Client request','Personal reason']);
const FULL_DAY_REASONS = new Set(['project completed','client request']);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {};
    const lat = Number(b.lat), lng = Number(b.lng);
    const note = String(b.note || 'Ending shift').trim();
    const message = String(b.message || '').trim().slice(0, 500) || null;
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    if (!ALLOWED_NOTES.has(note)) return json(res, 400, { error: 'Please select a valid Clock Out reason.' });

    const sh = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if (!sh.length) return json(res, 409, { error: 'You do not have an active Clock In.' });

    const settings = await getPaySettings();
    const site = await getSite();
    // Measure against the fixed job site once the manager has configured
    // one; otherwise fall back to the original clock-in-location check so
    // nothing breaks before that setting exists.
    const originLat = site.configured ? site.lat : Number(sh[0].clock_in_lat);
    const originLng = site.configured ? site.lng : Number(sh[0].clock_in_lng);
    const miles = distanceMiles(originLat, originLng, lat, lng);

    if (miles > settings.clock_out_radius_miles) {
      await sql`INSERT INTO rejected_clock_outs(shift_id,lat,lng,distance_miles,reason) VALUES(${sh[0].id},${lat},${lng},${miles},${`More than ${settings.clock_out_radius_miles.toFixed(2)} miles from ${site.configured ? 'the job site' : 'clock-in location'}`})`;
      await audit('employee', emp.id, 'clock_out_rejected', { shift_id: sh[0].id, distance_miles: miles });
      return json(res, 403, {
        error: `CLOCK OUT REJECTED — you are ${miles.toFixed(2)} miles from ${site.configured ? 'the job site' : 'your Clock In location'}. You must be within ${settings.clock_out_radius_miles.toFixed(2)} miles. Your attempted location has been recorded; you have not been clocked out.`,
        distance: miles
      });
    }

    const pendingApproval = FULL_DAY_REASONS.has(note.toLowerCase());
    const rows = await sql`
      UPDATE shifts
      SET clock_out=now(), clock_out_lat=${lat}, clock_out_lng=${lng}, clock_out_distance_miles=${miles},
          clock_out_note=${note}, clock_out_message=${message},
          approval_status=${pendingApproval ? 'pending' : null}
      WHERE id=${sh[0].id} AND employee_id=${emp.id} AND clock_out IS NULL
      RETURNING id,clock_in,clock_out,clock_out_distance_miles,clock_out_note`;
    if (!rows.length) return json(res, 409, { error: 'This shift was already clocked out. Please refresh.' });
    await audit('employee', emp.id, 'clock_out', { shift_id: rows[0].id, distance_miles: miles, note, pending_approval: pendingApproval });
    return json(res, 200, { ok: true, distance: miles, shift: rows[0], pendingApproval });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
