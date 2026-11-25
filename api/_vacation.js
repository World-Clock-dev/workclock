import { sql, sqlBatch, settingNumber, nowIso } from './_db.js';
import { effectiveShiftPay } from './_time.js';
import { pdfVacation, RULES as PERF_RULES } from './performance.js';

/* Vacation: 40 hours of vacation for every 2,080 paid hours worked
   (52 weeks x 40 hours), i.e. 0.769 hours per 40-hour week.
   Paid hours are the same ones Shift Details and payroll use.

   The nightly retention job deletes old shifts, so before it does, their paid
   hours are added to vacation_bank (per employee per year). Earned vacation is
   therefore never lost when old shift rows are cleaned up. */

export const VACATION_PER_HOUR = 40 / 2080;
/* From the week of 2026-11-30 vacation follows the owner's performance PDF
   (see performance.js): 0.77 h x min(hours/40, 1) x weekly performance, at
   most 40 h a year. Hours earned before that keep the formula above. */
export const PDF_FROM_TS = Date.parse(PERF_RULES.vacationFrom + 'T05:00:00Z'); // midnight Eastern

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vacation_bank (
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     year INTEGER NOT NULL,
     paid_hours REAL NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (employee_id, year))`,
  `CREATE TABLE IF NOT EXISTS vacation_used (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     hours REAL NOT NULL,
     taken_on TEXT NOT NULL,
     note TEXT,
     created_at TEXT NOT NULL,
     created_by INTEGER)`,
  `CREATE INDEX IF NOT EXISTS vacation_used_employee ON vacation_used(employee_id, taken_on)`
];
let ready = false;
export async function ensureVacationTables() {
  if (ready) return;
  await sqlBatch(SCHEMA.map(s => [s]));
  // kind: 'taken' = vacation used; 'adjust' = manager correction (+ adds hours, − removes hours).
  const cols = (await sql`SELECT name FROM pragma_table_info('vacation_used')`).map(c => c.name);
  if (!cols.includes('kind')) await sql`ALTER TABLE vacation_used ADD COLUMN kind TEXT NOT NULL DEFAULT 'taken'`;
  ready = true;
}

const SHIFT_COLS = `s.id,s.employee_id,s.clock_in,s.clock_out,s.clock_out_note,s.manager_review_status,s.manager_custom_paid_hours,
  (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours`;

/* Called by the retention job right before it deletes closed shifts older
   than the cutoff. */
export async function bankShiftsBefore(cutoffIso) {
  // Always (re)check the tables here: this runs once a night, and if banking
  // fails the cleanup stops before deleting any shift.
  ready = false;
  await ensureVacationTables();
  // Only shifts from before the PDF formula are banked; later weeks are kept in
  // vacation_accrual when the manager finalizes the month.
  const shifts = (await sql([`SELECT ${SHIFT_COLS} FROM shifts s WHERE s.clock_in < `, ` AND s.clock_out IS NOT NULL`], cutoffIso)).filter(sh => Date.parse(sh.clock_in) < PDF_FROM_TS);
  if (!shifts.length) return 0;
  const minimum = await settingNumber('project_completed_min_paid_hours', 8);
  const sums = new Map();
  for (const sh of shifts) {
    const key = `${sh.employee_id}|${new Date(sh.clock_in).getUTCFullYear()}`;
    sums.set(key, (sums.get(key) || 0) + effectiveShiftPay(sh, minimum));
  }
  const now = nowIso();
  await sqlBatch([...sums].map(([key, hours]) => {
    const [emp, year] = key.split('|');
    return ['INSERT INTO vacation_bank(employee_id,year,paid_hours,updated_at) VALUES(?,?,?,?) ON CONFLICT(employee_id,year) DO UPDATE SET paid_hours=paid_hours+excluded.paid_hours,updated_at=excluded.updated_at', Number(emp), Number(year), hours, now];
  }));
  return shifts.length;
}

/* Eligibility: paid vacation can be used after the first full year,
   counted from the job start date in Employee Records. */
export function eligibleFrom(startDate) {
  if (!startDate) return null;
  const d = new Date(startDate + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/* Per employee: paid hours and vacation earned between start and end (ISO),
   plus all-time earned (including hours entered as earned before WorkClock),
   taken, remaining, start date and eligibility. Open shifts count once closed. */
export async function vacationSummary(startIso, endIso) {
  await ensureVacationTables();
  const minimum = await settingNumber('project_completed_min_paid_hours', 8);
  const employees = await sql`SELECT id,name,title,employment_status FROM employees ORDER BY CASE employment_status WHEN 'active' THEN 0 WHEN 'vacation' THEN 1 ELSE 2 END, name`;
  const shifts = await sql([`SELECT ${SHIFT_COLS} FROM shifts s WHERE s.clock_out IS NOT NULL`]);
  const bank = await sql`SELECT employee_id,year,paid_hours FROM vacation_bank`;
  const used = await sql`SELECT employee_id,sum(hours) AS hours FROM vacation_used WHERE kind='taken' GROUP BY employee_id`;
  const adj = await sql`SELECT employee_id,sum(hours) AS hours FROM vacation_used WHERE kind='adjust' GROUP BY employee_id`;
  const usedRange = await sql`SELECT employee_id,sum(hours) AS hours FROM vacation_used WHERE kind='taken' AND taken_on>=${startIso.slice(0, 10)} AND taken_on<${endIso.slice(0, 10)} GROUP BY employee_id`;
  let recs = [];
  try { recs = await sql`SELECT employee_id,start_date,vacation_opening_hours FROM employee_records`; } catch { recs = []; }
  const recBy = new Map(recs.map(r => [String(r.employee_id), r]));
  const s0 = new Date(startIso).getTime(), e0 = new Date(endIso).getTime();
  const row = new Map(employees.map(e => [String(e.id), { employee_id: String(e.id), name: e.name, title: e.title, employment_status: e.employment_status, range_paid_hours: 0, all_paid_hours: 0, used_hours: 0, range_used_hours: 0, adjust_hours: 0, old_paid_hours: 0, old_range_paid_hours: 0 }]));
  for (const sh of shifts) {
    const r = row.get(String(sh.employee_id)); if (!r) continue;
    const paid = effectiveShiftPay(sh, minimum), t = new Date(sh.clock_in).getTime(), old = t < PDF_FROM_TS;
    r.all_paid_hours += paid;
    if (old) r.old_paid_hours += paid;
    if (t >= s0 && t < e0) { r.range_paid_hours += paid; if (old) r.old_range_paid_hours += paid; }
  }
  // Vacation from performance (PDF formula), finalized and provisional.
  let pdf = new Map();
  try { pdf = await pdfVacation(); } catch (e) { console.error('pdf vacation', e); }
  for (const b of bank) {
    const r = row.get(String(b.employee_id)); if (!r) continue;
    r.all_paid_hours += Number(b.paid_hours || 0); r.old_paid_hours += Number(b.paid_hours || 0);
    const y0 = Date.UTC(Number(b.year), 0, 1), y1 = Date.UTC(Number(b.year) + 1, 0, 1);
    if (y0 >= s0 && y1 <= e0) { r.range_paid_hours += Number(b.paid_hours || 0); r.old_range_paid_hours += Number(b.paid_hours || 0); }
  }
  for (const u of used) { const r = row.get(String(u.employee_id)); if (r) r.used_hours = Number(u.hours || 0); }
  for (const u of adj) { const r = row.get(String(u.employee_id)); if (r) r.adjust_hours = Number(u.hours || 0); }
  for (const u of usedRange) { const r = row.get(String(u.employee_id)); if (r) r.range_used_hours = Number(u.hours || 0); }
  const round = v => Math.round(v * 100) / 100, today = new Date().toISOString().slice(0, 10);
  return [...row.values()].map(r => {
    const rec = recBy.get(r.employee_id) || {}, opening = Number(rec.vacation_opening_hours || 0);
    const p = pdf.get(r.employee_id) || { final: 0, provisional: 0, byWeek: [] };
    const pdfRange = p.byWeek.filter(([wk]) => { const t = Date.parse(wk + 'T12:00:00Z'); return t >= s0 && t < e0; }).reduce((a, [, h]) => a + h, 0);
    const oldEarned = r.old_paid_hours * VACATION_PER_HOUR;
    const rangeEarned = r.old_range_paid_hours * VACATION_PER_HOUR + pdfRange, allEarned = oldEarned + opening + p.final + p.provisional;
    const from = eligibleFrom(rec.start_date || null);
    return { ...r, range_paid_hours: round(r.range_paid_hours), all_paid_hours: round(r.all_paid_hours), range_earned: round(rangeEarned), opening_hours: round(opening), all_earned: round(allEarned), adjust_hours: round(r.adjust_hours),
      old_earned: round(oldEarned), perf_final: round(p.final), perf_provisional: round(p.provisional),
      used_hours: round(r.used_hours), range_used_hours: round(r.range_used_hours), balance: round(allEarned + r.adjust_hours - r.used_hours),
      start_date: rec.start_date || null, eligible_from: from, eligible: !!from && from <= today };
  });
}

export async function vacationHistoryAll(startIso, endIso) {
  await ensureVacationTables();
  return sql`SELECT v.id,v.employee_id,e.name AS employee_name,v.hours,v.kind,v.taken_on,v.note,v.created_at FROM vacation_used v JOIN employees e ON e.id=v.employee_id
    WHERE v.taken_on>=${startIso.slice(0, 10)} AND v.taken_on<${endIso.slice(0, 10)} ORDER BY v.taken_on DESC, v.id DESC LIMIT 1000`;
}

export async function vacationHistory(employeeId) {
  await ensureVacationTables();
  return sql`SELECT id,hours,kind,taken_on,note,created_at FROM vacation_used WHERE employee_id=${employeeId} ORDER BY taken_on DESC, id DESC LIMIT 100`;
}

export async function recordVacationUsed(employeeId, hours, takenOn, note, managerId, kind = 'taken') {
  await ensureVacationTables();
  return sql`INSERT INTO vacation_used(employee_id,hours,kind,taken_on,note,created_at,created_by) VALUES(${employeeId},${hours},${kind},${takenOn},${note || null},${nowIso()},${managerId}) RETURNING id`;
}
