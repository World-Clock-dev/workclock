import { sql, sqlBatch, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';

/* Company: Job Resources (handbook / SOP PDFs), Vehicles, Assigned Projects.
   PDFs are kept in D1 in chunks (no extra storage service, stays free). */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS resources (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'other',
     filename TEXT NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resource_chunks (resource_id INTEGER NOT NULL REFERENCES resources(id), idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (resource_id, idx))`,
  `CREATE TABLE IF NOT EXISTS vehicles (
     id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, make TEXT, model TEXT, vin TEXT, plate TEXT,
     employee_id INTEGER REFERENCES employees(id), notes TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS vehicle_maintenance (
     id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), date TEXT NOT NULL,
     type TEXT NOT NULL, mileage INTEGER, cost REAL, notes TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle ON vehicle_maintenance(vehicle_id, date)`,
  `CREATE TABLE IF NOT EXISTS projects (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
     notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS project_employees (project_id INTEGER NOT NULL REFERENCES projects(id), employee_id INTEGER NOT NULL REFERENCES employees(id), PRIMARY KEY (project_id, employee_id))`,
  `CREATE INDEX IF NOT EXISTS projects_dates ON projects(start_date, end_date)`,
  // Files attached to other records (vehicle incident photos, project work orders).
  `CREATE TABLE IF NOT EXISTS attachments (
     id INTEGER PRIMARY KEY AUTOINCREMENT, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL,
     filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS vehicle_incidents (
     id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), date TEXT NOT NULL,
     notes TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS attachments_owner ON attachments(owner_type, owner_id)`,
  `CREATE TABLE IF NOT EXISTS attachment_chunks (attachment_id INTEGER NOT NULL REFERENCES attachments(id), idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (attachment_id, idx))`
];
let ready = false;
async function ensure() {
  if (ready) return;
  await sqlBatch(SCHEMA.map(s => [s]));
  const add = async (table, col, def) => { const cols = (await sql([`SELECT name FROM pragma_table_info('${table}')`])).map(c => c.name); if (!cols.includes(col)) await sql([`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`]); };
  await add('resources', 'category', 'TEXT');
  await add('resources', 'mime', "TEXT NOT NULL DEFAULT 'application/pdf'");
  await sql`UPDATE resources SET category=CASE kind WHEN 'handbook' THEN 'Employee Handbook' WHEN 'sop' THEN 'SOP' ELSE 'Other' END WHERE category IS NULL`;
  for (const [t, c, d] of EXTRA_COLS) await add(t, c, d);
  ready = true;
}
// Columns added by later rounds (vehicles, incidents, projects).
const EXTRA_COLS = [
  ['vehicles', 'odometer_purchase', 'INTEGER'],
  ['vehicles', 'reg_date', 'TEXT'], ['vehicles', 'reg_expires', 'TEXT'],          // full dates
  ['vehicles', 'insp_month', 'TEXT'], ['vehicles', 'insp_expires', 'TEXT'],       // YYYY-MM (month and year only)
  ['projects', 'work_order_url', 'TEXT'],
  ['project_employees', 'start_date', 'TEXT'], ['project_employees', 'end_date', 'TEXT']
];

const MAX_PDF = 8 * 1024 * 1024, CHUNK = 900_000;
const txt = (v, max) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? s : null; };
const day = v => { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null; };
const month = v => { const s = String(v || '').trim(); return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null; };
// Registration: alert 1 month before the date. Inspection (month/year): it runs to the end of that month.
function vehicleAlerts(v, today = new Date()) {
  const out = [], t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const check = (label, dateStr, shown) => {
    if (!dateStr) return;
    const d = Date.parse(dateStr + 'T00:00:00Z'); if (Number.isNaN(d)) return;
    const oneMonthBefore = new Date(d); oneMonthBefore.setUTCMonth(oneMonthBefore.getUTCMonth() - 1);
    if (t0 >= oneMonthBefore.getTime()) out.push({ kind: label, date: shown, expired: t0 > d, days: Math.round((d - t0) / 86400000) });
  };
  check('registration', v.reg_expires, v.reg_expires);
  if (v.insp_expires) { const [y, m] = v.insp_expires.split('-').map(Number); check('inspection', new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), v.insp_expires); }
  return out;
}
const idOf = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// File types that can be uploaded. PDFs and pictures open in the browser; the rest download.
const FILE_TYPES = {
  'application/pdf': 'pdf', 'image/jpeg': 'img', 'image/png': 'img', 'image/webp': 'img',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.ms-excel': 'doc', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'doc', 'text/plain': 'doc'
};
// Reads a data: URL; returns { mime, b64, size } or an error message.
function readUpload(data, max = MAX_PDF) {
  const m = /^data:([\w.+\-\/]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m || !FILE_TYPES[m[1]]) return { error: 'Choose a PDF, a picture (JPG/PNG), or a Word or Excel file.' };
  const size = Math.floor(m[2].length * 3 / 4);
  if (size > max) return { error: `The file is too large (${Math.round(max / 1048576)} MB at most).` };
  return { mime: m[1], b64: m[2], size };
}
const chunk = b64 => { const out = []; for (let i = 0; i < b64.length; i += CHUNK) out.push(b64.slice(i, i + CHUNK)); return out; };
function sendBytes(res, b64, mime, filename) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const inline = FILE_TYPES[mime] === 'pdf' || FILE_TYPES[mime] === 'img';
  res.setHeader('Content-Type', FILE_TYPES[mime] ? mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${String(filename).replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return res.status(200).end(bytes);
}
async function saveAttachment(ownerType, ownerId, filename, up) {
  const parts = chunk(up.b64), now = nowIso();
  const id = Number((await sql`INSERT INTO attachments(owner_type,owner_id,filename,mime,size,chunks,created_at) VALUES(${ownerType},${ownerId},${filename},${up.mime},${up.size},${parts.length},${now}) RETURNING id`)[0].id);
  await sqlBatch(parts.map((c, i) => ['INSERT INTO attachment_chunks(attachment_id,idx,data) VALUES(?,?,?)', id, i, c]));
  return id;
}
const attachmentsFor = (ownerType, ids) => ids.length ? sql(`SELECT id,owner_id,filename,mime,size,created_at FROM attachments WHERE owner_type=? AND owner_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`.split('?'), ownerType, ...ids) : [];
async function deleteAttachments(ownerType, ownerId) {
  const ids = (await sql`SELECT id FROM attachments WHERE owner_type=${ownerType} AND owner_id=${ownerId}`).map(r => Number(r.id));
  if (ids.length) await sqlBatch(ids.flatMap(i => [['DELETE FROM attachment_chunks WHERE attachment_id=?', i], ['DELETE FROM attachments WHERE id=?', i]]));
}

async function listResources() { return sql`SELECT id,title,kind,category,mime,filename,size,created_at,updated_at FROM resources ORDER BY CASE category WHEN 'Employee Handbook' THEN 0 WHEN 'SOP' THEN 1 ELSE 2 END, category, title`; }
async function sendPdf(res, id) {
  const r = (await sql`SELECT id,filename,mime,chunks FROM resources WHERE id=${id}`)[0];
  if (!r) return json(res, 404, { error: 'Not found.' });
  const parts = await sql`SELECT data FROM resource_chunks WHERE resource_id=${id} ORDER BY idx`;
  return sendBytes(res, parts.map(p => p.data).join(''), r.mime || 'application/pdf', r.filename);
}
async function vehiclesFor(where) {
  const v = where === 'all'
    ? await sql`SELECT v.*,e.name AS employee_name FROM vehicles v LEFT JOIN employees e ON e.id=v.employee_id WHERE v.active=1 ORDER BY v.year DESC,v.make`
    : await sql`SELECT v.*,e.name AS employee_name FROM vehicles v LEFT JOIN employees e ON e.id=v.employee_id WHERE v.active=1 AND v.employee_id=${where} ORDER BY v.year DESC`;
  const m = await sql`SELECT * FROM vehicle_maintenance ORDER BY date DESC, id DESC`;
  // Accident / incident notes are for the manager only.
  const inc = where === 'all' ? await sql`SELECT * FROM vehicle_incidents ORDER BY date DESC, id DESC` : [];
  const files = await attachmentsFor('incident', inc.map(i => Number(i.id)));
  return v.map(x => ({ ...x, alerts: vehicleAlerts(x), maintenance: m.filter(r => String(r.vehicle_id) === String(x.id)),
    incidents: where === 'all' ? inc.filter(i => String(i.vehicle_id) === String(x.id)).map(i => ({ ...i, files: files.filter(f => String(f.owner_id) === String(i.id)) })) : undefined }));
}

async function projectsFor(start, end, employeeId) {
  const rows = employeeId
    ? await sql`SELECT p.* FROM projects p JOIN project_employees pe ON pe.project_id=p.id WHERE pe.employee_id=${employeeId} AND p.start_date<=${end} AND p.end_date>=${start} ORDER BY p.start_date`
    : await sql`SELECT * FROM projects WHERE start_date<=${end} AND end_date>=${start} ORDER BY start_date`;
  const crew = await sql`SELECT pe.project_id,e.id,e.name FROM project_employees pe JOIN employees e ON e.id=pe.employee_id ORDER BY e.name`;
  return rows.map(p => ({ ...p, employees: crew.filter(c => String(c.project_id) === String(p.id)).map(c => ({ id: String(c.id), name: c.name })) }));
}

export default async function handler(req, res) {
  try {
    await ensure();
    const u = new URL(req.url, 'https://workclock.invalid'), b = req.body || {};
    const manager = await getManager(req), emp = manager ? null : await getEmployeeSession(req);
    if (!manager && !emp) return json(res, 401, { error: 'Login required.' });
    const file = idOf(u.searchParams.get('file'));
    if (req.method === 'GET' && file) return sendPdf(res, file);
    const att = idOf(u.searchParams.get('attachment'));
    if (req.method === 'GET' && att) {
      const a = (await sql`SELECT * FROM attachments WHERE id=${att}`)[0];
      if (!a) return json(res, 404, { error: 'Not found.' });
      if (!manager) {
        const allowed = a.owner_type === 'project' && (await sql`SELECT 1 FROM project_employees WHERE project_id=${a.owner_id} AND employee_id=${emp.id}`).length;
        if (!allowed) return json(res, 403, { error: 'Not allowed.' });
      }
      const parts = await sql`SELECT data FROM attachment_chunks WHERE attachment_id=${att} ORDER BY idx`;
      return sendBytes(res, parts.map(p => p.data).join(''), a.mime, a.filename);
    }
    const area = u.searchParams.get('area') || b.area;
    const range = () => { const s = day(u.searchParams.get('start')) || '0000-01-01', e = day(u.searchParams.get('end')) || '9999-12-31'; return [s, e]; };

    if (emp) {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      if (area === 'resources') return json(res, 200, { resources: await listResources() });
      if (area === 'vehicles') return json(res, 200, { vehicles: await vehiclesFor(emp.id) });
      if (area === 'projects') { const [s, e] = range(); return json(res, 200, { projects: await projectsFor(s, e, emp.id) }); }
      if (area === 'menu') {
        const v = await sql`SELECT count(*) AS n FROM vehicles WHERE active=1 AND employee_id=${emp.id}`;
        return json(res, 200, { hasVehicle: v[0].n > 0 });
      }
      return json(res, 400, { error: 'Unknown area.' });
    }

    if (req.method === 'GET') {
      if (area === 'resources') return json(res, 200, { resources: await listResources() });
      if (area === 'vehicles') return json(res, 200, { vehicles: await vehiclesFor('all') });
      if (area === 'vehicle_alerts') {
        const v = await sql`SELECT id,year,make,model,plate,reg_expires,insp_expires FROM vehicles WHERE active=1`;
        return json(res, 200, { alerts: v.flatMap(x => vehicleAlerts(x).map(a => ({ ...a, vehicle_id: x.id, vehicle: [x.year, x.make, x.model].filter(Boolean).join(' '), plate: x.plate }))) });
      }
      if (area === 'projects') { const [s, e] = range(); return json(res, 200, { projects: await projectsFor(s, e, null) }); }
      return json(res, 400, { error: 'Unknown area.' });
    }
    if (!requireSameOrigin(req, res)) return;
    const now = nowIso();

    // ---- Resources
    if (b.action === 'resource_save') {
      const title = txt(b.title, 120), category = txt(b.category, 40) || 'Other';
      const kind = category === 'Employee Handbook' ? 'handbook' : category === 'SOP' ? 'sop' : 'other';
      if (!title) return json(res, 400, { error: 'Give the document a name.' });
      if (category === null) return json(res, 400, { error: 'The category must be 40 characters or fewer.' });
      const id = idOf(b.id);
      if (b.data) {
        const up = readUpload(b.data);
        if (up.error) return json(res, 400, { error: up.error });
        const size = up.size, mime = up.mime;
        const filename = txt(b.filename, 150) || 'document';
        const chunks = chunk(up.b64);
        let rid = id;
        if (rid) await sql`UPDATE resources SET title=${title},kind=${kind},category=${category},mime=${mime},filename=${filename},size=${size},chunks=${chunks.length},updated_at=${now} WHERE id=${rid}`;
        else rid = Number((await sql`INSERT INTO resources(title,kind,category,mime,filename,size,chunks,created_at,updated_at) VALUES(${title},${kind},${category},${mime},${filename},${size},${chunks.length},${now},${now}) RETURNING id`)[0].id);
        await sqlBatch([['DELETE FROM resource_chunks WHERE resource_id=?', rid], ...chunks.map((c, i) => ['INSERT INTO resource_chunks(resource_id,idx,data) VALUES(?,?,?)', rid, i, c])]);
        await audit('manager', manager.id, 'resource_uploaded', { id: rid, title, size });
        return json(res, 200, { ok: true, id: rid });
      }
      if (!id) return json(res, 400, { error: 'Choose a file.' });
      await sql`UPDATE resources SET title=${title},kind=${kind},category=${category},updated_at=${now} WHERE id=${id}`;
      return json(res, 200, { ok: true, id });
    }
    if (b.action === 'resource_delete') {
      const id = idOf(b.id); if (!id) return json(res, 400, { error: 'Choose a document.' });
      await sqlBatch([['DELETE FROM resource_chunks WHERE resource_id=?', id], ['DELETE FROM resources WHERE id=?', id]]);
      await audit('manager', manager.id, 'resource_deleted', { id });
      return json(res, 200, { ok: true });
    }

    // ---- Vehicles
    if (b.action === 'vehicle_save') {
      const id = idOf(b.id), year = b.year === '' || b.year == null ? null : Number(b.year);
      if (year != null && (!Number.isInteger(year) || year < 1950 || year > 2100)) return json(res, 400, { error: 'Enter a valid year.' });
      const make = txt(b.make, 40), model = txt(b.model, 60), vin = txt(String(b.vin || '').toUpperCase(), 20), plate = txt(String(b.plate || '').toUpperCase(), 15), notes = txt(b.notes, 500);
      if (!make || !model) return json(res, 400, { error: 'Enter the make and model.' });
      if (make === null || model === null || vin === null || plate === null || notes === null) return json(res, 400, { error: 'One of the fields is too long.' });
      if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) return json(res, 400, { error: 'The VIN should be 17 letters and numbers (no I, O or Q).' });
      const empId = b.employeeId ? idOf(b.employeeId) : null;
      const odo = b.odometerPurchase === '' || b.odometerPurchase == null ? null : Number(b.odometerPurchase);
      if (odo != null && (!Number.isInteger(odo) || odo < 0 || odo > 2000000)) return json(res, 400, { error: 'The odometer at purchase must be a whole number of miles.' });
      const regDate = b.regDate ? day(b.regDate) : null, regExp = b.regExpires ? day(b.regExpires) : null;
      const inspMonth = b.inspMonth ? month(b.inspMonth) : null, inspExp = b.inspExpires ? month(b.inspExpires) : null;
      if ((b.regDate && !regDate) || (b.regExpires && !regExp)) return json(res, 400, { error: 'Enter the registration dates as full dates.' });
      if ((b.inspMonth && !inspMonth) || (b.inspExpires && !inspExp)) return json(res, 400, { error: 'Enter the inspection dates as month and year.' });
      if (regDate && regExp && regExp < regDate) return json(res, 400, { error: 'The registration expires before its date. Check the dates.' });
      if (inspMonth && inspExp && inspExp < inspMonth) return json(res, 400, { error: 'The inspection expires before its date. Check the dates.' });
      if (id) await sql`UPDATE vehicles SET year=${year},make=${make},model=${model},vin=${vin || null},plate=${plate || null},employee_id=${empId},notes=${notes || null},odometer_purchase=${odo},reg_date=${regDate},reg_expires=${regExp},insp_month=${inspMonth},insp_expires=${inspExp},updated_at=${now} WHERE id=${id}`;
      else await sql`INSERT INTO vehicles(year,make,model,vin,plate,employee_id,notes,odometer_purchase,reg_date,reg_expires,insp_month,insp_expires,active,created_at,updated_at) VALUES(${year},${make},${model},${vin || null},${plate || null},${empId},${notes || null},${odo},${regDate},${regExp},${inspMonth},${inspExp},1,${now},${now})`;
      await audit('manager', manager.id, id ? 'vehicle_updated' : 'vehicle_added', { id, make, model, employee_id: empId });
      return json(res, 200, { ok: true });
    }
    if (b.action === 'vehicle_remove') {
      const id = idOf(b.id); if (!id) return json(res, 400, { error: 'Choose a vehicle.' });
      await sql`UPDATE vehicles SET active=0,employee_id=NULL,updated_at=${now} WHERE id=${id}`;
      await audit('manager', manager.id, 'vehicle_removed', { id });
      return json(res, 200, { ok: true });
    }
    if (b.action === 'maintenance_add') {
      const vid = idOf(b.vehicleId), d = day(b.date), type = txt(b.type, 80), notes = txt(b.notes, 500);
      if (!vid || !d || !type) return json(res, 400, { error: 'Enter the date and what was done.' });
      const mileage = b.mileage === '' || b.mileage == null ? null : Number(b.mileage), cost = b.cost === '' || b.cost == null ? null : Number(b.cost);
      if (mileage != null && (!Number.isInteger(mileage) || mileage < 0)) return json(res, 400, { error: 'Mileage must be a whole number.' });
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) return json(res, 400, { error: 'Cost must be 0 or more.' });
      await sql`INSERT INTO vehicle_maintenance(vehicle_id,date,type,mileage,cost,notes,created_at) VALUES(${vid},${d},${type},${mileage},${cost},${notes || null},${now})`;
      await audit('manager', manager.id, 'vehicle_maintenance_added', { vehicle_id: vid, date: d, type });
      return json(res, 200, { ok: true });
    }
    if (b.action === 'incident_add') {
      const vid = idOf(b.vehicleId), d = day(b.date), notes = txt(String(b.notes || '').replace(/\s+/g, ' '), 2000);
      if (!vid || !d) return json(res, 400, { error: 'Choose the date of the accident or incident.' });
      if (!notes) return json(res, 400, { error: notes === null ? 'The notes must be 2,000 characters or fewer.' : 'Write what happened.' });
      const files = Array.isArray(b.files) ? b.files.slice(0, 11) : [];
      if (files.length > 10) return json(res, 400, { error: 'Up to 10 photos or files per entry.' });
      const ups = [];
      for (const f of files) { const up = readUpload(f.data, 6 * 1048576); if (up.error) return json(res, 400, { error: `${String(f.name || 'File')}: ${up.error}` }); ups.push([txt(f.name, 150) || 'file', up]); }
      if (!(await sql`SELECT 1 FROM vehicles WHERE id=${vid}`).length) return json(res, 404, { error: 'Vehicle not found.' });
      const iid = Number((await sql`INSERT INTO vehicle_incidents(vehicle_id,date,notes,created_at) VALUES(${vid},${d},${notes},${now}) RETURNING id`)[0].id);
      for (const [name, up] of ups) await saveAttachment('incident', iid, name, up);
      await audit('manager', manager.id, 'vehicle_incident_added', { vehicle_id: vid, id: iid, files: ups.length });
      return json(res, 200, { ok: true, id: iid });
    }
    if (b.action === 'incident_file_add') {
      const iid = idOf(b.id); if (!iid || !(await sql`SELECT 1 FROM vehicle_incidents WHERE id=${iid}`).length) return json(res, 404, { error: 'Entry not found.' });
      const up = readUpload(b.data, 6 * 1048576); if (up.error) return json(res, 400, { error: up.error });
      await saveAttachment('incident', iid, txt(b.name, 150) || 'file', up);
      return json(res, 200, { ok: true });
    }
    if (b.action === 'incident_delete') {
      const iid = idOf(b.id); if (!iid) return json(res, 400, { error: 'Choose an entry.' });
      await deleteAttachments('incident', iid);
      await sql`DELETE FROM vehicle_incidents WHERE id=${iid}`;
      await audit('manager', manager.id, 'vehicle_incident_deleted', { id: iid });
      return json(res, 200, { ok: true });
    }
    if (b.action === 'maintenance_delete') {
      const id = idOf(b.id); if (!id) return json(res, 400, { error: 'Choose an entry.' });
      await sql`DELETE FROM vehicle_maintenance WHERE id=${id}`;
      return json(res, 200, { ok: true });
    }

    // ---- Projects
    if (b.action === 'project_save') {
      const id = idOf(b.id), name = txt(b.name, 120), address = txt(b.address, 300), s = day(b.start_date), e = day(b.end_date), notes = txt(b.notes, 1000);
      if (!name || !address) return json(res, 400, { error: 'Enter the project name and address.' });
      if (!s || !e || e < s) return json(res, 400, { error: 'Choose a start day and a finish day on or after it.' });
      if (notes === null) return json(res, 400, { error: 'Notes are too long.' });
      const emps = [...new Set((Array.isArray(b.employees) ? b.employees : []).map(idOf).filter(Boolean))];
      let pid = id;
      if (pid) await sql`UPDATE projects SET name=${name},address=${address},start_date=${s},end_date=${e},notes=${notes || null},updated_at=${now} WHERE id=${pid}`;
      else pid = Number((await sql`INSERT INTO projects(name,address,start_date,end_date,notes,created_at,updated_at) VALUES(${name},${address},${s},${e},${notes || null},${now},${now}) RETURNING id`)[0].id);
      await sqlBatch([['DELETE FROM project_employees WHERE project_id=?', pid], ...emps.map(x => ['INSERT OR IGNORE INTO project_employees(project_id,employee_id) VALUES(?,?)', pid, x])]);
      await audit('manager', manager.id, id ? 'project_updated' : 'project_added', { id: pid, name, employees: emps.length });
      return json(res, 200, { ok: true, id: pid });
    }
    if (b.action === 'project_delete') {
      const id = idOf(b.id); if (!id) return json(res, 400, { error: 'Choose a project.' });
      await sqlBatch([['DELETE FROM project_employees WHERE project_id=?', id], ['DELETE FROM projects WHERE id=?', id]]);
      await audit('manager', manager.id, 'project_deleted', { id });
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'Unknown action.' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}
