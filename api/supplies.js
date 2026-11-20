import { vacationSummary } from './_vacation.js';
import { sql, sqlBatch, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';

/* Tools & Supplies.
   Employees ask for supplies from their page; the manager sees the request in
   the Supplies section, hands the supplies out and marks it Given (the given
   quantities come off the shelf) or Rejects it. The manager keeps the item list
   and sets each item's shelf quantity whenever they like. No prices anywhere.

   Tables are created here on first use, so the feature needs no manual
   database step. Every change to a shelf quantity is written to
   supply_stock_log, which nobody can edit or delete from the app. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS supply_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Other',
     unit TEXT NOT NULL DEFAULT 'Piece',
     quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
     low_at INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS supply_requests (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     status TEXT NOT NULL DEFAULT 'pending',
     note TEXT,
     manager_note TEXT,
     created_at TEXT NOT NULL,
     decided_at TEXT,
     decided_by INTEGER)`,
  `CREATE INDEX IF NOT EXISTS supply_requests_status ON supply_requests(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS supply_requests_employee ON supply_requests(employee_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS supply_request_lines (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     request_id INTEGER NOT NULL REFERENCES supply_requests(id),
     item_id INTEGER NOT NULL REFERENCES supply_items(id),
     item_name TEXT NOT NULL,
     unit TEXT NOT NULL,
     qty_requested INTEGER NOT NULL,
     qty_given INTEGER)`,
  `CREATE INDEX IF NOT EXISTS supply_request_lines_request ON supply_request_lines(request_id)`,
  `CREATE TABLE IF NOT EXISTS supply_stock_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     item_id INTEGER NOT NULL REFERENCES supply_items(id),
     item_name TEXT NOT NULL,
     change INTEGER NOT NULL,
     quantity_after INTEGER NOT NULL,
     reason TEXT NOT NULL,
     request_id INTEGER,
     employee_id INTEGER,
     created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS supply_stock_log_created ON supply_stock_log(created_at)`,
  `CREATE TABLE IF NOT EXISTS uniform_requests (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     status TEXT NOT NULL DEFAULT 'pending',
     note TEXT,
     manager_note TEXT,
     created_at TEXT NOT NULL,
     decided_at TEXT,
     decided_by INTEGER)`,
  `CREATE INDEX IF NOT EXISTS uniform_requests_status ON uniform_requests(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS uniform_request_lines (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     request_id INTEGER NOT NULL REFERENCES uniform_requests(id),
     item TEXT NOT NULL,
     size TEXT NOT NULL,
     qty INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS uniform_request_lines_request ON uniform_request_lines(request_id)`
];

/* Starting catalog from the Tools & Supplies specification (paint and
   coatings excluded). Quantities start at 0 for the manager to set. */
const STARTING_CATALOG = [
  ['Tape', 'Roll', ['Blue painter tape 1"', 'Blue painter tape 1.5"', 'Blue painter tape 2"', 'Green delicate-surface tape']],
  ['Rollers', 'Piece', ['9" roller cover', '14" roller cover', '4" roller cover', '9" roller frame', '14" roller frame', '4" roller frame']],
  ['Brushes', 'Piece', ['2" paintbrush', '2.5" paintbrush', '3" paintbrush']],
  ['Buckets', 'Piece', ['5-gallon bucket', 'Handheld paint pail', 'Bucket grid']],
  ['Trays', 'Piece', ['Paint tray', 'Disposable tray liner']],
  ['Protection', 'Piece', ['Plastic drop cloth', 'Canvas drop cloth', 'Plastic covering box/dispenser']],
  ['Protection', 'Roll', ['Masking plastic', 'Masking paper', 'Floor protection paper']],
  ['Preparation', 'Piece', ['Sandpaper sheets', 'Sanding sponges', 'Sanding discs', 'Scrapers', 'Putty knives', 'Caulking gun']],
  ['Preparation', 'Pack', ['Utility knife blades', 'Rags']],
  ['Cleaning', 'Piece', ['Cleaning sponges', 'Cleaning brushes']],
  ['Cleaning', 'Roll', ['Trash bags']],
  ['Accessories', 'Piece', ['Extension poles', 'Roller bucket screens', 'Paint strainers']],
  ['Accessories', 'Pack', ['Mixing sticks']],
  ['Safety', 'Box', ['Disposable gloves', 'Dust masks']],
  ['Safety', 'Piece', ['Safety glasses']]
];

let ready = false;
async function ensureTables() {
  if (ready) return;
  await sqlBatch(SCHEMA.map(s => [s]));
  // Later additions: full-stock amount (for the 20% alert) and soft delete.
  const cols = (await sql`SELECT name FROM pragma_table_info('supply_items')`).map(c => c.name);
  const mig = [];
  if (!cols.includes('full_qty')) mig.push(['ALTER TABLE supply_items ADD COLUMN full_qty INTEGER NOT NULL DEFAULT 0']);
  if (!cols.includes('deleted_at')) mig.push(['ALTER TABLE supply_items ADD COLUMN deleted_at TEXT']);
  const ucols = (await sql`SELECT name FROM pragma_table_info('uniform_request_lines')`).map(c => c.name);
  if (!ucols.includes('unit_price')) mig.push(['ALTER TABLE uniform_request_lines ADD COLUMN unit_price REAL']);
  // employee_seen = 0 once the manager decides, until the painter opens that page.
  for (const t of ['supply_requests', 'uniform_requests']) {
    const c = (await sql([`SELECT name FROM pragma_table_info('${t}')`])).map(x => x.name);
    if (!c.includes('employee_seen')) mig.push([`ALTER TABLE ${t} ADD COLUMN employee_seen INTEGER NOT NULL DEFAULT 1`]);
  }
  if (mig.length) await sqlBatch(mig);
  // A deleted item's name can be used again.
  await sqlBatch([['DROP INDEX IF EXISTS supply_items_name'], ['CREATE UNIQUE INDEX IF NOT EXISTS supply_items_live_name ON supply_items(lower(name)) WHERE deleted_at IS NULL']]);
  const n = await sql`SELECT count(*) AS n FROM supply_items`;
  if (!n[0].n) {
    const now = nowIso();
    const rows = [];
    for (const [cat, unit, names] of STARTING_CATALOG) for (const name of names)
      rows.push(['INSERT OR IGNORE INTO supply_items(name,category,unit,quantity,low_at,active,created_at,updated_at) VALUES(?,?,?,0,0,1,?,?)', name, cat, unit, now, now]);
    await sqlBatch(rows);
  }
  ready = true;
}

/* Uniform items and sizes. Keys are stored; the pages show the names. */
export const UNIFORM_ITEMS = ['tshirt_half', 'tshirt_full', 'trousers', 'jacket'];
export const UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const MAX_QTY = 100000, MAX_LINES = 40, MAX_OPEN_PER_EMPLOYEE = 5;
const cleanText = (v, max) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? s : null; };
const wholeNumber = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

async function linesFor(requestIds) {
  if (!requestIds.length) return new Map();
  const rows = [];
  for (let i = 0; i < requestIds.length; i += 90) {
    const part = requestIds.slice(i, i + 90);
    const strings = ['SELECT l.id,l.request_id,l.item_id,l.item_name,l.unit,l.qty_requested,l.qty_given,i.quantity AS on_shelf FROM supply_request_lines l LEFT JOIN supply_items i ON i.id=l.item_id WHERE l.request_id IN ('];
    part.forEach((_, k) => strings.push(k < part.length - 1 ? ',' : ') ORDER BY l.id'));
    rows.push(...await sql(strings, ...part));
  }
  const map = new Map();
  for (const r of rows) { if (!map.has(r.request_id)) map.set(r.request_id, []); map.get(r.request_id).push(r); }
  return map;
}
async function withLines(requests) {
  const map = await linesFor(requests.map(r => Number(r.id)));
  return requests.map(r => ({ ...r, lines: map.get(Number(r.id)) || [] }));
}

/* Uniform prices live in app_settings as uniform_price_<item>; $20 each unless changed. */
const DEFAULT_UNIFORM_PRICE = 20;
async function uniformPrices() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key LIKE 'uniform_price_%'`;
  const map = Object.fromEntries(rows.map(r => [r.key.slice('uniform_price_'.length), Number(r.value)]));
  return Object.fromEntries(UNIFORM_ITEMS.map(k => [k, Number.isFinite(map[k]) ? map[k] : DEFAULT_UNIFORM_PRICE]));
}
const money = v => Math.round(Number(v) * 100) / 100;
const lineAmount = (l, prices) => money(Number(l.qty) * (l.unit_price != null ? Number(l.unit_price) : prices[l.item] ?? DEFAULT_UNIFORM_PRICE));

const lowItems = () => sql`SELECT id,name,unit,quantity,full_qty FROM supply_items
  WHERE deleted_at IS NULL AND active=1 AND full_qty>0 AND quantity*5<full_qty ORDER BY CAST(quantity AS REAL)/full_qty, name`;

async function uniformLines(ids) {
  if (!ids.length) return new Map();
  const map = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const strings = ['SELECT id,request_id,item,size,qty,unit_price FROM uniform_request_lines WHERE request_id IN ('];
    part.forEach((_, k) => strings.push(k < part.length - 1 ? ',' : ') ORDER BY id'));
    for (const r of await sql(strings, ...part)) { if (!map.has(r.request_id)) map.set(r.request_id, []); map.get(r.request_id).push(r); }
  }
  return map;
}
async function withUniformLines(reqs) {
  const m = await uniformLines(reqs.map(r => Number(r.id))), prices = await uniformPrices();
  return reqs.map(r => { const lines = (m.get(Number(r.id)) || []).map(l => ({ ...l, unit_price: l.unit_price != null ? Number(l.unit_price) : prices[l.item], amount: lineAmount(l, prices) })); return { ...r, lines, total: money(lines.reduce((a, l) => a + l.amount, 0)) }; });
}

/* ---------------- Employee ---------------- */
async function employeeSide(req, res, emp) {
  const b = req.body || {};
  if (req.method === 'GET') {
    const u = new URL(req.url, 'https://workclock.invalid');
    if (u.searchParams.get('count')) {
      const a = await sql`SELECT count(*) AS n FROM supply_requests WHERE employee_id=${emp.id} AND employee_seen=0`;
      const c = await sql`SELECT count(*) AS n FROM uniform_requests WHERE employee_id=${emp.id} AND employee_seen=0`;
      return json(res, 200, { supplies: a[0].n, uniforms: c[0].n });
    }
    if (u.searchParams.get('vacation')) {
      const year = new Date().getUTCFullYear();
      const mine = (await vacationSummary(year)).find(r => String(r.employee_id) === String(emp.id)) || null;
      return json(res, 200, { year, vacation: mine && { year_paid_hours: mine.year_paid_hours, year_earned: mine.year_earned, all_earned: mine.all_earned, used_hours: mine.used_hours, balance: mine.balance } });
    }
    if (u.searchParams.get('deductions')) {
      const start = u.searchParams.get('start'), end = u.searchParams.get('end');
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Valid start and end are required.' });
      const given = await sql`SELECT id,decided_at FROM uniform_requests WHERE employee_id=${emp.id} AND status='given' AND decided_at>=${new Date(start).toISOString()} AND decided_at<${new Date(end).toISOString()}`;
      const reqs = await withUniformLines(given);
      return json(res, 200, { total: money(reqs.reduce((a, r) => a + r.total, 0)), lines: reqs.flatMap(r => r.lines.map(l => ({ item: l.item, size: l.size, qty: l.qty, amount: l.amount }))) });
    }
    if (u.searchParams.get('seen')) {
      if (u.searchParams.get('uniforms')) await sql`UPDATE uniform_requests SET employee_seen=1 WHERE employee_id=${emp.id} AND employee_seen=0`;
      else await sql`UPDATE supply_requests SET employee_seen=1 WHERE employee_id=${emp.id} AND employee_seen=0`;
    }
    if (u.searchParams.get('uniforms')) {
      const ur = await sql`SELECT id,status,note,manager_note,created_at,decided_at FROM uniform_requests WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 30`;
      return json(res, 200, { items: UNIFORM_ITEMS, sizes: UNIFORM_SIZES, prices: await uniformPrices(), requests: await withUniformLines(ur) });
    }
    const items = await sql`SELECT id,name,category,unit FROM supply_items WHERE active=1 AND deleted_at IS NULL ORDER BY category,name`;
    const requests = await sql`SELECT id,status,note,manager_note,created_at,decided_at FROM supply_requests WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 30`;
    const out = await withLines(requests);
    out.forEach(r => r.lines.forEach(l => { delete l.on_shelf; }));
    return json(res, 200, { items, requests: out });
  }
  if (!requireSameOrigin(req, res)) return;
  if (req.method === 'POST' && b.action === 'request') {
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!lines.length) return json(res, 400, { error: 'Choose at least one item.', code: 'SUPPLY_EMPTY' });
    if (lines.length > MAX_LINES) return json(res, 400, { error: `Up to ${MAX_LINES} items per request.` });
    const note = cleanText(b.note, 500); if (note === null) return json(res, 400, { error: 'The note must be 500 characters or fewer.' });
    const wanted = new Map();
    for (const l of lines) {
      const id = wholeNumber(l.item_id, 1, Number.MAX_SAFE_INTEGER), qty = wholeNumber(l.qty, 1, 999);
      if (!id || !qty) return json(res, 400, { error: 'Each item needs a quantity from 1 to 999.', code: 'SUPPLY_QTY' });
      wanted.set(id, (wanted.get(id) || 0) + qty);
    }
    const open = await sql`SELECT count(*) AS n FROM supply_requests WHERE employee_id=${emp.id} AND status='pending'`;
    if (open[0].n >= MAX_OPEN_PER_EMPLOYEE) return json(res, 400, { error: 'You already have several requests waiting. Wait for the manager, or cancel one.', code: 'SUPPLY_TOO_MANY' });
    const items = await sql`SELECT id,name,unit FROM supply_items WHERE active=1 AND deleted_at IS NULL`;
    const byId = new Map(items.map(i => [Number(i.id), i]));
    for (const id of wanted.keys()) if (!byId.has(id)) return json(res, 400, { error: 'One of the items is no longer available. Refresh and try again.', code: 'SUPPLY_GONE' });
    const now = nowIso();
    const created = await sql`INSERT INTO supply_requests(employee_id,status,note,created_at) VALUES(${emp.id},'pending',${note || null},${now}) RETURNING id`;
    const rid = Number(created[0].id);
    await sqlBatch([...wanted].map(([id, qty]) => ['INSERT INTO supply_request_lines(request_id,item_id,item_name,unit,qty_requested) VALUES(?,?,?,?,?)', rid, id, byId.get(id).name, byId.get(id).unit, qty]));
    await audit('employee', emp.id, 'supply_requested', { request_id: rid, items: wanted.size });
    return json(res, 200, { ok: true, id: rid });
  }
  if (req.method === 'POST' && b.action === 'uniform_request') {
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!lines.length) return json(res, 400, { error: 'Choose at least one item and size.', code: 'UNIFORM_EMPTY' });
    if (lines.length > 20) return json(res, 400, { error: 'Too many lines in one request.' });
    const note = cleanText(b.note, 500); if (note === null) return json(res, 400, { error: 'The note must be 500 characters or fewer.' });
    const clean = [];
    for (const l of lines) {
      const qty = wholeNumber(l.qty, 1, 20);
      if (!UNIFORM_ITEMS.includes(l.item) || !UNIFORM_SIZES.includes(l.size) || !qty) return json(res, 400, { error: 'Choose an item, a size and a quantity from 1 to 20.', code: 'UNIFORM_BAD' });
      clean.push([l.item, l.size, qty]);
    }
    const open = await sql`SELECT count(*) AS n FROM uniform_requests WHERE employee_id=${emp.id} AND status='pending'`;
    if (open[0].n >= 3) return json(res, 400, { error: 'You already have uniform requests waiting.', code: 'UNIFORM_TOO_MANY' });
    const prices = await uniformPrices();
    const rid = Number((await sql`INSERT INTO uniform_requests(employee_id,status,note,created_at) VALUES(${emp.id},'pending',${note || null},${nowIso()}) RETURNING id`)[0].id);
    await sqlBatch(clean.map(([item, size, qty]) => ['INSERT INTO uniform_request_lines(request_id,item,size,qty,unit_price) VALUES(?,?,?,?,?)', rid, item, size, qty, prices[item]]));
    await audit('employee', emp.id, 'uniform_requested', { request_id: rid });
    return json(res, 200, { ok: true, id: rid });
  }
  if (req.method === 'POST' && b.action === 'uniform_cancel') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    const rows = await sql`UPDATE uniform_requests SET status='cancelled',decided_at=${nowIso()} WHERE id=${id} AND employee_id=${emp.id} AND status='pending' RETURNING id`;
    if (!rows.length) return json(res, 400, { error: 'This request has already been handled.', code: 'SUPPLY_HANDLED' });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && b.action === 'cancel') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    const rows = await sql`UPDATE supply_requests SET status='cancelled',decided_at=${nowIso()} WHERE id=${id} AND employee_id=${emp.id} AND status='pending' RETURNING id`;
    if (!rows.length) return json(res, 400, { error: 'This request has already been handled.', code: 'SUPPLY_HANDLED' });
    await audit('employee', emp.id, 'supply_request_cancelled', { request_id: id });
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

/* ---------------- Manager ---------------- */
async function managerSide(req, res, manager) {
  const b = req.body || {};
  const u = new URL(req.url, 'https://workclock.invalid');
  if (req.method === 'GET') {
    const pending = await sql`SELECT count(*) AS n FROM supply_requests WHERE status='pending'`;
    if (u.searchParams.get('count')) {
      const latest = await sql`SELECT r.id,e.name AS employee_name FROM supply_requests r JOIN employees e ON e.id=r.employee_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 1`;
      const up = await sql`SELECT count(*) AS n FROM uniform_requests WHERE status='pending'`;
      const ulatest = await sql`SELECT r.id,e.name AS employee_name FROM uniform_requests r JOIN employees e ON e.id=r.employee_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 1`;
      return json(res, 200, { pending: pending[0].n, latest: latest[0] || null, uniformPending: up[0].n, uniformLatest: ulatest[0] || null, low: await lowItems() });
    }
    if (u.searchParams.get('uniforms')) {
      const ur = await sql`SELECT r.id,r.status,r.note,r.manager_note,r.created_at,r.decided_at,e.name AS employee_name,e.title AS employee_title
        FROM uniform_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status='pending' OR r.created_at>=${new Date(Date.now() - 180 * 86400000).toISOString()}
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 300`;
      return json(res, 200, { items: UNIFORM_ITEMS, sizes: UNIFORM_SIZES, prices: await uniformPrices(), requests: await withUniformLines(ur) });
    }
    if (u.searchParams.get('deductions')) {
      // Uniforms handed out in the week: their cost comes off that week's pay.
      const start = u.searchParams.get('start'), end = u.searchParams.get('end');
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Valid start and end are required.' });
      const given = await sql`SELECT r.id,r.employee_id,r.decided_at,e.name AS employee_name FROM uniform_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status='given' AND r.decided_at>=${new Date(start).toISOString()} AND r.decided_at<${new Date(end).toISOString()} ORDER BY e.name,r.decided_at`;
      const reqs = await withUniformLines(given);
      const by = new Map();
      for (const r of reqs) {
        const k = String(r.employee_id);
        if (!by.has(k)) by.set(k, { employee_id: k, name: r.employee_name, total: 0, lines: [] });
        const d = by.get(k); d.total = money(d.total + r.total); d.lines.push(...r.lines.map(l => ({ item: l.item, size: l.size, qty: l.qty, amount: l.amount, given_at: r.decided_at })));
      }
      return json(res, 200, { deductions: [...by.values()] });
    }
    if (u.searchParams.get('usage')) {
      const start = u.searchParams.get('start'), end = u.searchParams.get('end');
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Valid start and end are required.' });
      const s0 = new Date(start).toISOString(), e0 = new Date(end).toISOString();
      const asked = await sql`SELECT r.employee_id,e.name,count(DISTINCT r.id) AS requests,sum(l.qty_requested) AS asked
        FROM supply_requests r JOIN employees e ON e.id=r.employee_id JOIN supply_request_lines l ON l.request_id=r.id
        WHERE r.created_at>=${s0} AND r.created_at<${e0} AND r.status<>'cancelled' GROUP BY r.employee_id,e.name`;
      const given = await sql`SELECT r.employee_id,e.name,sum(COALESCE(l.qty_given,0)) AS given
        FROM supply_requests r JOIN employees e ON e.id=r.employee_id JOIN supply_request_lines l ON l.request_id=r.id
        WHERE r.status='given' AND r.decided_at>=${s0} AND r.decided_at<${e0} GROUP BY r.employee_id,e.name`;
      const people = new Map();
      for (const a of asked) people.set(String(a.employee_id), { employee_id: String(a.employee_id), name: a.name, requests: a.requests, asked: a.asked || 0, given: 0 });
      for (const g of given) { const k = String(g.employee_id); if (!people.has(k)) people.set(k, { employee_id: k, name: g.name, requests: 0, asked: 0, given: 0 }); people.get(k).given = g.given || 0; }
      return json(res, 200, { usage: [...people.values()].sort((a, b) => b.given - a.given || b.asked - a.asked || String(a.name).localeCompare(String(b.name))) });
    }
    const items = await sql`SELECT id,name,category,unit,quantity,low_at,full_qty,active,updated_at FROM supply_items WHERE deleted_at IS NULL ORDER BY active DESC,category,name`;
    const requests = await sql`SELECT r.id,r.status,r.note,r.manager_note,r.created_at,r.decided_at,r.employee_id,e.name AS employee_name,e.title AS employee_title
      FROM supply_requests r JOIN employees e ON e.id=r.employee_id
      WHERE r.status='pending' OR r.created_at>=${new Date(Date.now() - 90 * 86400000).toISOString()}
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 300`;
    const log = await sql`SELECT g.id,g.item_name,g.change,g.quantity_after,g.reason,g.request_id,g.created_at,e.name AS employee_name FROM supply_stock_log g LEFT JOIN employees e ON e.id=g.employee_id ORDER BY g.created_at DESC, g.id DESC LIMIT 150`;
    return json(res, 200, { items, requests: await withLines(requests), log, pending: pending[0].n, low: await lowItems() });
  }
  if (!requireSameOrigin(req, res)) return;

  if ((req.method === 'POST' || req.method === 'PATCH') && b.action === 'item') {
    const isNew = req.method === 'POST';
    const id = isNew ? null : wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!isNew && !id) return json(res, 400, { error: 'Item id required.' });
    const old = isNew ? null : (await sql`SELECT * FROM supply_items WHERE id=${id} AND deleted_at IS NULL`)[0];
    if (!isNew && !old) return json(res, 404, { error: 'Item not found.' });
    const name = b.name === undefined && old ? old.name : cleanText(b.name, 80);
    const category = b.category === undefined && old ? old.category : (cleanText(b.category, 40) || 'Other');
    const unit = b.unit === undefined && old ? old.unit : (cleanText(b.unit, 20) || 'Piece');
    const quantity = b.quantity === undefined && old ? old.quantity : wholeNumber(b.quantity ?? 0, 0, MAX_QTY);
    const lowAt = b.low_at === undefined && old ? old.low_at : wholeNumber(b.low_at ?? 0, 0, MAX_QTY);
    const active = b.active === undefined ? (old ? !!old.active : true) : !!b.active;
    // Full stock = 100%. Left blank, it follows the quantity entered.
    let fullQty = b.full_qty === undefined || b.full_qty === '' || b.full_qty === null ? (old && old.full_qty ? old.full_qty : quantity) : wholeNumber(b.full_qty, 0, MAX_QTY);
    if (fullQty === null) return json(res, 400, { error: 'Full stock must be a whole number, 0 or more.' });
    if (!name) return json(res, 400, { error: 'Enter an item name (up to 80 characters).' });
    if (category === null || unit === null) return json(res, 400, { error: 'Category and unit must be short.' });
    if (quantity === null) return json(res, 400, { error: `Quantity must be a whole number from 0 to ${MAX_QTY}.` });
    if (lowAt === null) return json(res, 400, { error: 'Low-stock alert must be a whole number, 0 or more.' });
    const now = nowIso();
    try {
      let row;
      if (isNew) row = (await sql`INSERT INTO supply_items(name,category,unit,quantity,low_at,full_qty,active,created_at,updated_at) VALUES(${name},${category},${unit},${quantity},${lowAt},${fullQty},${active},${now},${now}) RETURNING id`)[0];
      else await sql`UPDATE supply_items SET name=${name},category=${category},unit=${unit},quantity=${quantity},low_at=${lowAt},full_qty=${fullQty},active=${active},updated_at=${now} WHERE id=${id}`;
      const itemId = isNew ? Number(row.id) : id;
      const change = quantity - (old ? old.quantity : 0);
      if (change !== 0) await sql`INSERT INTO supply_stock_log(item_id,item_name,change,quantity_after,reason,created_at) VALUES(${itemId},${name},${change},${quantity},${isNew ? 'Starting quantity' : 'Quantity set by manager'},${now})`;
      await audit('manager', manager.id, isNew ? 'supply_item_created' : 'supply_item_updated', { item_id: itemId, name, quantity, change, active });
      return json(res, 200, { ok: true, id: itemId });
    } catch (e) {
      if (e.code === '23505') return json(res, 400, { error: 'An item with this name already exists.' });
      throw e;
    }
  }

  if (req.method === 'POST' && b.action === 'item_delete') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Item id required.' });
    // Kept in the database so past requests and Stock History still show it.
    const rows = await sql`UPDATE supply_items SET deleted_at=${nowIso()},active=0,updated_at=${nowIso()} WHERE id=${id} AND deleted_at IS NULL RETURNING id,name`;
    if (!rows.length) return json(res, 404, { error: 'Item not found.' });
    await audit('manager', manager.id, 'supply_item_deleted', { item_id: id, name: rows[0].name });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && b.action === 'uniform_prices') {
    const prices = b.prices || {}, now = nowIso(), stmts = [];
    for (const k of UNIFORM_ITEMS) {
      if (prices[k] === undefined) continue;
      const v = Number(prices[k]);
      if (!Number.isFinite(v) || v < 0 || v > 1000) return json(res, 400, { error: 'Prices must be between $0 and $1,000.' });
      stmts.push(['INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', 'uniform_price_' + k, String(money(v)), now]);
    }
    if (stmts.length) await sqlBatch(stmts);
    await audit('manager', manager.id, 'uniform_prices_updated', { prices });
    return json(res, 200, { ok: true, prices: await uniformPrices() });
  }
  if (req.method === 'POST' && b.action === 'uniform_decide') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    if (!['given', 'rejected'].includes(b.decision)) return json(res, 400, { error: 'Choose Given or Reject.' });
    const note = cleanText(b.note, 300); if (note === null) return json(res, 400, { error: 'The note must be 300 characters or fewer.' });
    const rows = await sql`UPDATE uniform_requests SET status=${b.decision},employee_seen=0,manager_note=${note || null},decided_at=${nowIso()},decided_by=${manager.id} WHERE id=${id} AND status='pending' RETURNING id`;
    if (!rows.length) return json(res, 400, { error: 'This request has already been handled.' });
    await audit('manager', manager.id, 'uniform_request_' + b.decision, { request_id: id });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && b.action === 'decide') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    const decision = b.decision;
    if (!['given', 'rejected'].includes(decision)) return json(res, 400, { error: 'Choose Given or Reject.' });
    const note = cleanText(b.note, 300); if (note === null) return json(res, 400, { error: 'The note must be 300 characters or fewer.' });
    const request = (await sql`SELECT r.*,e.name AS employee_name FROM supply_requests r JOIN employees e ON e.id=r.employee_id WHERE r.id=${id}`)[0];
    if (!request) return json(res, 404, { error: 'Request not found.' });
    if (request.status !== 'pending') return json(res, 400, { error: 'This request has already been handled.' });
    const now = nowIso();
    if (decision === 'rejected') {
      const rows = await sql`UPDATE supply_requests SET status='rejected',employee_seen=0,manager_note=${note || null},decided_at=${now},decided_by=${manager.id} WHERE id=${id} AND status='pending' RETURNING id`;
      if (!rows.length) return json(res, 400, { error: 'This request has already been handled.' });
      await audit('manager', manager.id, 'supply_request_rejected', { request_id: id });
      return json(res, 200, { ok: true });
    }
    const lines = (await linesFor([id])).get(id) || [];
    const given = new Map((Array.isArray(b.lines) ? b.lines : []).map(l => [Number(l.id), l.qty]));
    const plan = [];
    for (const l of lines) {
      const q = given.has(Number(l.id)) ? wholeNumber(given.get(Number(l.id)), 0, MAX_QTY) : l.qty_requested;
      if (q === null) return json(res, 400, { error: `Enter a whole number for ${l.item_name}.` });
      if (q > (l.on_shelf ?? 0)) return json(res, 400, { error: `Not enough ${l.item_name} on the shelf: ${l.on_shelf ?? 0} ${l.unit} left. Lower the amount or update the stock first.`, code: 'SUPPLY_SHORT' });
      plan.push({ ...l, q });
    }
    if (!plan.some(p => p.q > 0)) return json(res, 400, { error: 'Give at least one item, or reject the request.' });
    // One transaction: the request is marked given only if it was still waiting,
    // and each shelf quantity drops only if enough is there (CHECK quantity>=0).
    const stmts = [['UPDATE supply_requests SET status=?,employee_seen=0,manager_note=?,decided_at=?,decided_by=? WHERE id=? AND status=?', 'given', note || null, now, manager.id, id, 'pending']];
    // Every later statement only runs if the first one marked THIS request
    // given in this transaction (same decided_at), so a double click or a second
    // manager tab cannot take supplies off the shelf twice.
    const mine = 'EXISTS(SELECT 1 FROM supply_requests WHERE id=? AND status=\'given\' AND decided_at=?)';
    for (const p of plan) {
      stmts.push([`UPDATE supply_request_lines SET qty_given=? WHERE id=? AND ${mine}`, p.q, p.id, id, now]);
      if (p.q > 0) {
        stmts.push([`UPDATE supply_items SET quantity=quantity-?,updated_at=? WHERE id=? AND ${mine}`, p.q, now, p.item_id, id, now]);
        stmts.push([`INSERT INTO supply_stock_log(item_id,item_name,change,quantity_after,reason,request_id,employee_id,created_at) SELECT id,name,?,quantity,?,?,?,? FROM supply_items WHERE id=? AND ${mine}`, -p.q, 'Given to employee', id, request.employee_id, now, p.item_id, id, now]);
      }
    }
    let out;
    try { out = await sqlBatch(stmts); }
    catch (e) {
      if (/CHECK constraint/i.test(String(e?.message) + String(e?.cause?.message))) return json(res, 400, { error: 'Not enough on the shelf for one of the items. Refresh and try again.', code: 'SUPPLY_SHORT' });
      throw e;
    }
    if (!out[0].changes) return json(res, 400, { error: 'This request has already been handled.' });
    await audit('manager', manager.id, 'supply_request_given', { request_id: id, lines: plan.map(p => ({ item_id: p.item_id, qty: p.q })) });
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

export default async function handler(req, res) {
  try {
    await ensureTables();
    const u = new URL(req.url, 'https://workclock.invalid');
    const b = req.body || {};
    const employeeCall = u.searchParams.get('mine') === '1' || ['request', 'cancel', 'uniform_request', 'uniform_cancel'].includes(b.action);
    if (employeeCall) {
      const emp = await getEmployeeSession(req);
      if (!emp) return json(res, 401, { error: 'Employee login required.' });
      return await employeeSide(req, res, emp);
    }
    const manager = await getManager(req);
    if (!manager) return json(res, 401, { error: 'Manager login required.' });
    return await managerSide(req, res, manager);
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}
