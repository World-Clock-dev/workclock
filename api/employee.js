import { sql, json, requireEmployee, settingNumber } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const emp = await requireEmployee(req, res); if (!emp) return;
    const u = new URL(req.url, 'https://workclock.invalid');
    const start = u.searchParams.get('start'), end = u.searchParams.get('end');
    if (start && Number.isNaN(Date.parse(start))) return json(res, 400, { error: 'Invalid start date.' });
    if (end && Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Invalid end date.' });
    const shifts = await sql`
      SELECT s.id,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,
             s.clock_out_distance_miles,s.clock_out_note,
             (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
      FROM shifts s
      WHERE s.employee_id=${emp.id}
        AND (${start}::timestamptz IS NULL OR s.clock_in>=${start}::timestamptz)
        AND (${end}::timestamptz IS NULL OR s.clock_in<${end}::timestamptz)
      ORDER BY s.clock_in`;
    const paidMinimum = await settingNumber('project_completed_min_paid_hours', 8);
    const open = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    return json(res, 200, { authorized:true, employee:{id:emp.id,name:emp.name,hourly_wage:emp.hourly_wage}, shifts, openShift:open[0]||null, settings:{project_completed_min_paid_hours:paidMinimum} });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
