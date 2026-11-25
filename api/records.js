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
     PRIMARY KEY (employee_id, kind))`,
  // A painter's change to something already filled in waits for the manager.
  `CREATE TABLE IF NOT EXISTS record_change_requests (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     field TEXT NOT NULL,
     new_value TEXT,
     status TEXT NOT NULL DEFAULT 'pending',
     created_at TEXT NOT NULL,
     decided_at TEXT, decided_by INTEGER, note TEXT)`,
  `CREATE INDEX IF NOT EXISTS record_change_requests_status ON record_change_requests(status, employee_id)`
];
let ready = false;
export async function ensureRecordTables() { if (ready) return; await sqlBatch(SCHEMA.map(s => [s])); ready = true; }

const text = (v, max) => { if (v === undefined) return undefined; const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? (s || null) : false; };
const date = v => { if (v === undefined) return undefined; const s = String(v || '').trim(); if (!s) return null; return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : false; };
const REQUIRED = ['full_name', 'dob', 'address', 'phone', 'ssn_last4', 'emergency_name', 'emergency_phone', 'emergency_relation'];

const EMP_FIELDS = ['dob', 'address', 'phone', 'email', 'emergency_name', 'emergency_phone', 'emergency_relation'];
const FIELD_LABEL = { dob: 'Date of birth', address: 'Address', phone: 'Phone', email: 'Email', emergency_name: 'Emergency contact', emergency_phone: 'Emergency phone', emergency_relation: 'Relation', ssn: 'SSN', license: 'Licence photo' };

async function readRecord(id) {
  const r = (await sql`SELECT * FROM employee_records WHERE employee_id=${id}`)[0] || null;
  const file = (await sql`SELECT updated_at FROM employee_files WHERE employee_id=${id} AND kind='license'`)[0] || null;
  const emp = (await sql`SELECT name FROM employees WHERE id=${id}`)[0];
  const out = r ? { ...r } : { employee_id: String(id) };
  // The name is the one the manager set for the account; nobody edits it here.
  out.full_name = emp?.name || out.full_name || null;
  out.pending = (await sql`SELECT id,field,created_at FROM record_change_requests WHERE employee_id=${id} AND status='pending' ORDER BY id`).map(p => ({ id: p.id, field: p.field, created_at: p.created_at }));
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
        // Empty fields are filled straight away; a change to anything already filled
        // in becomes a request that the manager approves or rejects.
        const cur = (await sql`SELECT * FROM employee_records WHERE employee_id=${emp.id}`)[0] || {};
        const hasLic = (await sql`SELECT 1 FROM employee_files WHERE employee_id=${emp.id} AND kind='license'`).length > 0;
        const direct = { action: 'mine' }, requests = [];
        for (const k of EMP_FIELDS) {
          if (b[k] === undefined) continue;
          const nv = k === 'dob' ? date(b[k]) : text(b[k], { address: 300, phone: 40, email: 254, emergency_name: 120, emergency_phone: 40, emergency_relation: 60 }[k]);
          if (nv === false) return json(res, 400, { error: `Check the ${k.replace(/_/g, ' ')}.` });
          if (k === 'email' && nv && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nv)) return json(res, 400, { error: 'Enter a valid email.' });
          const old = cur[k] ?? null;
          if ((nv ?? null) === old) continue;
          if (!old) direct[k] = nv; else requests.push([k, nv ?? '']);
        }
        if (b.ssn !== undefined && String(b.ssn).trim() !== '') {
          const digits = String(b.ssn).replace(/\D/g, '');
          if (digits.length !== 9) return json(res, 400, { error: 'The SSN must have 9 digits.' });
          if (!cur.ssn_enc) direct.ssn = digits; else requests.push(['ssn', await seal(digits)]);
        }
        if (b.license) {
          const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.license));
          if (!m) return json(res, 400, { error: 'The licence photo must be a JPG, PNG or WEBP image.' });
          if (m[2].length > 1_400_000) return json(res, 400, { error: 'The licence photo is too large. Take it again a little further away.' });
          if (!hasLic) direct.license = b.license; else requests.push(['license', m[1] + ';' + await seal(m[2])]);
        }
        const err = await save(emp.id, direct, 'employee', false); if (err) return json(res, 400, { error: err });
        const now = nowIso();
        for (const [field, value] of requests) {
          await sql`UPDATE record_change_requests SET status='replaced',decided_at=${now} WHERE employee_id=${emp.id} AND field=${field} AND status='pending'`;
          await sql`INSERT INTO record_change_requests(employee_id,field,new_value,status,created_at) VALUES(${emp.id},${field},${value},'pending',${now})`;
        }
        if (requests.length) await audit('employee', emp.id, 'record_change_requested', { fields: requests.map(x => x[0]) });
        return json(res, 200, { ok: true, requested: requests.map(x => x[0]), record: await readRecord(emp.id) });
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
      if (u.searchParams.get('changes')) {
        const rows = await sql`SELECT c.id,c.employee_id,c.field,c.new_value,c.created_at,e.name FROM record_change_requests c JOIN employees e ON e.id=c.employee_id WHERE c.status='pending' ORDER BY c.created_at`;
        const out = [];
        for (const c of rows) {
          const cur = (await sql`SELECT * FROM employee_records WHERE employee_id=${c.employee_id}`)[0] || {};
          let from = cur[c.field] ?? null, to = c.new_value;
          if (c.field === 'ssn') { from = cur.ssn_last4 ? `•••-••-${cur.ssn_last4}` : null; const d = await open(c.new_value); to = `•••-••-${d.slice(-4)}`; }
          if (c.field === 'license') { from = 'current photo'; to = 'new photo'; }
          out.push({ id: c.id, employee_id: c.employee_id, name: c.name, field: c.field, label: FIELD_LABEL[c.field] || c.field, from, to, created_at: c.created_at });
        }
        return json(res, 200, { changes: out });
      }
      if (u.searchParams.get('changePhoto')) {
        const c = (await sql`SELECT new_value FROM record_change_requests WHERE id=${Number(u.searchParams.get('changePhoto'))} AND field='license'`)[0];
        if (!c) return json(res, 404, { error: 'Not found.' });
        const [mime, enc] = [c.new_value.slice(0, c.new_value.indexOf(';')), c.new_value.slice(c.new_value.indexOf(';') + 1)];
        return json(res, 200, { image: `data:${mime};base64,${await open(enc)}` });
      }
      const emps = await sql`SELECT id,name,title,email,employment_status FROM employees ORDER BY CASE employment_status WHEN 'active' THEN 0 WHEN 'vacation' THEN 1 ELSE 2 END, name`;
      const out = [];
      for (const e of emps) { const r = await readRecord(e.id); out.push({ ...e, record: r }); }
      return json(res, 200, { employees: out });
    }
    if (req.method === 'PATCH' && b.action === 'change_decide') {
      if (!requireSameOrigin(req, res)) return;
      const c = (await sql`SELECT * FROM record_change_requests WHERE id=${Number(b.id)} AND status='pending'`)[0];
      if (!c) return json(res, 400, { error: 'This request has already been handled.' });
      const now = nowIso(), approve = b.decision === 'approve';
      if (approve) {
        if (c.field === 'ssn') { const d = await open(c.new_value); const err = await save(c.employee_id, { ssn: d }, 'manager', false); if (err) return json(res, 400, { error: err }); }
        else if (c.field === 'license') { const i = c.new_value.indexOf(';'); const err = await save(c.employee_id, { license: `data:${c.new_value.slice(0, i)};base64,${await open(c.new_value.slice(i + 1))}` }, 'manager', false); if (err) return json(res, 400, { error: err }); }
        else { const err = await save(c.employee_id, { [c.field]: c.new_value }, 'manager', false); if (err) return json(res, 400, { error: err }); }
      }
      await sql`UPDATE record_change_requests SET status=${approve ? 'approved' : 'rejected'},decided_at=${now},decided_by=${manager.id},note=${String(b.note || '').slice(0, 200) || null} WHERE id=${c.id}`;
      await audit('manager', manager.id, 'record_change_' + (approve ? 'approved' : 'rejected'), { employee_id: c.employee_id, field: c.field });
      return json(res, 200, { ok: true });
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
