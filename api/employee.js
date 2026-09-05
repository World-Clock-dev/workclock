import { sql, json, requireEmployee, getPaySettings, computePaidHours } from './_db.js';

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const emp = await requireEmployee(req, res); if (!emp) return;
    const u = new URL(req.url, 'https://workclock.invalid');
    const startText = u.searchParams.get('start'), endText = u.searchParams.get('end');
    if (startText && Number.isNaN(Date.parse(startText))) return json(res, 400, { error: 'Invalid start date.' });
    if (endText && Number.isNaN(Date.parse(endText))) return json(res, 400, { error: 'Invalid end date.' });

    const settings = await getPaySettings();
    const shifts = await sql`
      SELECT id,clock_in,clock_out,clock_out_note,cancelled,auto_clocked_out,
             approval_status,approved_paid_hours
      FROM shifts
      WHERE employee_id=${emp.id}
        AND (${startText}::timestamptz IS NULL OR clock_in>=${startText}::timestamptz)
        AND (${endText}::timestamptz IS NULL OR clock_in<${endText}::timestamptz)
      ORDER BY clock_in`;

    const start = startText ? new Date(startText) : startOfDay(new Date());
    const days = Array(7).fill(0);
    for (const s of shifts) {
      if (!s.clock_out) continue; // open shift isn't finished, doesn't count toward a day total yet
      const idx = Math.floor((startOfDay(new Date(s.clock_in)) - startOfDay(start)) / 86400000);
      if (idx < 0 || idx >= 7) continue;
      days[idx] += computePaidHours(s, settings);
    }

    const open = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    let runningPaidHours = 0;
    if (open[0]) runningPaidHours = computePaidHours({ ...open[0], clock_out: null }, settings);

    // A one-time notice for an unattended 12-hour auto clock-out, shown once
    // then marked seen so it never appears again for the same shift.
    const stale = await sql`
      SELECT id, clock_in, clock_out FROM shifts
      WHERE employee_id=${emp.id} AND auto_clocked_out=true AND stale_notice_seen=false
      ORDER BY clock_out DESC LIMIT 1`;
    let staleNotice = null;
    if (stale.length) {
      staleNotice = { clockIn: stale[0].clock_in, clockOut: stale[0].clock_out };
      await sql`UPDATE shifts SET stale_notice_seen=true WHERE id=${stale[0].id}`;
    }

    return json(res, 200, {
      authorized: true,
      employee: { id: emp.id, name: emp.name, hourly_wage: emp.hourly_wage },
      openShift: open[0] || null,
      runningPaidHours,
      week: { days },
      staleNotice,
      settings: { project_completed_min_paid_hours: settings.project_completed_min_paid_hours }
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
