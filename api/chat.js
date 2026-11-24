import { sql, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';
import { getBlob, sendBlob } from './_files.js';

/* Messages between the manager and each painter.

   One conversation per painter. The manager can also send one message to
   everyone (it lands in each painter's conversation, marked "To everyone").
   chat_threads keeps the last message and the unread counts per painter, so
   the checks for new messages read a handful of rows, not the whole history. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     from_manager INTEGER NOT NULL,
     body TEXT,
     blob_key TEXT, filename TEXT, mime TEXT, size INTEGER,
     broadcast INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     seen_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS chat_messages_employee ON chat_messages(employee_id, id)`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
     employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
     last_id INTEGER, last_at TEXT, last_text TEXT, last_from_manager INTEGER,
     mgr_unread INTEGER NOT NULL DEFAULT 0, emp_unread INTEGER NOT NULL DEFAULT 0)`
];
let ready = false;
export async function ensureChat() {
  if (ready) return;
  for (const s of SCHEMA) await sql([s]);
  ready = true;
}

const MAX_TEXT = 2000;
const cleanBody = v => { const s = String(v ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim(); return s.length <= MAX_TEXT ? s : null; };
const preview = m => m.body ? m.body.slice(0, 120) : (String(m.mime || '').startsWith('image/') ? '📷 Photo' : '📄 ' + (m.filename || 'File'));
const MSG_COLS = 'id,employee_id,from_manager,body,filename,mime,size,broadcast,created_at,seen_at,CASE WHEN blob_key IS NULL THEN 0 ELSE 1 END AS has_file';

/* Save one message and update the painter's conversation summary. */
export async function addMessage(employeeId, fromManager, m) {
  await ensureChat();
  const now = nowIso();
  const id = Number((await sql`INSERT INTO chat_messages(employee_id,from_manager,body,blob_key,filename,mime,size,broadcast,created_at)
    VALUES(${employeeId},${fromManager ? 1 : 0},${m.body || null},${m.blob_key || null},${m.filename || null},${m.mime || null},${m.size || null},${m.broadcast ? 1 : 0},${now}) RETURNING id`)[0].id);
  const text = preview(m);
  await sql`INSERT INTO chat_threads(employee_id,last_id,last_at,last_text,last_from_manager,mgr_unread,emp_unread)
    VALUES(${employeeId},${id},${now},${text},${fromManager ? 1 : 0},${fromManager ? 0 : 1},${fromManager ? 1 : 0})
    ON CONFLICT(employee_id) DO UPDATE SET last_id=excluded.last_id,last_at=excluded.last_at,last_text=excluded.last_text,last_from_manager=excluded.last_from_manager,
      mgr_unread=chat_threads.mgr_unread+excluded.mgr_unread, emp_unread=chat_threads.emp_unread+excluded.emp_unread`;
  return id;
}

/* Unread counts for the regular checks (used by /api/supplies?count=1). */
export async function managerUnread() {
  try {
    await ensureChat();
    const r = await sql`SELECT t.employee_id,t.mgr_unread,t.last_at,e.name FROM chat_threads t JOIN employees e ON e.id=t.employee_id WHERE t.mgr_unread>0 ORDER BY t.last_at DESC`;
    return { chatUnread: r.reduce((a, x) => a + Number(x.mgr_unread || 0), 0), chatLatest: r[0] ? { employee_id: r[0].employee_id, name: r[0].name, at: r[0].last_at } : null };
  } catch { return { chatUnread: 0, chatLatest: null }; }
}
export async function employeeUnread(employeeId) {
  try { await ensureChat(); const r = await sql`SELECT emp_unread FROM chat_threads WHERE employee_id=${employeeId}`; return Number(r[0]?.emp_unread || 0); }
  catch { return 0; }
}

async function messagesFor(employeeId, after, viewerIsManager) {
  const rows = after
    ? await sql([`SELECT ${MSG_COLS} FROM chat_messages WHERE employee_id=`, ` AND id>`, ` ORDER BY id LIMIT 200`], employeeId, after)
    : (await sql([`SELECT ${MSG_COLS} FROM chat_messages WHERE employee_id=`, ` ORDER BY id DESC LIMIT 100`], employeeId)).reverse();
  // Mark what the viewer received as seen, only when something is unread (saves writes).
  const t = (await sql`SELECT mgr_unread,emp_unread FROM chat_threads WHERE employee_id=${employeeId}`)[0];
  const unread = t ? Number(viewerIsManager ? t.mgr_unread : t.emp_unread) : 0;
  if (unread > 0) {
    const now = nowIso();
    await sql`UPDATE chat_messages SET seen_at=${now} WHERE employee_id=${employeeId} AND from_manager=${viewerIsManager ? 0 : 1} AND seen_at IS NULL`;
    if (viewerIsManager) await sql`UPDATE chat_threads SET mgr_unread=0 WHERE employee_id=${employeeId}`;
    else await sql`UPDATE chat_threads SET emp_unread=0 WHERE employee_id=${employeeId}`;
    for (const m of rows) if (!m.seen_at && !!m.from_manager !== viewerIsManager) m.seen_at = now;
  }
  // When the other side last read: lets the sender see "Seen".
  return rows;
}

export default async function handler(req, res) {
  try {
    await ensureChat();
    const u = new URL(req.url, 'https://workclock.invalid'), b = req.body || {};
    const manager = await getManager(req), emp = manager ? null : await getEmployeeSession(req);
    if (!manager && !emp) return json(res, 401, { error: 'Login required.' });
    const num = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

    if (req.method === 'GET') {
      const fileId = num(u.searchParams.get('file'));
      if (fileId) {
        const m = (await sql`SELECT employee_id,blob_key,filename,mime FROM chat_messages WHERE id=${fileId}`)[0];
        if (!m || !m.blob_key || (!manager && String(m.employee_id) !== String(emp.id))) return json(res, 404, { error: 'Not found.' });
        const body = await getBlob(m.blob_key);
        return body ? sendBlob(res, body, m.mime, m.filename) : json(res, 404, { error: 'File missing.' });
      }
      const after = num(u.searchParams.get('after'));
      if (!manager) {
        const messages = await messagesFor(emp.id, after, false);
        return json(res, 200, { messages });
      }
      if (u.searchParams.get('threads')) {
        const rows = await sql`SELECT e.id AS employee_id,e.name,e.title,e.employment_status,t.last_id,t.last_at,t.last_text,t.last_from_manager,COALESCE(t.mgr_unread,0) AS unread
          FROM employees e LEFT JOIN chat_threads t ON t.employee_id=e.id
          WHERE e.employment_status<>'terminated' OR t.last_id IS NOT NULL
          ORDER BY CASE WHEN t.last_at IS NULL THEN 1 ELSE 0 END, t.last_at DESC, e.name`;
        return json(res, 200, { threads: rows });
      }
      const empId = num(u.searchParams.get('employeeId'));
      if (!empId) return json(res, 400, { error: 'Choose a painter.' });
      const messages = await messagesFor(empId, after, true);
      return json(res, 200, { messages });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const body = cleanBody(b.body);
    if (body === null) return json(res, 400, { error: `A message can be up to ${MAX_TEXT} characters.` });

    if (b.action === 'send') {
      if (!body) return json(res, 400, { error: 'Write a message.' });
      if (manager) {
        const empId = num(b.employeeId);
        if (!empId || !(await sql`SELECT 1 FROM employees WHERE id=${empId}`).length) return json(res, 400, { error: 'Choose a painter.' });
        const id = await addMessage(empId, true, { body });
        return json(res, 200, { ok: true, id });
      }
      const id = await addMessage(emp.id, false, { body });
      return json(res, 200, { ok: true, id });
    }
    if (b.action === 'broadcast' && manager) {
      if (!body) return json(res, 400, { error: 'Write a message.' });
      const people = await sql`SELECT id FROM employees WHERE employment_status<>'terminated'`;
      for (const p of people) await addMessage(Number(p.id), true, { body, broadcast: true });
      await audit('manager', manager.id, 'chat_broadcast', { to: people.length });
      return json(res, 200, { ok: true, sent: people.length });
    }
    return json(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
