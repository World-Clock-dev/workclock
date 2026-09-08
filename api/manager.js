import { sql, json, requireManager, settingNumber } from './_db.js';

function hoursBetween(a, b) {
  return Math.max(0, (new Date(b || Date.now()) - new Date(a)) / 3600000);
}
function buildPaidSummary(shifts, start, end) {
  const byEmployee = new Map();
  for (const x of shifts) {
    const ci = new Date(x.clock_in);
    const dayIndex = Math.floor((ci - start) / 86400000);
    if (dayIndex < 0 || dayIndex >= 7) continue;
    const key = `${x.employee_id}:${dayIndex}`;
    if (!byEmployee.has(key)) byEmployee.set(key, { employee_id:x.employee_id, dayIndex, actual:0, completed:false });
    const d = byEmployee.get(key);
    d.actual += hoursBetween(x.clock_in, x.clock_out);
    if (x.clock_out && String(x.clock_out_note || '').toLowerCase() === 'project completed') d.completed = true;
  }
  return byEmployee;
}

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const u = new URL(req.url, 'https://workclock.invalid'), startText = u.searchParams.get('start'), endText = u.searchParams.get('end');
    if (!startText || !endText || Number.isNaN(Date.parse(startText)) || Number.isNaN(Date.parse(endText))) return json(res, 400, { error: 'Valid start and end are required.' });
    const start = new Date(startText), end = new Date(endText);
    if (!(end > start) || (end - start) > 8 * 86400000) return json(res, 400, { error: 'Invalid date range.' });
    const employees = await sql`SELECT id,name,hourly_wage,active FROM employees WHERE active=true ORDER BY name`;
    const shifts = await sql`
      SELECT s.id,e.id AS employee_id,e.name,e.hourly_wage,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,
      (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
      FROM shifts s JOIN employees e ON e.id=s.employee_id
      WHERE s.clock_in>=${start.toISOString()}::timestamptz AND s.clock_in<${end.toISOString()}::timestamptz
      ORDER BY s.clock_in DESC`;
    const daily = buildPaidSummary(shifts, start, end);
    const summary = { total_paid_hours:0, total_payroll:0, rejected_clock_outs:0 };
    const paidMinimum = await settingNumber('project_completed_min_paid_hours', 8);
    const weekly = {};
    for (const e of employees) weekly[e.id] = { employee_id:e.id, name:e.name, wage:Number(e.hourly_wage||0), days:[0,0,0,0,0,0,0], actual_days:[0,0,0,0,0,0,0] };
    for (const [key,d] of daily) {
      const paid = d.completed && d.actual < paidMinimum ? paidMinimum : d.actual;
      const e = weekly[d.employee_id];
      if (e && d.dayIndex >= 0 && d.dayIndex < 7) { e.days[d.dayIndex] += paid; e.actual_days[d.dayIndex] += d.actual; }
      summary.total_paid_hours += paid;
      summary.total_payroll += paid * Number(e?.wage || 0);
    }
    summary.rejected_clock_outs = shifts.reduce((n,x)=>n+Number(x.rejected_count||0),0);
    for (const e of Object.values(weekly)) e.total = e.days.reduce((a,b)=>a+b,0), e.earnings=e.total*e.wage;
    return json(res, 200, { employees, shifts, summary, weekly:Object.values(weekly), settings:{project_completed_min_paid_hours:paidMinimum} });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
