import { sql, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';
import { recordVacationUsed, ensureVacationTables } from './_vacation.js';

/* Vacation requests: a painter asks for days off; the manager approves
   (the hours are then recorded as vacation taken) or denies, with a note. */

let ready = false;
export async function ensureVacReq() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS vacation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    hours REAL NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    manager_note TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT, decided_by INTEGER,
    used_id INTEGER,
    employee_seen INTEGER NOT NULL DEFAULT 1)`;
  await sql`CREATE INDEX IF NOT EXISTS vacation_requests_status ON vacation_requests(status, employee_id)`;
  ready = true;
}
export async function pendingVacationRequests() {
  try { await ensureVacReq(); return Number((await sql`SELECT count(*) AS n FROM vacation_requests WHERE status='pending'`)[0].n); } catch { return 0; }
}
export async function unseenVacationAnswers(employeeId) {
  try { await ensureVacReq(); return Number((await sql`SELECT count(*) AS n FROM vacation_requests WHERE employee_id=${employeeId} AND employee_seen=0`)[0].n); } catch { return 0; }
}

const day = v => { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null; };
const COLS = 'r.id,r.employee_id,r.start_date,r.end_date,r.hours,r.note,r.status,r.manager_note,r.created_at,r.decided_at';

export default async function handler(req, res) {
  try {
    await ensureVacReq();
    const u = new URL(req.url, 'https://workclock.invalid'), b = req.body || {};
    const asEmp = u.searchParams.get('mine') === '1';
    const manager = asEmp ? null : await getManager(req), emp = manager ? null : await getEmployeeSession(req);
    if (!manager && !emp) return json(res, 401, { error: 'Login required.' });

    if (emp) {
      if (req.method === 'GET') {
        const rows = await sql([`SELECT ${COLS} FROM vacation_requests r WHERE r.employee_id=`, ` ORDER BY r.created_at DESC LIMIT 50`], emp.id);
        if (u.searchParams.get('seen')) await sql`UPDATE vacation_requests SET employee_seen=1 WHERE employee_id=${emp.id} AND employee_seen=0`;
        return json(res, 200, { requests: rows });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      if (!requireSameOrigin(req, res)) return;
      if (b.action === 'cancel') {
        const r = await sql`UPDATE vacation_requests SET status='cancelled',decided_at=${nowIso()} WHERE id=${Number(b.id)} AND employee_id=${emp.id} AND status='pending' RETURNING id`;
        if (!r.length) return json(res, 400, { error: 'This request has already been answered.' });
        return json(res, 200, { ok: true });
      }
      const s = day(b.start), e = day(b.end), hours = Number(b.hours), note = String(b.note || '').trim().slice(0, 300);
      if (!s || !e || e < s) return json(res, 400, { error: 'Choose the first and last day of your vacation.' });
      if ((Date.parse(e) - Date.parse(s)) / 86400000 > 60) return json(res, 400, { error: 'A request can cover up to 60 days.' });
      if (!Number.isFinite(hours) || hours <= 0 || hours > 400) return json(res, 400, { error: 'Enter how many vacation hours you need.' });
      const open = await sql`SELECT count(*) AS n FROM vacation_requests WHERE employee_id=${emp.id} AND status='pending'`;
      if (Number(open[0].n) >= 3) return json(res, 400, { error: 'You already have 3 requests waiting for an answer.' });
      const id = Number((await sql`INSERT INTO vacation_requests(employee_id,start_date,end_date,hours,note,status,created_at) VALUES(${emp.id},${s},${e},${Math.round(hours * 100) / 100},${note || null},'pending',${nowIso()}) RETURNING id`)[0].id);
      await audit('employee', emp.id, 'vacation_requested', { id, start: s, end: e, hours });
      return json(res, 200, { ok: true, id });
    }

    // Manager
    if (req.method === 'GET') {
      const rows = await sql([`SELECT ${COLS},e.name AS employee_name FROM vacation_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status='pending' OR r.created_at>=`, ` ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 300`], new Date(Date.now() - 400 * 86400000).toISOString());
      return json(res, 200, { requests: rows });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    if (b.action === 'decide') {
      const r = (await sql`SELECT * FROM vacation_requests WHERE id=${Number(b.id)}`)[0];
      if (!r || r.status !== 'pending') return json(res, 400, { error: 'This request has already been answered.' });
      const note = String(b.note || '').trim().slice(0, 300) || null, now = nowIso();
      if (b.decision === 'approved') {
        const hours = b.hours === undefined || b.hours === '' ? Number(r.hours) : Number(b.hours);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 400) return json(res, 400, { error: 'Enter the hours to record.' });
        await ensureVacationTables();
        const used = await recordVacationUsed(Number(r.employee_id), Math.round(hours * 100) / 100, r.start_date, `Request ${r.start_date}${r.end_date !== r.start_date ? ' to ' + r.end_date : ''}${note ? ' · ' + note : ''}`, manager.id);
        await sql`UPDATE vacation_requests SET status='approved',hours=${Math.round(hours * 100) / 100},manager_note=${note},decided_at=${now},decided_by=${manager.id},used_id=${Number(used[0]?.id) || null},employee_seen=0 WHERE id=${r.id}`;
        await audit('manager', manager.id, 'vacation_request_approved', { id: r.id, employee_id: r.employee_id, hours });
        return json(res, 200, { ok: true });
      }
      if (b.decision === 'denied') {
        await sql`UPDATE vacation_requests SET status='denied',manager_note=${note},decided_at=${now},decided_by=${manager.id},employee_seen=0 WHERE id=${r.id}`;
        await audit('manager', manager.id, 'vacation_request_denied', { id: r.id, employee_id: r.employee_id });
        return json(res, 200, { ok: true });
      }
      return json(res, 400, { error: 'Choose Approve or Deny.' });
    }
    return json(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
