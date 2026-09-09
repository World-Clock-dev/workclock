import { sql, json, requireEmployee, settingNumber } from './_db.js';
import { allocatePaidHours, normalizeDayStarts } from './_time.js';

function parseRange(req) {
  const u = new URL(req.url, 'https://workclock.invalid');
  const start = u.searchParams.get('start'), end = u.searchParams.get('end');
  if (start && Number.isNaN(Date.parse(start))) throw new Error('INVALID_START');
  if (end && Number.isNaN(Date.parse(end))) throw new Error('INVALID_END');
  return { start, end, days: normalizeDayStarts(u.searchParams.get('dayStarts'), start || new Date().toISOString(), end || new Date(Date.now()+86400000).toISOString()) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const emp = await requireEmployee(req, res); if (!emp) return;
    let range; try { range = parseRange(req); } catch (e) { return json(res, 400, { error: e.message === 'INVALID_START' ? 'Invalid start date.' : 'Invalid end date.' }); }
    const { start, end, days } = range;
    const shifts = await sql`
      SELECT s.id,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,
             s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.manager_review_status,s.manager_review_note,s.manager_reviewed_at,
             (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours,
             (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
      FROM shifts s
      WHERE s.employee_id=${emp.id}
        AND (${start}::timestamptz IS NULL OR s.clock_in<${end}::timestamptz)
        AND (${end}::timestamptz IS NULL OR s.clock_out IS NULL OR s.clock_out>${start}::timestamptz)
      ORDER BY s.clock_in`;
    const paidMinimum = await settingNumber('project_completed_min_paid_hours', 8);
    const open = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    const daily = Array(Math.max(1, days.length - 1)).fill(0);
    let totalPaid = 0;
    for (const sh of shifts) {
      const alloc = allocatePaidHours(sh, days, paidMinimum);
      alloc.forEach((v,i)=>{ if (i<daily.length) { daily[i]+=v; totalPaid += v; } });
    }
    const recentRuleAlert = await sql`
      SELECT r.id,r.created_at,r.distance_miles,r.reason,r.note
      FROM rejected_clock_outs r JOIN shifts s ON s.id=r.shift_id
      WHERE s.employee_id=${emp.id} AND r.created_at < CURRENT_DATE AND r.created_at >= now()-interval '30 days'
      ORDER BY r.created_at DESC LIMIT 1`;
    return json(res, 200, {
      authorized:true,
      employee:{id:emp.id,name:emp.name,title:emp.title,hourly_wage:emp.hourly_wage},
      shifts,
      openShift:open[0]||null,
      summary:{days:daily,total_paid_hours:totalPaid,total_earnings:totalPaid*Number(emp.hourly_wage||0)},
      settings:{project_completed_min_paid_hours:paidMinimum},
      ruleAlert: recentRuleAlert[0] ? { id: recentRuleAlert[0].id, message: 'Notice: a previous clock-out attempt did not follow the location rule. Your manager has been notified.' } : null
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
