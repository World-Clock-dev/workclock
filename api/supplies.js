import { vacationSummary } from './_vacation.js';
import { managerUnread, employeeUnread } from './chat.js';
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
  `CREATE TABLE IF NOT EXISTS supply_custom_lines (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     request_id INTEGER NOT NULL REFERENCES supply_requests(id),
     name TEXT NOT NULL,
     qty INTEGER NOT NULL,
     qty_given INTEGER)`,
  `CREATE INDEX IF NOT EXISTS supply_custom_lines_request ON supply_custom_lines(request_id)`,
  `CREATE TABLE IF NOT EXISTS uniform_stock (
     item TEXT NOT NULL,
     size TEXT NOT NULL,
     qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
     updated_at TEXT NOT NULL,
     PRIMARY KEY (item, size))`,
  `CREATE TABLE IF NOT EXISTS uniform_stock_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     item TEXT NOT NULL,
     size TEXT NOT NULL,
     change INTEGER NOT NULL,
     qty_after INTEGER NOT NULL,
     reason TEXT NOT NULL,
     request_id INTEGER,
     employee_id INTEGER,
     created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS uniform_stock_log_created ON uniform_stock_log(created_at)`,
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
  // 'min' = kept on the shelf with a minimum; 'demand' = bought when someone asks, no stock kept.
  if (!cols.includes('stock_mode')) mig.push(["ALTER TABLE supply_items ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'min'"]);
  const ucols = (await sql`SELECT name FROM pragma_table_info('uniform_request_lines')`).map(c => c.name);
  if (!ucols.includes('unit_price')) mig.push(['ALTER TABLE uniform_request_lines ADD COLUMN unit_price REAL']);
  // employee_seen = 0 once the manager decides, until the painter opens that page.
  for (const t of ['supply_requests', 'uniform_requests']) {
    const c = (await sql([`SELECT name FROM pragma_table_info('${t}')`])).map(x => x.name);
    if (!c.includes('employee_seen')) mig.push([`ALTER TABLE ${t} ADD COLUMN employee_seen INTEGER NOT NULL DEFAULT 1`]);
    if (!c.includes('approved_at')) mig.push([`ALTER TABLE ${t} ADD COLUMN approved_at TEXT`]);
    if (t === 'uniform_requests' && !c.includes('free')) mig.push(['ALTER TABLE uniform_requests ADD COLUMN free INTEGER NOT NULL DEFAULT 0']);
    // kind: what the painter asked for, 'free' or 'paid' (NULL on requests sent before this choice existed).
    if (t === 'uniform_requests' && !c.includes('kind')) mig.push(['ALTER TABLE uniform_requests ADD COLUMN kind TEXT']);
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
    const strings = ['SELECT l.id,l.request_id,l.item_id,l.item_name,l.unit,l.qty_requested,l.qty_given,i.quantity AS on_shelf,i.stock_mode FROM supply_request_lines l LEFT JOIN supply_items i ON i.id=l.item_id WHERE l.request_id IN ('];
    part.forEach((_, k) => strings.push(k < part.length - 1 ? ',' : ') ORDER BY l.id'));
    rows.push(...await sql(strings, ...part));
  }
  const map = new Map();
  for (const r of rows) { if (!map.has(r.request_id)) map.set(r.request_id, []); map.get(r.request_id).push(r); }
  return map;
}
async function customFor(ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const strings = ['SELECT id,request_id,name,qty,qty_given FROM supply_custom_lines WHERE request_id IN ('];
    part.forEach((_, k) => strings.push(k < part.length - 1 ? ',' : ') ORDER BY id'));
    for (const r of await sql(strings, ...part)) { if (!map.has(r.request_id)) map.set(r.request_id, []); map.get(r.request_id).push(r); }
  }
  return map;
}
async function withLines(requests) {
  const ids = requests.map(r => Number(r.id));
  const map = await linesFor(ids), custom = ids.length ? await customFor(ids) : new Map();
  return requests.map(r => ({ ...r, lines: map.get(Number(r.id)) || [], custom: custom.get(Number(r.id)) || [] }));
}

/* Uniform prices live in app_settings as uniform_price_<item>; $20 each unless changed. */
const DEFAULT_UNIFORM_PRICE = 20;
async function uniformPrices() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key LIKE 'uniform_price_%'`;
  const map = Object.fromEntries(rows.map(r => [r.key.slice('uniform_price_'.length), Number(r.value)]));
  return Object.fromEntries(UNIFORM_ITEMS.map(k => [k, Number.isFinite(map[k]) ? map[k] : DEFAULT_UNIFORM_PRICE]));
}
/* Free uniforms: each painter may get up to N of each item free per month or per year
   (app_settings uniform_free_limit_<item>, uniform_free_period). Default 1 per year. */
async function freeRules() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key LIKE 'uniform_free_%'`;
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const period = m.uniform_free_period === 'month' ? 'month' : 'year';
  const limits = Object.fromEntries(UNIFORM_ITEMS.map(k => { const v = Number(m['uniform_free_limit_' + k]); return [k, Number.isInteger(v) && v >= 0 ? v : 1]; }));
  return { period, limits };
}
function periodStart(period, d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), period === 'month' ? d.getUTCMonth() : 0, 1)).toISOString();
}
// Free pieces of each item this painter has already asked for or received in the current period.
async function freeUsed(employeeId, period, exceptRequest = 0) {
  const rows = await sql`SELECT l.item,sum(l.qty) AS n FROM uniform_request_lines l JOIN uniform_requests r ON r.id=l.request_id
    WHERE r.employee_id=${employeeId} AND r.id<>${exceptRequest} AND r.created_at>=${periodStart(period)}
      AND ((r.status IN ('pending','approved') AND r.kind='free') OR (r.status='given' AND r.free=1)) GROUP BY l.item`;
  const out = Object.fromEntries(UNIFORM_ITEMS.map(k => [k, 0]));
  for (const r of rows) out[r.item] = Number(r.n || 0);
  return out;
}
const UNI_LABEL = { tshirt_half: 'T-shirt, half sleeve', tshirt_full: 'T-shirt, full sleeve', trousers: 'Trousers', jacket: 'Jacket' };
async function freeLimitError(employeeId, lines, exceptRequest = 0) {
  const { period, limits } = await freeRules(), used = await freeUsed(employeeId, period, exceptRequest), want = {};
  for (const l of lines) want[l.item] = (want[l.item] || 0) + Number(l.qty);
  for (const [item, q] of Object.entries(want)) {
    const left = Math.max(0, limits[item] - used[item]);
    if (q > left) return { error: `Free limit reached for ${UNI_LABEL[item] || item}: ${left} free left this ${period}. Send it as a paid request instead.`, code: 'UNIFORM_FREE_LIMIT', item, left };
  }
  return null;
}
const money = v => Math.round(Number(v) * 100) / 100;
const lineAmount = (l, prices) => money(Number(l.qty) * (l.unit_price != null ? Number(l.unit_price) : prices[l.item] ?? DEFAULT_UNIFORM_PRICE));

const lowItems = () => sql`SELECT id,name,unit,quantity,full_qty,low_at FROM supply_items
  WHERE deleted_at IS NULL AND active=1 AND stock_mode<>'demand' AND ((full_qty>0 AND quantity*5<full_qty) OR (low_at>0 AND quantity<low_at)) ORDER BY CASE WHEN full_qty>0 THEN CAST(quantity AS REAL)/full_qty ELSE 0 END, name`;

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

/* Mark a uniform request delivered and take the items out of uniform stock,
   all in one transaction. Returns an error object, or null when done. */
async function deliverUniforms(id, employeeId, lines, free, note, managerId, now) {
  const stock = new Map((await sql`SELECT item,size,qty FROM uniform_stock`).map(r => [r.item + '|' + r.size, r.qty]));
  const need = new Map();
  for (const l of lines) need.set(l.item + '|' + l.size, (need.get(l.item + '|' + l.size) || 0) + Number(l.qty));
  for (const [k, q] of need) {
    const have = stock.get(k) || 0;
    if (q > have) { const [item, size] = k.split('|'); return { error: `Not enough in uniform stock: ${item.replace('_', ' ')} ${size} has ${have}. Add stock in Uniform Inventory first.`, code: 'UNIFORM_SHORT' }; }
  }
  const mine = "EXISTS(SELECT 1 FROM uniform_requests WHERE id=? AND status='given' AND decided_at=?)";
  const stmts = [["UPDATE uniform_requests SET status='given',free=?,employee_seen=0,approved_at=COALESCE(approved_at,?),manager_note=COALESCE(?,manager_note),decided_at=?,decided_by=? WHERE id=? AND status IN ('pending','approved')", free ? 1 : 0, now, note || null, now, managerId, id]];
  for (const [k, q] of need) {
    const [item, size] = k.split('|');
    stmts.push([`UPDATE uniform_stock SET qty=qty-?,updated_at=? WHERE item=? AND size=? AND ${mine}`, q, now, item, size, id, now]);
    stmts.push([`INSERT INTO uniform_stock_log(item,size,change,qty_after,reason,request_id,employee_id,created_at) SELECT item,size,?,qty,?,?,?,? FROM uniform_stock WHERE item=? AND size=? AND ${mine}`, -q, free ? 'Free from company' : 'Bought by employee', id, employeeId, now, item, size, id, now]);
  }
  try { const r = await sqlBatch(stmts); if (!r[0].changes) return { error: 'This request has already been handled.' }; }
  catch (e) { if (/CHECK constraint/i.test(String(e?.message) + String(e?.cause?.message))) return { error: 'Not enough in uniform stock. Refresh and try again.', code: 'UNIFORM_SHORT' }; throw e; }
  return null;
}

/* ---------------- Employee ---------------- */
async function employeeSide(req, res, emp) {
  const b = req.body || {};
  if (req.method === 'GET') {
    const u = new URL(req.url, 'https://workclock.invalid');
    if (u.searchParams.get('count')) {
      const a = await sql`SELECT count(*) AS n FROM supply_requests WHERE employee_id=${emp.id} AND employee_seen=0`;
      const c = await sql`SELECT count(*) AS n FROM uniform_requests WHERE employee_id=${emp.id} AND employee_seen=0`;
      return json(res, 200, { supplies: a[0].n, uniforms: c[0].n, chat: await employeeUnread(emp.id) });
    }
    if (u.searchParams.get('vacation')) {
      const year = new Date().getUTCFullYear();
      const mine = (await vacationSummary(new Date(Date.UTC(year, 0, 1)).toISOString(), new Date(Date.UTC(year + 1, 0, 1)).toISOString())).find(r => String(r.employee_id) === String(emp.id)) || null;
      return json(res, 200, { year, vacation: mine && { year_paid_hours: mine.range_paid_hours, year_earned: mine.range_earned, all_earned: mine.all_earned, opening_hours: mine.opening_hours, used_hours: mine.used_hours, balance: mine.balance, start_date: mine.start_date, eligible_from: mine.eligible_from, eligible: mine.eligible } });
    }
    if (u.searchParams.get('deductions')) {
      const start = u.searchParams.get('start'), end = u.searchParams.get('end');
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Valid start and end are required.' });
      const given = await sql`SELECT id,decided_at FROM uniform_requests WHERE employee_id=${emp.id} AND status='given' AND free=0 AND decided_at>=${new Date(start).toISOString()} AND decided_at<${new Date(end).toISOString()}`;
      const reqs = await withUniformLines(given);
      return json(res, 200, { total: money(reqs.reduce((a, r) => a + r.total, 0)), lines: reqs.flatMap(r => r.lines.map(l => ({ item: l.item, size: l.size, qty: l.qty, amount: l.amount }))) });
    }
    if (u.searchParams.get('seen')) {
      if (u.searchParams.get('uniforms')) await sql`UPDATE uniform_requests SET employee_seen=1 WHERE employee_id=${emp.id} AND employee_seen=0`;
      else await sql`UPDATE supply_requests SET employee_seen=1 WHERE employee_id=${emp.id} AND employee_seen=0`;
    }
    if (u.searchParams.get('uniforms')) {
      const ur = await sql`SELECT id,status,kind,note,manager_note,created_at,decided_at,approved_at,free FROM uniform_requests WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 30`;
      const rules = await freeRules(), used = await freeUsed(emp.id, rules.period);
      const freeLeft = Object.fromEntries(UNIFORM_ITEMS.map(k => [k, Math.max(0, rules.limits[k] - used[k])]));
      return json(res, 200, { items: UNIFORM_ITEMS, sizes: UNIFORM_SIZES, prices: await uniformPrices(), freePeriod: rules.period, freeLimits: rules.limits, freeLeft, requests: await withUniformLines(ur) });
    }
    const items = await sql`SELECT id,name,category,unit FROM supply_items WHERE active=1 AND deleted_at IS NULL ORDER BY category,name`;
    const requests = await sql`SELECT id,status,note,manager_note,created_at,decided_at,approved_at FROM supply_requests WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 30`;
    const out = await withLines(requests);
    out.forEach(r => r.lines.forEach(l => { delete l.on_shelf; }));
    return json(res, 200, { items, requests: out });
  }
  if (!requireSameOrigin(req, res)) return;
  if (req.method === 'POST' && b.action === 'request') {
    const lines = Array.isArray(b.lines) ? b.lines : [];
    const customIn = Array.isArray(b.custom) ? b.custom : [];
    if (!lines.length && !customIn.length) return json(res, 400, { error: 'Choose at least one item.', code: 'SUPPLY_EMPTY' });
    if (customIn.length > 10) return json(res, 400, { error: 'Up to 10 items that are not on the list.' });
    const custom = [];
    for (const c of customIn) {
      const name = cleanText(c.name, 80), qty = wholeNumber(c.qty, 1, 999);
      if (!name || !qty) return json(res, 400, { error: 'Each extra item needs a name and a quantity from 1 to 999.', code: 'SUPPLY_CUSTOM' });
      custom.push([name, qty]);
    }
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
    const ins = [...wanted].map(([id, qty]) => ['INSERT INTO supply_request_lines(request_id,item_id,item_name,unit,qty_requested) VALUES(?,?,?,?,?)', rid, id, byId.get(id).name, byId.get(id).unit, qty]);
    custom.forEach(([name, qty]) => ins.push(['INSERT INTO supply_custom_lines(request_id,name,qty) VALUES(?,?,?)', rid, name, qty]));
    await sqlBatch(ins);
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
    const kind = b.kind === 'free' ? 'free' : b.kind === 'paid' ? 'paid' : null;
    if (!kind) return json(res, 400, { error: 'Choose Free or Paid.', code: 'UNIFORM_KIND' });
    const open = await sql`SELECT count(*) AS n FROM uniform_requests WHERE employee_id=${emp.id} AND status='pending'`;
    if (open[0].n >= 3) return json(res, 400, { error: 'You already have uniform requests waiting.', code: 'UNIFORM_TOO_MANY' });
    if (kind === 'free') { const lim = await freeLimitError(emp.id, clean.map(([item, size, qty]) => ({ item, qty }))); if (lim) return json(res, 400, lim); }
    const prices = await uniformPrices();
    const rid = Number((await sql`INSERT INTO uniform_requests(employee_id,status,kind,note,created_at) VALUES(${emp.id},'pending',${kind},${note || null},${nowIso()}) RETURNING id`)[0].id);
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
      return json(res, 200, { pending: pending[0].n, latest: latest[0] || null, uniformPending: up[0].n, uniformLatest: ulatest[0] || null, low: await lowItems(), ...(await managerUnread()) });
    }
    if (u.searchParams.get('uniforms')) {
      const rg = k => {
        const a = u.searchParams.get(k + 'Start'), z = u.searchParams.get(k + 'End');
        return [a && !Number.isNaN(Date.parse(a)) ? new Date(a).toISOString() : new Date(Date.now() - 31 * 86400000).toISOString(),
                z && !Number.isNaN(Date.parse(z)) ? new Date(z).toISOString() : new Date(Date.now() + 86400000).toISOString()];
      };
      const [rs, re] = rg('req'), [is, ie] = rg('inv'), [fs, fe] = rg('free'), [bs, be] = rg('buy');
      const ur = await sql`SELECT r.id,r.status,r.free,r.kind,r.employee_id,r.note,r.manager_note,r.created_at,r.decided_at,r.approved_at,e.name AS employee_name,e.title AS employee_title
        FROM uniform_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status IN ('pending','approved') OR (r.created_at>=${rs} AND r.created_at<${re})
        ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 500`;
      const del = (s0, e0, free) => sql`SELECT r.id,r.free,r.decided_at,r.manager_note,e.name AS employee_name FROM uniform_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status='given' AND r.free=${free} AND r.decided_at>=${s0} AND r.decided_at<${e0} ORDER BY r.decided_at DESC LIMIT 1000`;
      const stock = await sql`SELECT item,size,qty FROM uniform_stock`;
      const begins = await sql`SELECT l.item,l.size,l.qty_after FROM uniform_stock_log l WHERE l.id IN (SELECT max(id) FROM uniform_stock_log WHERE created_at<${is} GROUP BY item,size)`;
      const ends = await sql`SELECT l.item,l.size,l.qty_after FROM uniform_stock_log l WHERE l.id IN (SELECT max(id) FROM uniform_stock_log WHERE created_at<${ie} GROUP BY item,size)`;
      const moves = await sql`SELECT item,size,sum(CASE WHEN change>0 THEN change ELSE 0 END) AS added,sum(CASE WHEN change<0 THEN -change ELSE 0 END) AS removed FROM uniform_stock_log WHERE created_at>=${is} AND created_at<${ie} GROUP BY item,size`;
      const inv = {};
      const cell = (i, z) => ((inv[i] ||= {})[z] ||= { qty: 0, begin: 0, end: null, added: 0, removed: 0 });
      stock.forEach(r => { cell(r.item, r.size).qty = r.qty; });
      begins.forEach(r => { cell(r.item, r.size).begin = r.qty_after; });
      ends.forEach(r => { cell(r.item, r.size).end = r.qty_after; });
      moves.forEach(r => { const c = cell(r.item, r.size); c.added = r.added || 0; c.removed = r.removed || 0; });
      const ulog = await sql`SELECT l.id,l.item,l.size,l.change,l.qty_after,l.reason,l.created_at,e.name AS employee_name FROM uniform_stock_log l LEFT JOIN employees e ON e.id=l.employee_id WHERE l.created_at>=${is} AND l.created_at<${ie} ORDER BY l.created_at DESC,l.id DESC LIMIT 500`;
      const rules = await freeRules();
      return json(res, 200, { items: UNIFORM_ITEMS, sizes: UNIFORM_SIZES, prices: await uniformPrices(), freePeriod: rules.period, freeLimits: rules.limits, requests: await withUniformLines(ur),
        inventory: inv, inventoryLog: ulog, freeGiven: await withUniformLines(await del(fs, fe, 1)), bought: await withUniformLines(await del(bs, be, 0)) });
    }
    if (u.searchParams.get('deductions')) {
      // Uniforms handed out in the week: their cost comes off that week's pay.
      const start = u.searchParams.get('start'), end = u.searchParams.get('end');
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Valid start and end are required.' });
      const given = await sql`SELECT r.id,r.employee_id,r.decided_at,e.name AS employee_name FROM uniform_requests r JOIN employees e ON e.id=r.employee_id
        WHERE r.status='given' AND r.free=0 AND r.decided_at>=${new Date(start).toISOString()} AND r.decided_at<${new Date(end).toISOString()} ORDER BY e.name,r.decided_at`;
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
    // Date ranges: open requests (requested/approved) always show; the rest by
    // date sent. Stock shows each item's amount at the start and end of the range.
    const rng = (k, fallbackDays) => {
      const a = u.searchParams.get(k + 'Start'), z = u.searchParams.get(k + 'End');
      const s0 = a && !Number.isNaN(Date.parse(a)) ? new Date(a).toISOString() : new Date(Date.now() - fallbackDays * 86400000).toISOString();
      const e0 = z && !Number.isNaN(Date.parse(z)) ? new Date(z).toISOString() : new Date(Date.now() + 86400000).toISOString();
      return [s0, e0];
    };
    const [rs, re] = rng('req', 31), [ss, se] = rng('stock', 31), [ls, le] = rng('log', 31);
    const items = await sql`SELECT i.id,i.name,i.category,i.unit,i.quantity,i.low_at,i.full_qty,i.stock_mode,i.active,i.updated_at,
        (SELECT g.quantity_after FROM supply_stock_log g WHERE g.item_id=i.id AND g.created_at<${ss} ORDER BY g.created_at DESC,g.id DESC LIMIT 1) AS begin_qty,
        (SELECT g.quantity_after FROM supply_stock_log g WHERE g.item_id=i.id AND g.created_at<${se} ORDER BY g.created_at DESC,g.id DESC LIMIT 1) AS end_qty,
        (SELECT COALESCE(sum(g.change),0) FROM supply_stock_log g WHERE g.item_id=i.id AND g.created_at>=${ss} AND g.created_at<${se} AND g.change>0) AS added,
        (SELECT COALESCE(-sum(g.change),0) FROM supply_stock_log g WHERE g.item_id=i.id AND g.created_at>=${ss} AND g.created_at<${se} AND g.change<0) AS removed
      FROM supply_items i WHERE i.deleted_at IS NULL ORDER BY i.active DESC,i.category,i.name`;
    const requests = await sql`SELECT r.id,r.status,r.note,r.manager_note,r.created_at,r.decided_at,r.approved_at,r.employee_id,e.name AS employee_name,e.title AS employee_title
      FROM supply_requests r JOIN employees e ON e.id=r.employee_id
      WHERE r.status IN ('pending','approved') OR (r.created_at>=${rs} AND r.created_at<${re})
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 500`;
    const log = await sql`SELECT g.id,g.item_name,g.change,g.quantity_after,g.reason,g.request_id,g.created_at,e.name AS employee_name FROM supply_stock_log g LEFT JOIN employees e ON e.id=g.employee_id
      WHERE g.created_at>=${ls} AND g.created_at<${le} ORDER BY g.created_at DESC, g.id DESC LIMIT 1000`;
    const approvedN = await sql`SELECT count(*) AS n FROM supply_requests WHERE status='approved'`;
    return json(res, 200, { items, requests: await withLines(requests), log, pending: pending[0].n, approved: approvedN[0].n, low: await lowItems() });
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
    const stockMode = b.stock_mode === undefined ? (old ? old.stock_mode || 'min' : 'min') : (b.stock_mode === 'demand' ? 'demand' : 'min');
    const demand = stockMode === 'demand';
    const quantity = demand ? 0 : b.quantity === undefined && old ? old.quantity : wholeNumber(b.quantity ?? 0, 0, MAX_QTY);
    const lowAt = demand ? 0 : b.low_at === undefined && old ? old.low_at : wholeNumber(b.low_at ?? 0, 0, MAX_QTY);
    const active = b.active === undefined ? (old ? !!old.active : true) : !!b.active;
    // Full stock = 100%. Left blank, it follows the quantity entered.
    let fullQty = demand ? 0 : b.full_qty === undefined || b.full_qty === '' || b.full_qty === null ? (old && old.full_qty ? old.full_qty : quantity) : wholeNumber(b.full_qty, 0, MAX_QTY);
    if (fullQty === null) return json(res, 400, { error: 'Full stock must be a whole number, 0 or more.' });
    if (!name) return json(res, 400, { error: 'Enter an item name (up to 80 characters).' });
    if (category === null || unit === null) return json(res, 400, { error: 'Category and unit must be short.' });
    if (quantity === null) return json(res, 400, { error: `Quantity must be a whole number from 0 to ${MAX_QTY}.` });
    if (lowAt === null) return json(res, 400, { error: 'Low-stock alert must be a whole number, 0 or more.' });
    const now = nowIso();
    try {
      let row;
      if (isNew) row = (await sql`INSERT INTO supply_items(name,category,unit,quantity,low_at,full_qty,stock_mode,active,created_at,updated_at) VALUES(${name},${category},${unit},${quantity},${lowAt},${fullQty},${stockMode},${active},${now},${now}) RETURNING id`)[0];
      else await sql`UPDATE supply_items SET name=${name},category=${category},unit=${unit},quantity=${quantity},low_at=${lowAt},full_qty=${fullQty},stock_mode=${stockMode},active=${active},updated_at=${now} WHERE id=${id}`;
      const itemId = isNew ? Number(row.id) : id;
      const change = quantity - (old ? old.quantity : 0);
      if (change !== 0) await sql`INSERT INTO supply_stock_log(item_id,item_name,change,quantity_after,reason,created_at) VALUES(${itemId},${name},${change},${quantity},${isNew ? 'Starting quantity' : demand ? 'Changed to On demand' : 'Quantity set by manager'},${now})`;
      await audit('manager', manager.id, isNew ? 'supply_item_created' : 'supply_item_updated', { item_id: itemId, name, quantity, change, active, stock_mode: stockMode });
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
  if (req.method === 'POST' && b.action === 'uniform_free_limits') {
    const lim = b.limits || {}, now = nowIso(), stmts = [];
    const period = b.period === 'month' ? 'month' : b.period === 'year' ? 'year' : null;
    if (!period) return json(res, 400, { error: 'Choose per month or per year.' });
    for (const k of UNIFORM_ITEMS) {
      if (lim[k] === undefined) continue;
      const v = wholeNumber(lim[k], 0, 50); if (v === null) return json(res, 400, { error: 'Free limits must be whole numbers from 0 to 50.' });
      stmts.push(['INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', 'uniform_free_limit_' + k, String(v), now]);
    }
    stmts.push(['INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', 'uniform_free_period', period, now]);
    await sqlBatch(stmts);
    await audit('manager', manager.id, 'uniform_free_limits_updated', { period, limits: lim });
    const rules = await freeRules();
    return json(res, 200, { ok: true, freePeriod: rules.period, freeLimits: rules.limits });
  }
  if (req.method === 'POST' && b.action === 'uniform_stock') {
    // Set the counted amount for one item and size (or add a delivery with add:true).
    if (!UNIFORM_ITEMS.includes(b.item) || !UNIFORM_SIZES.includes(b.size)) return json(res, 400, { error: 'Choose an item and a size.' });
    const n = wholeNumber(b.qty, 0, 100000); if (n === null) return json(res, 400, { error: 'Enter a whole number, 0 or more.' });
    const cur = Number((await sql`SELECT qty FROM uniform_stock WHERE item=${b.item} AND size=${b.size}`)[0]?.qty || 0);
    const next = b.add ? cur + n : n, change = next - cur, now = nowIso();
    if (!change) return json(res, 200, { ok: true });
    await sqlBatch([
      ['INSERT INTO uniform_stock(item,size,qty,updated_at) VALUES(?,?,?,?) ON CONFLICT(item,size) DO UPDATE SET qty=excluded.qty,updated_at=excluded.updated_at', b.item, b.size, next, now],
      ['INSERT INTO uniform_stock_log(item,size,change,qty_after,reason,created_at) VALUES(?,?,?,?,?,?)', b.item, b.size, change, next, b.add ? 'Stock received' : 'Count set by manager', now]
    ]);
    await audit('manager', manager.id, 'uniform_stock_set', { item: b.item, size: b.size, qty: next });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && b.action === 'uniform_give') {
    // Hand out a uniform without a request: free from the company, or charged.
    const empId = wholeNumber(b.employeeId, 1, Number.MAX_SAFE_INTEGER); if (!empId) return json(res, 400, { error: 'Choose an employee.' });
    const emp = (await sql`SELECT id FROM employees WHERE id=${empId}`)[0]; if (!emp) return json(res, 404, { error: 'Employee not found.' });
    const lines = (Array.isArray(b.lines) ? b.lines : []).map(l => ({ item: l.item, size: l.size, qty: wholeNumber(l.qty, 1, 20) }));
    if (!lines.length || lines.some(l => !UNIFORM_ITEMS.includes(l.item) || !UNIFORM_SIZES.includes(l.size) || !l.qty)) return json(res, 400, { error: 'Choose an item, a size and a quantity from 1 to 20.' });
    const note = cleanText(b.note, 300); if (note === null) return json(res, 400, { error: 'The note must be 300 characters or fewer.' });
    if (b.free && !b.overLimit) { const lim = await freeLimitError(empId, lines); if (lim) return json(res, 400, { ...lim, error: lim.error.replace('Send it as a paid request instead.', 'Give it anyway, or record it as bought.') }); }
    const now = nowIso(), prices = await uniformPrices();
    const rid = Number((await sql`INSERT INTO uniform_requests(employee_id,status,kind,note,created_at,approved_at) VALUES(${empId},'approved',${b.free ? 'free' : 'paid'},${'Handed out by manager'},${now},${now}) RETURNING id`)[0].id);
    await sqlBatch(lines.map(l => ['INSERT INTO uniform_request_lines(request_id,item,size,qty,unit_price) VALUES(?,?,?,?,?)', rid, l.item, l.size, l.qty, prices[l.item]]));
    const saved = (await uniformLines([rid])).get(rid) || [];
    const out = await deliverUniforms(rid, empId, saved, !!b.free, note, manager.id, now);
    if (out) { await sql`UPDATE uniform_requests SET status='cancelled',decided_at=${now} WHERE id=${rid}`; return json(res, 400, out); }
    await audit('manager', manager.id, 'uniform_given_direct', { request_id: rid, employee_id: empId, free: !!b.free });
    return json(res, 200, { ok: true, id: rid });
  }
  if (req.method === 'POST' && b.action === 'uniform_decide') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    if (!['approved', 'given', 'rejected'].includes(b.decision)) return json(res, 400, { error: 'Choose Approve, Delivered or Reject.' });
    const note = cleanText(b.note, 300); if (note === null) return json(res, 400, { error: 'The note must be 300 characters or fewer.' });
    const now = nowIso();
    if (b.decision !== 'given') {
      const rows = b.decision === 'approved'
        ? await sql`UPDATE uniform_requests SET status='approved',employee_seen=0,approved_at=${now},manager_note=COALESCE(${note || null},manager_note) WHERE id=${id} AND status='pending' RETURNING id`
        : await sql`UPDATE uniform_requests SET status='rejected',employee_seen=0,manager_note=${note || null},decided_at=${now},decided_by=${manager.id} WHERE id=${id} AND status IN ('pending','approved') RETURNING id`;
      if (!rows.length) return json(res, 400, { error: 'This request has already been handled.' });
      await audit('manager', manager.id, 'uniform_request_' + b.decision, { request_id: id });
      return json(res, 200, { ok: true });
    }
    const request = (await sql`SELECT * FROM uniform_requests WHERE id=${id}`)[0];
    if (!request || !['pending', 'approved'].includes(request.status)) return json(res, 400, { error: 'This request has already been handled.' });
    const lines = (await uniformLines([id])).get(id) || [];
    // The painter's choice decides free or paid; older requests without a choice use the manager's button.
    const free = request.kind === 'free' ? true : request.kind === 'paid' ? false : !!b.free;
    const out = await deliverUniforms(id, request.employee_id, lines, free, note, manager.id, now);
    if (out) return json(res, 400, out);
    await audit('manager', manager.id, 'uniform_request_given', { request_id: id, free });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && b.action === 'decide') {
    const id = wholeNumber(b.id, 1, Number.MAX_SAFE_INTEGER); if (!id) return json(res, 400, { error: 'Request id required.' });
    const decision = b.decision;
    if (!['approved', 'given', 'rejected'].includes(decision)) return json(res, 400, { error: 'Choose Approve, Delivered or Reject.' });
    const note = cleanText(b.note, 300); if (note === null) return json(res, 400, { error: 'The note must be 300 characters or fewer.' });
    const request = (await sql`SELECT r.*,e.name AS employee_name FROM supply_requests r JOIN employees e ON e.id=r.employee_id WHERE r.id=${id}`)[0];
    if (!request) return json(res, 404, { error: 'Request not found.' });
    if (!['pending', 'approved'].includes(request.status)) return json(res, 400, { error: 'This request has already been handled.' });
    const now = nowIso();
    if (decision === 'approved') {
      const rows = await sql`UPDATE supply_requests SET status='approved',employee_seen=0,approved_at=${now},manager_note=COALESCE(${note || null},manager_note) WHERE id=${id} AND status='pending' RETURNING id`;
      if (!rows.length) return json(res, 400, { error: 'This request has already been handled.' });
      await audit('manager', manager.id, 'supply_request_approved', { request_id: id });
      return json(res, 200, { ok: true });
    }
    if (decision === 'rejected') {
      const rows = await sql`UPDATE supply_requests SET status='rejected',employee_seen=0,manager_note=${note || null},decided_at=${now},decided_by=${manager.id} WHERE id=${id} AND status IN ('pending','approved') RETURNING id`;
      if (!rows.length) return json(res, 400, { error: 'This request has already been handled.' });
      await audit('manager', manager.id, 'supply_request_rejected', { request_id: id });
      return json(res, 200, { ok: true });
    }
    const lines = (await linesFor([id])).get(id) || [];
    const given = new Map((Array.isArray(b.lines) ? b.lines : []).map(l => [Number(l.id), l.qty]));
    const customLines = (await customFor([id])).get(id) || [];
    const givenCustom = new Map((Array.isArray(b.custom) ? b.custom : []).map(l => [Number(l.id), l.qty]));
    const customPlan = [];
    for (const c of customLines) {
      const q = givenCustom.has(Number(c.id)) ? wholeNumber(givenCustom.get(Number(c.id)), 0, MAX_QTY) : c.qty;
      if (q === null) return json(res, 400, { error: `Enter a whole number for ${c.name}.` });
      customPlan.push({ ...c, q });
    }
    const plan = [];
    for (const l of lines) {
      const q = given.has(Number(l.id)) ? wholeNumber(given.get(Number(l.id)), 0, MAX_QTY) : l.qty_requested;
      if (q === null) return json(res, 400, { error: `Enter a whole number for ${l.item_name}.` });
      if (l.stock_mode !== 'demand' && q > (l.on_shelf ?? 0)) return json(res, 400, { error: `Not enough ${l.item_name} on the shelf: ${l.on_shelf ?? 0} ${l.unit} left. Lower the amount or update the stock first.`, code: 'SUPPLY_SHORT' });
      plan.push({ ...l, q });
    }
    if (!plan.some(p => p.q > 0) && !customPlan.some(p => p.q > 0)) return json(res, 400, { error: 'Deliver at least one item, or reject the request.' });
    // One transaction: the request is marked given only if it was still waiting,
    // and each shelf quantity drops only if enough is there (CHECK quantity>=0).
    const stmts = [["UPDATE supply_requests SET status=?,employee_seen=0,approved_at=COALESCE(approved_at,?),manager_note=COALESCE(?,manager_note),decided_at=?,decided_by=? WHERE id=? AND status IN ('pending','approved')", 'given', now, note || null, now, manager.id, id]];
    // Every later statement only runs if the first one marked THIS request
    // given in this transaction (same decided_at), so a double click or a second
    // manager tab cannot take supplies off the shelf twice.
    const mine = 'EXISTS(SELECT 1 FROM supply_requests WHERE id=? AND status=\'given\' AND decided_at=?)';
    for (const p of plan) {
      stmts.push([`UPDATE supply_request_lines SET qty_given=? WHERE id=? AND ${mine}`, p.q, p.id, id, now]);
      if (p.q > 0 && p.stock_mode !== 'demand') {
        stmts.push([`UPDATE supply_items SET quantity=quantity-?,updated_at=? WHERE id=? AND ${mine}`, p.q, now, p.item_id, id, now]);
        stmts.push([`INSERT INTO supply_stock_log(item_id,item_name,change,quantity_after,reason,request_id,employee_id,created_at) SELECT id,name,?,quantity,?,?,?,? FROM supply_items WHERE id=? AND ${mine}`, -p.q, 'Delivered to employee', id, request.employee_id, now, p.item_id, id, now]);
      }
    }
    for (const c of customPlan) stmts.push([`UPDATE supply_custom_lines SET qty_given=? WHERE id=? AND ${mine}`, c.q, c.id, id, now]);
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
