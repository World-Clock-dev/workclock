import { sql, nowIso, round2 } from './_db.js';

/* Hourly rates with effective dates.

   A raise is saved with the date it starts. Every shift is paid at the rate
   in effect on its (Eastern) start date, so changing a rate never rewrites
   earlier weeks. employees.hourly_wage keeps "the rate today", which is what
   the screens show and edit.

   Before the first change an employee has no history rows and simply uses
   employees.hourly_wage, exactly as before. The first change stores the old
   rate as the base row, so earlier shifts keep it. */

let ready = false;
export async function ensureWages() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS wage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    effective_date TEXT NOT NULL,
    hourly_wage REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    UNIQUE (employee_id, effective_date))`;
  ready = true;
}

export async function companyTz() {
  try { const r = await sql`SELECT value FROM app_settings WHERE key='company_timezone'`; return r[0]?.value || 'America/New_York'; }
  catch { return 'America/New_York'; }
}
export function localDate(ts, tz) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/* Everything needed to price shifts: { tz, byEmp: Map(id -> [{d, rate}] ascending) }. */
export async function rateBook() {
  await ensureWages();
  const tz = await companyTz();
  const rows = await sql`SELECT employee_id,effective_date,hourly_wage FROM wage_history ORDER BY employee_id,effective_date`;
  const byEmp = new Map();
  for (const r of rows) {
    const k = String(r.employee_id);
    if (!byEmp.has(k)) byEmp.set(k, []);
    byEmp.get(k).push({ d: r.effective_date, rate: Number(r.hourly_wage) });
  }
  return { tz, byEmp };
}
/* Rate for an employee on a day ('YYYY-MM-DD') or at a timestamp. */
export function rateOn(book, employeeId, when, fallback) {
  const list = book.byEmp.get(String(employeeId));
  if (!list || !list.length) return Number(fallback || 0);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(when)) ? String(when) : localDate(when, book.tz);
  let rate = list[0].rate;
  for (const r of list) { if (r.d <= day) rate = r.rate; else break; }
  return rate;
}

export async function wageHistory(employeeId) {
  await ensureWages();
  return sql`SELECT id,effective_date,hourly_wage,note,created_at FROM wage_history WHERE employee_id=${employeeId} ORDER BY effective_date DESC`;
}

/* Save a rate starting on effectiveDate. Returns the rate in effect today. */
export async function setWage(employeeId, rate, effectiveDate, managerId, note) {
  await ensureWages();
  const emp = (await sql`SELECT hourly_wage FROM employees WHERE id=${employeeId}`)[0];
  if (!emp) return null;
  const now = nowIso();
  const has = await sql`SELECT count(*) AS n FROM wage_history WHERE employee_id=${employeeId}`;
  if (!Number(has[0].n)) {
    // Keep the old rate for everything before the change.
    await sql`INSERT INTO wage_history(employee_id,effective_date,hourly_wage,note,created_at,created_by) VALUES(${employeeId},'0000-01-01',${round2(emp.hourly_wage)},${'Rate before the first change'},${now},${managerId})`;
  }
  await sql`INSERT INTO wage_history(employee_id,effective_date,hourly_wage,note,created_at,created_by) VALUES(${employeeId},${effectiveDate},${round2(rate)},${note || null},${now},${managerId})
    ON CONFLICT(employee_id,effective_date) DO UPDATE SET hourly_wage=excluded.hourly_wage,note=excluded.note,created_at=excluded.created_at,created_by=excluded.created_by`;
  return syncCurrentWage(employeeId);
}

export async function deleteWage(employeeId, historyId) {
  await ensureWages();
  const row = (await sql`SELECT effective_date FROM wage_history WHERE id=${historyId} AND employee_id=${employeeId}`)[0];
  if (!row || row.effective_date === '0000-01-01') return false;
  await sql`DELETE FROM wage_history WHERE id=${historyId}`;
  await syncCurrentWage(employeeId);
  return true;
}

/* employees.hourly_wage = the rate in effect today (Eastern). */
export async function syncCurrentWage(employeeId) {
  const book = await rateBook();
  const emp = (await sql`SELECT hourly_wage FROM employees WHERE id=${employeeId}`)[0];
  if (!emp) return null;
  const today = localDate(new Date(), book.tz);
  const rate = rateOn(book, employeeId, today, emp.hourly_wage);
  if (round2(rate) !== round2(emp.hourly_wage)) await sql`UPDATE employees SET hourly_wage=${round2(rate)},updated_at=${nowIso()} WHERE id=${employeeId}`;
  return rate;
}
/* Nightly: raises dated in the future take effect on their day. */
export async function syncAllWages() {
  const book = await rateBook();
  for (const id of book.byEmp.keys()) await syncCurrentWage(Number(id));
}
