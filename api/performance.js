import { sql, sqlBatch, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso, settingNumber } from './_db.js';
import { effectiveShiftPay } from './_time.js';

/* Employee performance, 100% from four rules (per month; a year is the
   average of the months worked):
   1. Manager evaluation: entered by the manager, 0-30%.
   2. On-time clock-in: first clock-in of the day between 7:55 and 8:10 am
      (company time zone). Share of days on time x 20%.
   3. Weekly hours: a week with 38.5 or more paid hours meets the target.
      Share of weeks worked that meet it x 20%. Weeks belong to the month
      their Monday falls in.
   4. Customer touch-ups / complaints: entered by the manager.
      0-1 = 30%, 2 = 10%, 3 or more = 0%.
   85% and above is "perfect". */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS performance_inputs (
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     month TEXT NOT NULL,
     evaluation REAL,
     touchups INTEGER,
     note TEXT,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (employee_id, month))`
];
let ready = false;
async function ensure() { if (ready) return; await sqlBatch(SCHEMA.map(s => [s])); ready = true; }

export const RULES = { evaluationMax: 30, onTimeMax: 20, hoursMax: 20, touchupMax: 30, onTimeFrom: '07:55', onTimeTo: '08:10', weeklyHours: 38.5, perfect: 85 };
const touchupPoints = n => n == null ? null : n <= 1 ? 30 : n === 2 ? 10 : 0;

async function timeZone() {
  const r = (await sql`SELECT value FROM app_settings WHERE key='company_timezone'`)[0];
  return r?.value || 'America/New_York';
}
function parts(iso, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
function mondayOf(dateStr) { const d = new Date(dateStr + 'T00:00:00Z'); const back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); }
const pad = n => String(n).padStart(2, '0');

/* Scores for every employee (or one) for one month 'YYYY-MM'. */
async function monthScores(month, onlyId) {
  await ensure();
  const tz = await timeZone(), minimum = await settingNumber('project_completed_min_paid_hours', 8);
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 2 * 86400000).toISOString(), to = new Date(Date.UTC(y, m, 1) + 9 * 86400000).toISOString();
  const emps = onlyId ? await sql`SELECT id,name,title,employment_status FROM employees WHERE id=${onlyId}`
    : await sql`SELECT id,name,title,employment_status FROM employees ORDER BY CASE employment_status WHEN 'active' THEN 0 WHEN 'vacation' THEN 1 ELSE 2 END, name`;
  const shifts = await sql`SELECT s.id,s.employee_id,s.clock_in,s.clock_out,s.clock_out_note,s.manager_review_status,s.manager_custom_paid_hours,
      (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours
    FROM shifts s WHERE s.clock_in>=${from} AND s.clock_in<${to} ORDER BY s.clock_in`;
  const inputs = await sql`SELECT employee_id,evaluation,touchups,note,updated_at FROM performance_inputs WHERE month=${month}`;
  const inBy = new Map(inputs.map(i => [String(i.employee_id), i]));
  const [fromMin, toMin] = [RULES.onTimeFrom, RULES.onTimeTo].map(t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; });
  const out = [];
  for (const e of emps) {
    const mine = shifts.filter(s => String(s.employee_id) === String(e.id));
    const firstByDay = new Map(), weekHours = new Map();
    for (const s of mine) {
      const p = parts(s.clock_in, tz);
      if (p.date.slice(0, 7) === month && !firstByDay.has(p.date)) firstByDay.set(p.date, p.minutes);
      if (s.clock_out) { const wk = mondayOf(p.date); weekHours.set(wk, (weekHours.get(wk) || 0) + effectiveShiftPay(s, minimum)); }
    }
    const days = [...firstByDay.values()], onTime = days.filter(v => v >= fromMin && v <= toMin).length;
    const weeks = [...weekHours.entries()].filter(([wk, h]) => wk.slice(0, 7) === month && h >= 0.01);
    const weeksMet = weeks.filter(([, h]) => h >= RULES.weeklyHours).length;
    const inp = inBy.get(String(e.id)) || {};
    const evaluation = inp.evaluation == null ? null : Number(inp.evaluation);
    const touchups = inp.touchups == null ? null : Number(inp.touchups);
    const onTimePts = days.length ? onTime / days.length * RULES.onTimeMax : null;
    const hoursPts = weeks.length ? weeksMet / weeks.length * RULES.hoursMax : null;
    const touchPts = touchupPoints(touchups);
    const worked = days.length > 0 || weeks.length > 0;
    const total = (evaluation || 0) + (onTimePts || 0) + (hoursPts || 0) + (touchPts || 0);
    const r1 = v => v == null ? null : Math.round(v * 10) / 10;
    out.push({ employee_id: String(e.id), name: e.name, title: e.title, employment_status: e.employment_status, month, worked,
      evaluation, touchups, note: inp.note || '', days_worked: days.length, days_on_time: onTime, weeks_worked: weeks.length, weeks_met: weeksMet,
      week_hours: weeks.map(([wk, h]) => ({ week: wk, hours: Math.round(h * 100) / 100 })),
      points: { evaluation: r1(evaluation), on_time: r1(onTimePts), hours: r1(hoursPts), touchups: touchPts },
      missing: [evaluation == null && 'evaluation', touchups == null && 'touchups'].filter(Boolean),
      total: r1(total) });
  }
  return { tz, rules: RULES, employees: out };
}

async function yearScores(year, onlyId) {
  const now = new Date(), lastMonth = year < now.getUTCFullYear() ? 12 : year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 0;
  const months = [];
  for (let m = 1; m <= lastMonth; m++) months.push(`${year}-${pad(m)}`);
  const per = {};
  let tz = null;
  for (const mo of months) {
    const r = await monthScores(mo, onlyId); tz = r.tz;
    for (const e of r.employees) { (per[e.employee_id] ||= { employee_id: e.employee_id, name: e.name, title: e.title, employment_status: e.employment_status, months: {} }).months[mo] = e.worked ? e.total : null; }
  }
  const rows = Object.values(per).map(p => { const vals = Object.values(p.months).filter(v => v != null); return { ...p, average: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null, months_worked: vals.length }; });
  return { tz, rules: RULES, months, employees: rows };
}

const okMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));

export default async function handler(req, res) {
  try {
    await ensure();
    const u = new URL(req.url, 'https://workclock.invalid'), b = req.body || {};
    const month = u.searchParams.get('month'), year = Number(u.searchParams.get('year'));
    if (u.searchParams.get('mine') === '1') {
      const emp = await getEmployeeSession(req); if (!emp) return json(res, 401, { error: 'Employee login required.' });
      if (okMonth(month)) { const r = await monthScores(month, emp.id); return json(res, 200, { ...r, me: r.employees[0] || null, employees: undefined }); }
      if (year >= 2000 && year <= 2100) { const r = await yearScores(year, emp.id); return json(res, 200, { ...r, me: r.employees[0] || null, employees: undefined }); }
      return json(res, 400, { error: 'Choose a month or a year.' });
    }
    const manager = await getManager(req); if (!manager) return json(res, 401, { error: 'Manager login required.' });
    if (req.method === 'GET') {
      if (okMonth(month)) return json(res, 200, await monthScores(month));
      if (year >= 2000 && year <= 2100) return json(res, 200, await yearScores(year));
      return json(res, 400, { error: 'Choose a month or a year.' });
    }
    if (req.method === 'PATCH') {
      if (!requireSameOrigin(req, res)) return;
      if (b.timezone !== undefined) {
        const tz = String(b.timezone);
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return json(res, 400, { error: 'Unknown time zone.' }); }
        await sql`INSERT INTO app_settings(key,value,updated_at) VALUES('company_timezone',${tz},${nowIso()}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`;
        await audit('manager', manager.id, 'company_timezone_set', { tz });
        return json(res, 200, { ok: true });
      }
      const id = Number(b.employeeId); if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Choose an employee.' });
      if (!okMonth(b.month)) return json(res, 400, { error: 'Choose a month.' });
      let evaluation = b.evaluation === '' || b.evaluation == null ? null : Number(b.evaluation);
      if (evaluation != null && (!Number.isFinite(evaluation) || evaluation < 0 || evaluation > 30)) return json(res, 400, { error: 'Manager evaluation must be from 0 to 30.' });
      let touchups = b.touchups === '' || b.touchups == null ? null : Number(b.touchups);
      if (touchups != null && (!Number.isInteger(touchups) || touchups < 0 || touchups > 100)) return json(res, 400, { error: 'Touch-ups must be a whole number, 0 or more.' });
      const note = String(b.note || '').trim().slice(0, 300) || null;
      await sql`INSERT INTO performance_inputs(employee_id,month,evaluation,touchups,note,updated_at) VALUES(${id},${b.month},${evaluation},${touchups},${note},${nowIso()})
        ON CONFLICT(employee_id,month) DO UPDATE SET evaluation=excluded.evaluation,touchups=excluded.touchups,note=excluded.note,updated_at=excluded.updated_at`;
      await audit('manager', manager.id, 'performance_input', { employee_id: id, month: b.month, evaluation, touchups });
      const r = await monthScores(b.month, id);
      return json(res, 200, { ok: true, employee: r.employees[0] });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}
