import { sql, sqlBatch, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso, settingNumber } from './_db.js';
import { effectiveShiftPay } from './_time.js';
import { rateBook, rateOn } from './_wages.js';

/* Performance and rewards, following "FreshCoat Performance Tab - Developer
   specification" (the owner's PDF). Scores run 0-100:

   Rule 1  Manager rating      30  manual, one score 0-30 per painter per WEEK (+ comment)
   Rule 2  Punctuality         15  automatic, Monday-Friday. First clock-in 7:55-8:05 am
                                   (or earlier: the owner chose early = on time) = full day;
                                   later = half. Week = 15 x average daily credit.
                                   Approved day exceptions get full credit. Weekends excluded.
   Rule 3  Weekly hours        15  automatic, Monday-Sunday paid hours, table below.
                                   An approved exception gives full credit.
   Rule 4  Absence w/o notice  20  manual, monthly code: 0 = 20, 1 = 0 (+ incident log)
   Rule 5  Complaints/touch-ups 20 manual, monthly code: 0 = 20, 1 = 5, 2 = 0 (+ incident log)

   Weekly subtotal = Rules 1-3 (max 60). Monthly score = average weekly
   subtotal + Rule 4 + Rule 5. A week belongs to the month of its Thursday
   (so a week split by a month end goes where most of its weekdays are).
   Weeks with no work are left out; a month with no work is not scored.
   Missing manual inputs are "pending", never zero; the month is final only
   when everything is entered, and the manager then finalizes it.

   Bonus hours = 1.5 x score / 100 (max 18 a year); bonus pay = bonus hours x
   the painter's hourly rate. Vacation from the week of 2026-11-30:
   0.77 x min(hours/40, 1) x weekly performance / 100, weekly performance =
   that week's subtotal + the month's Rule 4 + Rule 5; at most 40 h a year. */

export const RULES = {
  ratingMax: 30, punctMax: 15, hoursMax: 15, absenceMax: 20, qualityMax: 20,
  windowFrom: '07:55', windowTo: '08:05', earlyIsFull: true,
  bonusPerMonth: 1.5, bonusYearMax: 18, vacationWeekly: 0.77, vacationYearMax: 40,
  vacationFrom: '2026-11-30'
};
export const HOURS_TABLE = [ // [above-or-equal, score] checked top-down (hours rounded to 0.01)
  [45.01, 0], [43.01, 10], [41.01, 14], [39, 15], [38, 14], [36, 10], [34, 8], [32, 6], [30, 4], [25, 2], [0, 0]
];
export const hoursScore = h => { const x = Math.round(h * 100) / 100; for (const [min, s] of HOURS_TABLE) if (x >= min) return s; return 0; };
export const absencePoints = c => c == null ? null : Number(c) === 0 ? 20 : 0;
export const qualityPoints = c => c == null ? null : Number(c) === 0 ? 20 : Number(c) === 1 ? 5 : 0;
export const classify = s => s == null ? null : s >= 90 ? 'Excellent' : s >= 80 ? 'Very good' : s >= 70 ? 'Good' : s >= 60 ? 'Needs improvement' : 'Poor performance';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS performance_inputs (
     employee_id INTEGER NOT NULL REFERENCES employees(id), month TEXT NOT NULL,
     evaluation REAL, absences INTEGER, touchups INTEGER, note TEXT, updated_at TEXT NOT NULL,
     PRIMARY KEY (employee_id, month))`,
  `CREATE TABLE IF NOT EXISTS performance_weekly (
     employee_id INTEGER NOT NULL REFERENCES employees(id), week_start TEXT NOT NULL,
     rating REAL, comment TEXT, hours_exception TEXT,
     updated_at TEXT NOT NULL, updated_by INTEGER,
     PRIMARY KEY (employee_id, week_start))`,
  `CREATE TABLE IF NOT EXISTS performance_day_exceptions (
     employee_id INTEGER NOT NULL REFERENCES employees(id), day TEXT NOT NULL, reason TEXT NOT NULL,
     created_at TEXT NOT NULL, created_by INTEGER, PRIMARY KEY (employee_id, day))`,
  `CREATE TABLE IF NOT EXISTS performance_incidents (
     id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id),
     date TEXT NOT NULL, kind TEXT NOT NULL, project TEXT, reason TEXT, excused INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL, created_by INTEGER)`,
  `CREATE INDEX IF NOT EXISTS performance_incidents_emp ON performance_incidents(employee_id, date)`,
  `CREATE TABLE IF NOT EXISTS vacation_accrual (
     employee_id INTEGER NOT NULL REFERENCES employees(id), week_start TEXT NOT NULL,
     hours REAL NOT NULL, score REAL, finalized_at TEXT NOT NULL,
     PRIMARY KEY (employee_id, week_start))`
];
let ready = false;
export async function ensurePerformance() {
  if (ready) return;
  await sqlBatch(SCHEMA.map(s => [s]));
  const cols = (await sql`SELECT name FROM pragma_table_info('performance_inputs')`).map(c => c.name);
  for (const [c, d] of [['absences', 'INTEGER'], ['absence_code', 'INTEGER'], ['quality_code', 'INTEGER'], ['finalized_at', 'TEXT'], ['finalized_by', 'INTEGER'], ['final_score', 'REAL']])
    if (!cols.includes(c)) await sql([`ALTER TABLE performance_inputs ADD COLUMN ${c} ${d}`]);
  ready = true;
}

async function timeZone() {
  const r = (await sql`SELECT value FROM app_settings WHERE key='company_timezone'`)[0];
  return r?.value || 'America/New_York';
}
function parts(iso, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const pad = n => String(n).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = d => { const x = new Date(d + 'T00:00:00Z'); return addDays(d, -((x.getUTCDay() + 6) % 7)); };
export const weekMonth = monday => addDays(monday, 3).slice(0, 7); // the month of the week's Thursday
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const r2 = v => v == null ? null : Math.round(v * 100) / 100;
const hm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/* Mondays of the weeks that belong to a month. */
function weeksOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  let d = mondayOf(`${y}-${pad(m)}-01`); const out = [];
  for (let i = 0; i < 7; i++, d = addDays(d, 7)) if (weekMonth(d) === month) out.push(d);
  return out;
}

/* Scores for one month 'YYYY-MM' for every painter, or one. */
export async function monthScores(month, onlyId) {
  await ensurePerformance();
  const tz = await timeZone(), minimum = await settingNumber('project_completed_min_paid_hours', 8);
  const weeks = weeksOfMonth(month);
  const first = weeks[0], last = addDays(weeks[weeks.length - 1], 7);
  const from = new Date(Date.parse(first + 'T00:00:00Z') - 86400000).toISOString(), to = new Date(Date.parse(last + 'T00:00:00Z') + 86400000).toISOString();
  const emps = onlyId ? await sql`SELECT id,name,title,employment_status,hourly_wage FROM employees WHERE id=${onlyId}`
    : await sql`SELECT id,name,title,employment_status,hourly_wage FROM employees ORDER BY CASE employment_status WHEN 'active' THEN 0 WHEN 'vacation' THEN 1 ELSE 2 END, name`;
  const shifts = await sql`SELECT s.id,s.employee_id,s.clock_in,s.clock_out,s.clock_out_note,s.manager_review_status,s.manager_custom_paid_hours,
      (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours
    FROM shifts s WHERE s.clock_in>=${from} AND s.clock_in<${to} ORDER BY s.clock_in`;
  const inputs = await sql`SELECT * FROM performance_inputs WHERE month=${month}`;
  const weekly = await sql`SELECT * FROM performance_weekly WHERE week_start>=${first} AND week_start<${last}`;
  const dayEx = await sql`SELECT * FROM performance_day_exceptions WHERE day>=${first} AND day<${last}`;
  const sixFrom = `${addMonths(month, -5)}-01`, monthEnd = `${addMonths(month, 1)}-01`;
  const incidents = await sql`SELECT * FROM performance_incidents WHERE date>=${sixFrom} AND date<${monthEnd} ORDER BY date`;
  const accrued = await sql`SELECT employee_id,week_start,hours,finalized_at FROM vacation_accrual WHERE week_start>=${first} AND week_start<${last}`;
  const book = await rateBook();
  const inBy = new Map(inputs.map(i => [String(i.employee_id), i]));
  const wkBy = new Map(weekly.map(w => [`${w.employee_id}|${w.week_start}`, w]));
  const exBy = new Map(dayEx.map(x => [`${x.employee_id}|${x.day}`, x]));
  const accBy = new Map(accrued.map(a => [`${a.employee_id}|${a.week_start}`, a]));
  const winFrom = toMin(RULES.windowFrom), winTo = toMin(RULES.windowTo);
  const out = [];

  for (const e of emps) {
    const mine = shifts.filter(s => String(s.employee_id) === String(e.id));
    const firstIn = new Map(), hoursByWeek = new Map();
    for (const s of mine) {
      const p = parts(s.clock_in, tz);
      if (!firstIn.has(p.date) || p.minutes < firstIn.get(p.date)) firstIn.set(p.date, p.minutes);
      if (s.clock_out) { const wk = mondayOf(p.date); hoursByWeek.set(wk, (hoursByWeek.get(wk) || 0) + effectiveShiftPay(s, minimum)); }
    }
    const inp = inBy.get(String(e.id)) || {};
    // Older months were entered as one monthly evaluation / counts: used when nothing newer exists.
    const legacyRating = inp.evaluation == null ? null : Number(inp.evaluation);
    const absenceCode = inp.absence_code != null ? Number(inp.absence_code) : inp.absences != null ? (Number(inp.absences) > 0 ? 1 : 0) : null;
    const qualityCode = inp.quality_code != null ? Number(inp.quality_code) : inp.touchups != null ? Math.min(2, Number(inp.touchups)) : null;
    const absPts = absencePoints(absenceCode), qualPts = qualityPoints(qualityCode);

    const weekRows = [];
    for (const wk of weeks) {
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = addDays(wk, i);
        if (!firstIn.has(d)) continue;
        const mins = firstIn.get(d), ex = exBy.get(`${e.id}|${d}`);
        const inWindow = mins >= winFrom && mins <= winTo, early = mins < winFrom;
        const credit = ex ? 1 : (inWindow || (early && RULES.earlyIsFull)) ? 1 : 0.5;
        days.push({ date: d, first_in: hm(mins), credit, exception: ex ? ex.reason : null, late: mins > winTo });
      }
      const hours = r2(hoursByWeek.get(wk) || 0);
      const worked = days.length > 0 || hours > 0;
      if (!worked) continue;
      const w = wkBy.get(`${e.id}|${wk}`) || {};
      const rating = w.rating != null ? Number(w.rating) : legacyRating;
      const punct = days.length ? RULES.punctMax * days.reduce((a, x) => a + x.credit, 0) / days.length : null;
      const hrsPts = w.hours_exception ? RULES.hoursMax : hoursScore(hours);
      const pieces = [[rating, RULES.ratingMax], [punct, RULES.punctMax], [hrsPts, RULES.hoursMax]].filter(([v]) => v != null);
      const earned = pieces.reduce((a, [v]) => a + v, 0), possible = pieces.reduce((a, [, m]) => a + m, 0);
      // Out of 60. A week with no weekday clock-in has no punctuality part: the rest is scaled.
      const sub60 = possible ? earned / possible * 60 : null;
      weekRows.push({ week_start: wk, week_end: addDays(wk, 6), days, punct: r2(punct), hours, hours_points: hrsPts, hours_exception: w.hours_exception || null,
        rating, rating_from_month: w.rating == null && legacyRating != null, comment: w.comment || '', subtotal: rating == null ? null : r2(sub60), provisional: r2(sub60), pending: rating == null });
    }
    const worked = weekRows.length > 0;
    const rated = weekRows.filter(w => !w.pending);
    const weeklyAvg = weekRows.length ? weekRows.reduce((a, w) => a + w.provisional, 0) / weekRows.length : null;
    const missing = [];
    if (weekRows.some(w => w.pending)) missing.push('rating');
    if (absenceCode == null) missing.push('absence');
    if (qualityCode == null) missing.push('quality');
    const parts3 = [[weeklyAvg, 60], [absPts, RULES.absenceMax], [qualPts, RULES.qualityMax]].filter(([v]) => v != null);
    const earned = parts3.reduce((a, [v]) => a + v, 0), possible = parts3.reduce((a, [, m]) => a + m, 0);
    const complete = worked && !missing.length;
    const total = !worked ? null : complete ? weeklyAvg + absPts + qualPts : possible ? earned / possible * 100 : null;
    const monthEndDay = addDays(`${addMonths(month, 1)}-01`, -1);
    const rate = rateOn(book, e.id, monthEndDay, e.hourly_wage);
    const bonusHours = total == null ? null : RULES.bonusPerMonth * total / 100;

    // Vacation per week (from the start date of the PDF formula).
    const weekPerf = w => {
      const p = [[w.provisional, 60], [absPts, 20], [qualPts, 20]].filter(([v]) => v != null);
      const ea = p.reduce((a, [v]) => a + v, 0), po = p.reduce((a, [, m]) => a + m, 0);
      return po ? (w.pending || absPts == null || qualPts == null ? ea / po * 100 : ea) : 0;
    };
    let vacMonth = 0, vacFinal = true;
    for (const w of weekRows) {
      if (w.week_start < RULES.vacationFrom) { w.vacation = null; continue; }
      const acc = accBy.get(`${e.id}|${w.week_start}`);
      const perf = weekPerf(w);
      const hrs = acc ? Number(acc.hours) : RULES.vacationWeekly * Math.min(w.hours / 40, 1) * perf / 100;
      w.week_score = r2(perf); w.vacation = { hours: Math.round(hrs * 1000) / 1000, final: !!acc };
      vacMonth += hrs; if (!acc) vacFinal = false;
    }
    const inc = incidents.filter(x => String(x.employee_id) === String(e.id));
    const inMonth = inc.filter(x => x.date.slice(0, 7) === month);
    const counted = list => list.filter(x => !Number(x.excused));
    const absMonth = counted(inMonth.filter(x => x.kind === 'absence')).length;
    const absSix = counted(inc.filter(x => x.kind === 'absence')).length;
    const complaints = counted(inMonth.filter(x => x.kind === 'complaint')).length, touchups = counted(inMonth.filter(x => x.kind === 'touchup')).length;
    const alerts = [];
    if (absMonth >= 2) alerts.push({ level: 'high', text: `${absMonth} absences without notice this month: termination review.` });
    if (absSix >= 4) alerts.push({ level: 'high', text: `${absSix} absences without notice in 6 months: termination review.` });
    else if (absSix === 3) alerts.push({ level: 'mid', text: '3 absences without notice in 6 months: final warning.' });
    if (complaints > 1 || touchups > 1) alerts.push({ level: 'mid', text: `${complaints} complaints and ${touchups} touch-ups this month: limit exceeded, review and warning.` });
    if (absenceCode === 0 && absMonth > 0) alerts.push({ level: 'low', text: 'Absence code is 0 but an absence is recorded this month. Check the code.' });
    if (qualityCode != null && qualityCode < Math.min(2, (complaints > 0) + (touchups > 0))) alerts.push({ level: 'low', text: 'Quality code is lower than the incidents recorded this month. Check the code.' });

    out.push({
      employee_id: String(e.id), name: e.name, title: e.title, employment_status: e.employment_status, month, rate: r2(rate), worked,
      weeks: weekRows, weekly_avg: r2(weeklyAvg), weeks_rated: rated.length,
      absence_code: absenceCode, quality_code: qualityCode, points: { absence: absPts, quality: qualPts },
      incidents: inMonth.map(x => ({ id: x.id, date: x.date, kind: x.kind, project: x.project || '', reason: x.reason || '', excused: !!Number(x.excused) })),
      counts: { absences: absMonth, absences_6mo: absSix, complaints, touchups },
      suggested: { absence: absMonth > 0 ? 1 : null, quality: (complaints > 0) + (touchups > 0) || null },
      alerts, missing, final: complete, finalized_at: inp.finalized_at || null,
      total: r2(total), earned: r2(earned), possible, classification: classify(total),
      bonus_hours: bonusHours == null ? null : Math.round(bonusHours * 1000) / 1000, bonus_pay: bonusHours == null ? null : r2(bonusHours * rate),
      vacation_hours: Math.round(vacMonth * 1000) / 1000, vacation_final: vacFinal, note: inp.note || ''
    });
  }
  return { tz, month, rules: RULES, hours_table: HOURS_TABLE, employees: out };
}

function addMonths(month, n) { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }

export async function yearScores(year, onlyId) {
  const now = new Date(), lastMonth = year < now.getUTCFullYear() ? 12 : year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 0;
  const months = []; for (let m = 1; m <= lastMonth; m++) months.push(`${year}-${pad(m)}`);
  const per = {}; let tz = null;
  for (const mo of months) {
    const r = await monthScores(mo, onlyId); tz = r.tz;
    for (const e of r.employees) {
      const p = (per[e.employee_id] ||= { employee_id: e.employee_id, name: e.name, title: e.title, employment_status: e.employment_status, rate: e.rate, months: {}, notFinal: [], bonus_hours: 0, bonus_pay: 0, vacation_hours: 0 });
      p.months[mo] = e.worked && e.total != null ? e.total : null;
      if (e.worked && !e.finalized_at) p.notFinal.push(mo);
      if (e.worked && e.bonus_hours != null) { p.bonus_hours += e.bonus_hours; p.bonus_pay += e.bonus_pay; }
      p.vacation_hours += e.vacation_hours || 0;
    }
  }
  const rows = Object.values(per).map(p => {
    const vals = Object.values(p.months).filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...p, average: r2(avg), classification: classify(avg), months_worked: vals.length, final: !p.notFinal.length,
      bonus_hours: Math.round(Math.min(RULES.bonusYearMax, p.bonus_hours) * 1000) / 1000, bonus_pay: r2(p.bonus_hours > RULES.bonusYearMax ? p.bonus_pay * RULES.bonusYearMax / p.bonus_hours : p.bonus_pay),
      vacation_hours: Math.round(Math.min(RULES.vacationYearMax, p.vacation_hours) * 1000) / 1000 };
  });
  // Rankings by yearly average (painters with no scored month are left out).
  rows.filter(r => r.average != null).sort((a, b) => b.average - a.average).forEach((r, i) => { r.rank = i + 1; });
  return { tz, rules: RULES, months, employees: rows };
}

/* Vacation earned under the PDF formula, per employee: { final, provisional, byWeek: [[week_start, hours]] }
   Used by the Vacations tab. Each calendar year is capped at 40 hours. */
export async function pdfVacation(onlyId) {
  await ensurePerformance();
  const now = new Date(), cur = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const out = new Map();
  const add = (id, wk, h, final) => {
    const k = String(id); if (!out.has(k)) out.set(k, { final: 0, provisional: 0, byWeek: [], perYear: {} });
    const o = out.get(k), y = weekMonth(wk).slice(0, 4), room = Math.max(0, RULES.vacationYearMax - (o.perYear[y] || 0)), use = Math.min(h, room);
    o.perYear[y] = (o.perYear[y] || 0) + use; o.byWeek.push([wk, use]); if (final) o.final += use; else o.provisional += use;
  };
  const fromMonth = weekMonth(RULES.vacationFrom);
  for (let mo = fromMonth; mo <= cur; mo = addMonths(mo, 1)) {
    const r = await monthScores(mo, onlyId);
    for (const e of r.employees) for (const w of e.weeks) if (w.vacation) add(e.employee_id, w.week_start, w.vacation.hours, w.vacation.final);
  }
  // Finalized weeks whose shifts were later removed by the nightly cleanup are still counted.
  const acc = onlyId ? await sql`SELECT employee_id,week_start,hours FROM vacation_accrual WHERE employee_id=${onlyId}` : await sql`SELECT employee_id,week_start,hours FROM vacation_accrual`;
  for (const a of acc) { const o = out.get(String(a.employee_id)); if (!o || !o.byWeek.some(([wk]) => wk === a.week_start)) add(a.employee_id, a.week_start, Number(a.hours), true); }
  return out;
}

const okMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
const okDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v));
async function isFinalized(id, month) { const r = (await sql`SELECT finalized_at FROM performance_inputs WHERE employee_id=${id} AND month=${month}`)[0]; return !!r?.finalized_at; }
const lockedMsg = 'This month is finalized. Reopen it first to change anything.';

export default async function handler(req, res) {
  try {
    await ensurePerformance();
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
    if (req.method !== 'PATCH' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const now = nowIso();
    if (b.timezone !== undefined) {
      const tz = String(b.timezone);
      try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return json(res, 400, { error: 'Unknown time zone.' }); }
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES('company_timezone',${tz},${now}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`;
      await audit('manager', manager.id, 'company_timezone_set', { tz });
      return json(res, 200, { ok: true });
    }
    const id = Number(b.employeeId); if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Choose a painter.' });
    const reply = async mo => json(res, 200, { ok: true, employee: (await monthScores(mo, id)).employees[0] });

    if (b.action === 'week') { // Rule 1: weekly rating + comment
      if (!okDay(b.week) || mondayOf(b.week) !== b.week) return json(res, 400, { error: 'Choose a week.' });
      const mo = weekMonth(b.week); if (await isFinalized(id, mo)) return json(res, 400, { error: lockedMsg });
      const rating = b.rating === '' || b.rating == null ? null : Number(b.rating);
      if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 30)) return json(res, 400, { error: 'The manager rating must be from 0 to 30.' });
      const comment = String(b.comment ?? '').trim().slice(0, 500) || null;
      await sql`INSERT INTO performance_weekly(employee_id,week_start,rating,comment,updated_at,updated_by) VALUES(${id},${b.week},${rating},${comment},${now},${manager.id})
        ON CONFLICT(employee_id,week_start) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,updated_at=excluded.updated_at,updated_by=excluded.updated_by`;
      await audit('manager', manager.id, 'performance_rating', { employee_id: id, week: b.week, rating, comment });
      return reply(mo);
    }
    if (b.action === 'hours_exception') { // Rule 3 exception
      if (!okDay(b.week) || mondayOf(b.week) !== b.week) return json(res, 400, { error: 'Choose a week.' });
      const mo = weekMonth(b.week); if (await isFinalized(id, mo)) return json(res, 400, { error: lockedMsg });
      const reason = b.reason == null ? null : String(b.reason).trim().slice(0, 200);
      if (b.reason != null && !reason) return json(res, 400, { error: 'Write the reason for the exception.' });
      await sql`INSERT INTO performance_weekly(employee_id,week_start,hours_exception,updated_at,updated_by) VALUES(${id},${b.week},${reason},${now},${manager.id})
        ON CONFLICT(employee_id,week_start) DO UPDATE SET hours_exception=excluded.hours_exception,updated_at=excluded.updated_at,updated_by=excluded.updated_by`;
      await audit('manager', manager.id, reason ? 'performance_hours_exception' : 'performance_hours_exception_removed', { employee_id: id, week: b.week, reason });
      return reply(mo);
    }
    if (b.action === 'day_exception') { // Rule 2 exception
      if (!okDay(b.day)) return json(res, 400, { error: 'Choose a day.' });
      const mo = weekMonth(mondayOf(b.day)); if (await isFinalized(id, mo)) return json(res, 400, { error: lockedMsg });
      const reason = b.reason == null ? null : String(b.reason).trim().slice(0, 200);
      if (b.reason != null && !reason) return json(res, 400, { error: 'Write the reason for the exception.' });
      if (reason) await sql`INSERT INTO performance_day_exceptions(employee_id,day,reason,created_at,created_by) VALUES(${id},${b.day},${reason},${now},${manager.id}) ON CONFLICT(employee_id,day) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,created_by=excluded.created_by`;
      else await sql`DELETE FROM performance_day_exceptions WHERE employee_id=${id} AND day=${b.day}`;
      await audit('manager', manager.id, reason ? 'performance_day_exception' : 'performance_day_exception_removed', { employee_id: id, day: b.day, reason });
      return reply(mo);
    }
    if (b.action === 'codes') { // Rules 4 and 5
      if (!okMonth(b.month)) return json(res, 400, { error: 'Choose a month.' });
      if (await isFinalized(id, b.month)) return json(res, 400, { error: lockedMsg });
      const ab = b.absence_code === '' || b.absence_code == null ? null : Number(b.absence_code);
      const qu = b.quality_code === '' || b.quality_code == null ? null : Number(b.quality_code);
      if (ab != null && ![0, 1].includes(ab)) return json(res, 400, { error: 'Absence code must be 0 or 1.' });
      if (qu != null && ![0, 1, 2].includes(qu)) return json(res, 400, { error: 'Quality code must be 0, 1 or 2.' });
      await sql`INSERT INTO performance_inputs(employee_id,month,absence_code,quality_code,updated_at) VALUES(${id},${b.month},${ab},${qu},${now})
        ON CONFLICT(employee_id,month) DO UPDATE SET absence_code=excluded.absence_code,quality_code=excluded.quality_code,absences=NULL,touchups=NULL,updated_at=excluded.updated_at`;
      await audit('manager', manager.id, 'performance_codes', { employee_id: id, month: b.month, absence_code: ab, quality_code: qu });
      return reply(b.month);
    }
    if (b.action === 'incident_add') {
      if (!okDay(b.date)) return json(res, 400, { error: 'Choose the date.' });
      if (!['absence', 'complaint', 'touchup'].includes(b.kind)) return json(res, 400, { error: 'Choose absence, complaint or touch-up.' });
      const mo = b.date.slice(0, 7); if (await isFinalized(id, mo)) return json(res, 400, { error: lockedMsg });
      const reason = String(b.reason || '').trim().slice(0, 500), project = String(b.project || '').trim().slice(0, 120) || null;
      if (!reason) return json(res, 400, { error: 'Write what happened.' });
      await sql`INSERT INTO performance_incidents(employee_id,date,kind,project,reason,excused,created_at,created_by) VALUES(${id},${b.date},${b.kind},${project},${reason},${b.excused ? 1 : 0},${now},${manager.id})`;
      await audit('manager', manager.id, 'performance_incident', { employee_id: id, date: b.date, kind: b.kind, excused: !!b.excused, reason });
      return reply(mo);
    }
    if (b.action === 'incident_delete') {
      const x = (await sql`SELECT * FROM performance_incidents WHERE id=${Number(b.id)} AND employee_id=${id}`)[0];
      if (!x) return json(res, 404, { error: 'Not found.' });
      const mo = x.date.slice(0, 7); if (await isFinalized(id, mo)) return json(res, 400, { error: lockedMsg });
      await sql`DELETE FROM performance_incidents WHERE id=${x.id}`;
      await audit('manager', manager.id, 'performance_incident_deleted', { employee_id: id, incident: x });
      return reply(mo);
    }
    if (b.action === 'finalize' || b.action === 'reopen') {
      if (!okMonth(b.month)) return json(res, 400, { error: 'Choose a month.' });
      const e = (await monthScores(b.month, id)).employees[0];
      if (!e || !e.worked) return json(res, 400, { error: 'No work this month: nothing to finalize.' });
      if (b.action === 'finalize') {
        if (!e.final) return json(res, 400, { error: 'Enter every weekly rating and both monthly codes first.' });
        await sql`INSERT INTO performance_inputs(employee_id,month,updated_at,finalized_at,finalized_by,final_score) VALUES(${id},${b.month},${now},${now},${manager.id},${e.total})
          ON CONFLICT(employee_id,month) DO UPDATE SET finalized_at=excluded.finalized_at,finalized_by=excluded.finalized_by,final_score=excluded.final_score`;
        for (const w of e.weeks) if (w.vacation) await sql`INSERT INTO vacation_accrual(employee_id,week_start,hours,score,finalized_at) VALUES(${id},${w.week_start},${w.vacation.hours},${w.week_score},${now})
          ON CONFLICT(employee_id,week_start) DO UPDATE SET hours=excluded.hours,score=excluded.score,finalized_at=excluded.finalized_at`;
        await audit('manager', manager.id, 'performance_finalized', { employee_id: id, month: b.month, score: e.total, bonus_hours: e.bonus_hours, bonus_pay: e.bonus_pay });
      } else {
        const reason = String(b.reason || '').trim().slice(0, 300);
        if (!reason) return json(res, 400, { error: 'Write why the month is being reopened.' });
        await sql`UPDATE performance_inputs SET finalized_at=NULL,finalized_by=NULL WHERE employee_id=${id} AND month=${b.month}`;
        for (const w of e.weeks) await sql`DELETE FROM vacation_accrual WHERE employee_id=${id} AND week_start=${w.week_start}`;
        await audit('manager', manager.id, 'performance_reopened', { employee_id: id, month: b.month, reason });
      }
      return reply(b.month);
    }
    return json(res, 400, { error: 'Unknown action.' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}
