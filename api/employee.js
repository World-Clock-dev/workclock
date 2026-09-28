import { sql, json, requireEmployee, settingNumber } from './_db.js';
import { allocatePaidHours, normalizeDayStarts } from './_time.js';

function parseRange(req) {
  const u = new URL(req.url, 'https://workclock.invalid');
  const start = u.searchParams.get('start'), end = u.searchParams.get('end');
  if (start && Number.isNaN(Date.parse(start))) throw new Error('INVALID_START');
  if (end && Number.isNaN(Date.parse(end))) throw new Error('INVALID_END');
  return { start, end, days: normalizeDayStarts(u.searchParams.get('dayStarts'), start || new Date().toISOString(), end || new Date(Date.now()+86400000).toISOString()) };
}

/* The employee's own long-range report. Lives here rather than in its own
   api/*.js because Vercel's Hobby plan caps a deployment at 12 Serverless
   Functions and this project uses all 12. Returns raw shifts so the browser can
   bucket them by local day, keeping day boundaries correct in their timezone. */
const MAX_REPORT_DAYS = 430, MAX_REPORT_SHIFTS = 3000;

async function handleReport(req, res, emp, u) {
  const startText = u.searchParams.get('start'), endText = u.searchParams.get('end');
  if (!startText || !endText || Number.isNaN(Date.parse(startText)) || Number.isNaN(Date.parse(endText)))
    return json(res, 400, { error: 'Valid start and end are required.' });
  const start = new Date(startText), end = new Date(endText);
  if (!(end > start)) return json(res, 400, { error: 'The end date must be after the start date.' });
  if ((end - start) > MAX_REPORT_DAYS * 86400000) return json(res, 400, { error: 'That date range is too long. Choose 14 months or less.' });
  const shifts = await sql`
    SELECT s.id,s.clock_in,s.clock_out,s.clock_out_note,s.clock_out_message,
           s.manager_review_status,s.manager_review_note,s.manager_custom_paid_hours,
           s.manager_original_clock_out,s.manager_original_clock_in,
           (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours,
           (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
    FROM shifts s
    WHERE s.employee_id=${emp.id}
      AND s.clock_in<${end.toISOString()}::timestamptz
      AND (s.clock_out IS NULL OR s.clock_out>${start.toISOString()}::timestamptz)
    ORDER BY s.clock_in ASC
    LIMIT ${MAX_REPORT_SHIFTS}`;
  const minimum = await settingNumber('project_completed_min_paid_hours', 8);
  return json(res, 200, {
    employee: { id: emp.id, name: emp.name, title: emp.title, hourly_wage: emp.hourly_wage },
    shifts, truncated: shifts.length >= MAX_REPORT_SHIFTS,
    settings: { project_completed_min_paid_hours: minimum }
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const emp = await requireEmployee(req, res); if (!emp) return;
    const url = new URL(req.url, 'https://workclock.invalid');
    if (url.searchParams.get('view') === 'report') return await handleReport(req, res, emp, url);
    let range; try { range = parseRange(req); } catch (e) { return json(res, 400, { error: e.message === 'INVALID_START' ? 'Invalid start date.' : 'Invalid end date.' }); }
    const { start, end, days } = range;
    const shifts = await sql`
      SELECT s.id,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,
             s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.manager_review_status,s.manager_review_note,s.manager_reviewed_at,
             s.manager_custom_paid_hours,s.manager_original_clock_out,s.manager_original_clock_in,
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
      ruleAlert: recentRuleAlert[0] ? 'Notice: a previous clock-out attempt did not follow the location rule. Your manager has been notified.' : null,
      ruleAlertId: recentRuleAlert[0]?.id || null
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
