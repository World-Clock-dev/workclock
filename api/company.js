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
  `CREATE INDEX IF NOT EXISTS projects_dates ON projects(start_date, end_date)`
];
let ready = false;
async function ensure() { if (ready) return; await sqlBatch(SCHEMA.map(s => [s])); ready = true; }

const MAX_PDF = 8 * 1024 * 1024, CHUNK = 900_000;
const txt = (v, max) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? s : null; };
const day = v => { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null; };
const idOf = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function listResources() { return sql`SELECT id,title,kind,filename,size,created_at,updated_at FROM resources ORDER BY CASE kind WHEN 'handbook' THEN 0 WHEN 'sop' THEN 1 ELSE 2 END, title`; }
async function sendPdf(res, id) {
  const r = (await sql`SELECT id,filename,chunks FROM resources WHERE id=${id}`)[0];
  if (!r) return json(res, 404, { error: 'Not found.' });
  const parts = await sql`SELECT data FROM resource_chunks WHERE resource_id=${id} ORDER BY idx`;
  const bin = atob(parts.map(p => p.data).join(''));
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(r.filename).replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).end(bytes);
}

async function vehiclesFor(where) {
  const v = where === 'all'
    ? await sql`SELECT v.*,e.name AS employee_name FROM vehicles v LEFT JOIN employees e ON e.id=v.employee_id WHERE v.active=1 ORDER BY v.year DESC,v.make`
    : await sql`SELECT v.*,e.name AS employee_name FROM vehicles v LEFT JOIN employees e ON e.id=v.employee_id WHERE v.active=1 AND v.employee_id=${where} ORDER BY v.year DESC`;
  const m = await sql`SELECT * FROM vehicle_maintenance ORDER BY date DESC, id DESC`;
  return v.map(x => ({ ...x, maintenance: m.filter(r => String(r.vehicle_id) === String(x.id)) }));
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
      if (area === 'projects') { const [s, e] = range(); return json(res, 200, { projects: await projectsFor(s, e, null) }); }
      return json(res, 400, { error: 'Unknown area.' });
    }
    if (!requireSameOrigin(req, res)) return;
    const now = nowIso();

    // ---- Resources
    if (b.action === 'resource_save') {
      const title = txt(b.title, 120), kind = ['handbook', 'sop', 'other'].includes(b.kind) ? b.kind : 'other';
      if (!title) return json(res, 400, { error: 'Give the document a title.' });
      const id = idOf(b.id);
      if (b.data) {
        const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data));
        if (!m) return json(res, 400, { error: 'Choose a PDF file.' });
        const size = Math.floor(m[1].length * 3 / 4);
        if (size > MAX_PDF) return json(res, 400, { error: 'The PDF is too large (8 MB at most).' });
        const filename = txt(b.filename, 150) || 'document.pdf';
        const chunks = []; for (let i = 0; i < m[1].length; i += CHUNK) chunks.push(m[1].slice(i, i + CHUNK));
        let rid = id;
        if (rid) await sql`UPDATE resources SET title=${title},kind=${kind},filename=${filename},size=${size},chunks=${chunks.length},updated_at=${now} WHERE id=${rid}`;
        else rid = Number((await sql`INSERT INTO resources(title,kind,filename,size,chunks,created_at,updated_at) VALUES(${title},${kind},${filename},${size},${chunks.length},${now},${now}) RETURNING id`)[0].id);
        await sqlBatch([['DELETE FROM resource_chunks WHERE resource_id=?', rid], ...chunks.map((c, i) => ['INSERT INTO resource_chunks(resource_id,idx,data) VALUES(?,?,?)', rid, i, c])]);
        await audit('manager', manager.id, 'resource_uploaded', { id: rid, title, size });
        return json(res, 200, { ok: true, id: rid });
      }
      if (!id) return json(res, 400, { error: 'Choose a PDF file.' });
      await sql`UPDATE resources SET title=${title},kind=${kind},updated_at=${now} WHERE id=${id}`;
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
      if (id) await sql`UPDATE vehicles SET year=${year},make=${make},model=${model},vin=${vin || null},plate=${plate || null},employee_id=${empId},notes=${notes || null},updated_at=${now} WHERE id=${id}`;
      else await sql`INSERT INTO vehicles(year,make,model,vin,plate,employee_id,notes,active,created_at,updated_at) VALUES(${year},${make},${model},${vin || null},${plate || null},${empId},${notes || null},1,${now},${now})`;
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
