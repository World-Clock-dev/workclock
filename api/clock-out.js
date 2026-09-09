import { sql, json, validCoords, distanceMiles, requireEmployee, requireSameOrigin, settingNumber, audit } from './_db.js';
import { safeAdminEmail } from './_email.js';

const htmlEscape = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

const ALLOWED = new Set(['Ending shift','Personal reason','Doctor appointment','Emergency','Project completed','Client request','Manager approval']);
const MAX_MESSAGE = 500;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {};
    const lat = Number(b.lat), lng = Number(b.lng), note = String(b.note || 'Ending shift').trim();
    const message = String(b.message || '').trim();
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    if (!ALLOWED.has(note)) return json(res, 400, { error: 'Please select a valid Clock Out reason.' });
    if (message.length > MAX_MESSAGE) return json(res, 400, { error: `Clock Out message must be ${MAX_MESSAGE} characters or fewer.` });

    const sh = await sql`
      SELECT id,clock_in,clock_in_lat,clock_in_lng
      FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL
      ORDER BY clock_in DESC LIMIT 1`;
    if (!sh.length) {
      const latest = await sql`SELECT id,clock_out FROM shifts WHERE employee_id=${emp.id} ORDER BY clock_in DESC LIMIT 1`;
      if (latest[0]?.clock_out) return json(res, 409, { error: 'Already clocked out.' });
      return json(res, 409, { error: 'You do not have an active Clock In.' });
    }

    const elapsedHours = Math.max(0, (Date.now() - new Date(sh[0].clock_in).getTime()) / 3600000);
    if (elapsedHours < 8 && !note) return json(res, 400, { error: 'Please select a reason for clocking out before 8 hours.' });

    const miles = distanceMiles(Number(sh[0].clock_in_lat), Number(sh[0].clock_in_lng), lat, lng);
    const radius = await settingNumber('clock_out_radius_miles', 3);
    if (miles > radius) {
      await sql`
        INSERT INTO rejected_clock_outs(shift_id,lat,lng,distance_miles,reason,note)
        VALUES(${sh[0].id},${lat},${lng},${miles},${`More than ${radius.toFixed(2)} miles from clock-in location`},${message || null})`;
      await audit('employee', emp.id, 'clock_out_rejected', { shift_id: sh[0].id, distance_miles: miles, reason: note, note: message || null });
      const mapLink = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
      await safeAdminEmail({
        subject: `WorkClock: rejected clock-out location — ${emp.name}`,
        text: `Employee: ${emp.name}\nReason selected: ${note}\nMessage: ${message || 'None'}\nDistance from clock-in location: ${miles.toFixed(2)} miles (allowed ${radius.toFixed(2)} miles).\nAttempted location: ${mapLink}\nThe employee was NOT clocked out.`,
        html: `<p><strong>${htmlEscape(emp.name)}</strong> attempted to clock out outside the allowed radius.</p><p><strong>Reason:</strong> ${htmlEscape(note)}<br><strong>Message:</strong> ${htmlEscape(message || 'None')}<br><strong>Distance:</strong> ${miles.toFixed(2)} miles<br><strong>Allowed:</strong> ${radius.toFixed(2)} miles</p><p><a href="${mapLink}">View attempted location</a></p><p>The employee was <strong>not</strong> clocked out.</p>`
      });
      return json(res, 403, {
        error: `CLOCK OUT REJECTED — you are ${miles.toFixed(2)} miles from Clock In. You must be within ${radius.toFixed(2)} miles.`,
        distance: miles,
        locationRecorded: true,
        ruleAlert: 'Your clock-out was not recorded because you were outside the allowed location radius. Your manager has been notified.'
      });
    }

    const needsReview = ['Project completed','Client request','Manager approval'].includes(note);
    const rows = await sql`
      UPDATE shifts
      SET clock_out=now(),clock_out_lat=${lat},clock_out_lng=${lng},clock_out_distance_miles=${miles},clock_out_note=${note},clock_out_message=${message || null},manager_review_status=${needsReview ? 'pending' : 'not_required'}
      WHERE id=${sh[0].id} AND employee_id=${emp.id} AND clock_out IS NULL
      RETURNING id,clock_in,clock_out,clock_out_distance_miles,clock_out_note,clock_out_message,manager_review_status`;
    if (!rows.length) return json(res, 409, { error: 'Already clocked out.' });
    await audit('employee', emp.id, 'clock_out', { shift_id: rows[0].id, distance_miles: miles, reason: note, note: message || null, manager_review_status: rows[0].manager_review_status });
    return json(res, 200, { ok: true, distance: miles, shift: rows[0], managerReview: needsReview });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
