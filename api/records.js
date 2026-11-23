import { sql, sqlBatch, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';
import { seal, open } from './_crypto.js';

/* Employee records: personal details each employee gives when hired.
   Employees fill in their own (My Info); the manager sees and edits all of
   them. Job status comes from the timesheet (Active / On vacation / Terminated).
   The SSN and the licence photo are stored encrypted; the SSN is shown masked
   unless the manager reveals it, and every reveal is logged. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS employee_records (
     employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
     full_name TEXT, dob TEXT, address TEXT, phone TEXT, email TEXT,
     ssn_enc TEXT, ssn_last4 TEXT,
     emergency_name TEXT, emergency_phone TEXT, emergency_relation TEXT,
     start_date TEXT, termination_date TEXT, termination_reason TEXT,
     vacation_opening_hours REAL NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS employee_files (
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     kind TEXT NOT NULL,
     mime TEXT NOT NULL,
     data_enc TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (employee_id, kind))`
];
let ready = false;
export async function ensureRecordTables() { if (ready) return; await sqlBatch(SCHEMA.map(s => [s])); ready = true; }

const text = (v, max) => { if (v === undefined) return undefined; const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? (s || null) : false; };
const date = v => { if (v === undefined) return undefined; const s = String(v || '').trim(); if (!s) return null; return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : false; };
const REQUIRED = ['full_name', 'dob', 'address', 'phone', 'ssn_last4', 'emergency_name', 'emergency_phone', 'emergency_relation'];

async function readRecord(id) {
  const r = (await sql`SELECT * FROM employee_records WHERE employee_id=${id}`)[0] || null;
  const file = (await sql`SELECT updated_at FROM employee_files WHERE employee_id=${id} AND kind='license'`)[0] || null;
  const out = r ? { ...r } : { employee_id: String(id) };
  delete out.ssn_enc;
  out.ssn_masked = r?.ssn_last4 ? `•••-••-${r.ssn_last4}` : null;
  out.has_license = !!file; out.license_updated_at = file?.updated_at || null;
  out.missing = REQUIRED.filter(k => !out[k]).concat(file ? [] : ['license']);
  return out;
}

/* Apply allowed fields from body; returns error text or null. */
async function save(id, b, who, managerFields) {
  const f = {
    full_name: text(b.full_name, 120), dob: date(b.dob), address: text(b.address, 300), phone: text(b.phone, 40), email: text(b.email, 254),
    emergency_name: text(b.emergency_name, 120), emergency_phone: text(b.emergency_phone, 40), emergency_relation: text(b.emergency_relation, 60)
  };
  if (managerFields) Object.assign(f, { start_date: date(b.start_date), termination_date: date(b.termination_date), termination_reason: text(b.termination_reason, 300) });
  for (const [k, v] of Object.entries(f)) if (v === false) return `Check the ${k.replace(/_/g, ' ')}.`;
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'Enter a valid email.';
  let opening;
  if (managerFields && b.vacation_opening_hours !== undefined) { opening = Number(b.vacation_opening_hours || 0); if (!Number.isFinite(opening) || opening < 0 || opening > 2000) return 'Vacation hours before WorkClock must be 0 to 2,000.'; }
  let ssnEnc, ssnLast4;
  if (b.ssn !== undefined && String(b.ssn).trim() !== '') {
    const digits = String(b.ssn).replace(/\D/g, '');
    if (digits.length !== 9) return 'The SSN must have 9 digits.';
    ssnEnc = await seal(digits); ssnLast4 = digits.slice(-4);
  }
  const now = nowIso();
  await sql`INSERT INTO employee_records(employee_id,updated_at,updated_by) VALUES(${id},${now},${who}) ON CONFLICT(employee_id) DO NOTHING`;
  const sets = Object.entries(f).filter(([, v]) => v !== undefined);
  if (opening !== undefined) sets.push(['vacation_opening_hours', opening]);
  if (ssnEnc) { sets.push(['ssn_enc', ssnEnc]); sets.push(['ssn_last4', ssnLast4]); }
  sets.push(['updated_at', now]); sets.push(['updated_by', who]);
  const strings = ['UPDATE employee_records SET ' + sets[0][0] + '='];
  sets.slice(1).forEach(([k]) => strings.push(',' + k + '='));
  strings.push(' WHERE employee_id='); strings.push('');
  await sql(strings, ...sets.map(([, v]) => v), id);
  if (b.license !== undefined && b.license) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.license));
    if (!m) return 'The licence photo must be a JPG, PNG or WEBP image.';
    if (m[2].length > 1_400_000) return 'The licence photo is too large. Take it again a little further away.';
    await sql`INSERT INTO employee_files(employee_id,kind,mime,data_enc,updated_at) VALUES(${id},'license',${m[1]},${await seal(m[2])},${now}) ON CONFLICT(employee_id,kind) DO UPDATE SET mime=excluded.mime,data_enc=excluded.data_enc,updated_at=excluded.updated_at`;
  }
  return null;
}

async function licenseImage(id) {
  const f = (await sql`SELECT mime,data_enc FROM employee_files WHERE employee_id=${id} AND kind='license'`)[0];
  if (!f) return null;
  return `data:${f.mime};base64,${await open(f.data_enc)}`;
}

export default async function handler(req, res) {
  try {
    await ensureRecordTables();
    const u = new URL(req.url, 'https://workclock.invalid'), b = req.body || {};
    if (u.searchParams.get('mine') === '1' || b.action === 'mine') {
      const emp = await getEmployeeSession(req); if (!emp) return json(res, 401, { error: 'Employee login required.' });
      if (req.method === 'GET') {
        if (u.searchParams.get('license')) return json(res, 200, { image: await licenseImage(emp.id) });
        const status = (await sql`SELECT employment_status FROM employees WHERE id=${emp.id}`)[0]?.employment_status || 'active';
        return json(res, 200, { record: await readRecord(emp.id), status });
      }
      if (req.method === 'PATCH') {
        if (!requireSameOrigin(req, res)) return;
        const err = await save(emp.id, b, 'employee', false); if (err) return json(res, 400, { error: err });
        await audit('employee', emp.id, 'record_updated_by_employee', { fields: Object.keys(b).filter(k => !['ssn', 'license', 'action'].includes(k)), ssn: !!b.ssn, license: !!b.license });
        return json(res, 200, { ok: true, record: await readRecord(emp.id) });
      }
      return json(res, 405, { error: 'Method not allowed' });
    }
    const manager = await getManager(req); if (!manager) return json(res, 401, { error: 'Manager login required.' });
    if (req.method === 'GET') {
      const id = Number(u.searchParams.get('id'));
      if (Number.isInteger(id) && id > 0) {
        if (u.searchParams.get('ssn')) {
          const r = (await sql`SELECT ssn_enc FROM employee_records WHERE employee_id=${id}`)[0];
          await audit('manager', manager.id, 'record_ssn_revealed', { employee_id: id });
          const d = r?.ssn_enc ? await open(r.ssn_enc) : null;
          return json(res, 200, { ssn: d ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : null });
        }
        if (u.searchParams.get('license')) { await audit('manager', manager.id, 'record_license_viewed', { employee_id: id }); return json(res, 200, { image: await licenseImage(id) }); }
        return json(res, 200, { record: await readRecord(id) });
      }
      const emps = await sql`SELECT id,name,title,email,employment_status FROM employees ORDER BY CASE employment_status WHEN 'active' THEN 0 WHEN 'vacation' THEN 1 ELSE 2 END, name`;
      const out = [];
      for (const e of emps) { const r = await readRecord(e.id); out.push({ ...e, record: r }); }
      return json(res, 200, { employees: out });
    }
    if (req.method === 'PATCH') {
      if (!requireSameOrigin(req, res)) return;
      const id = Number(b.employeeId); if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'Choose an employee.' });
      if (!(await sql`SELECT id FROM employees WHERE id=${id}`).length) return json(res, 404, { error: 'Employee not found.' });
      const err = await save(id, b, 'manager', true); if (err) return json(res, 400, { error: err });
      await audit('manager', manager.id, 'record_updated', { employee_id: id, ssn: !!b.ssn, license: !!b.license });
      return json(res, 200, { ok: true, record: await readRecord(id) });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}
