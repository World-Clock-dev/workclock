// Copy every WorkClock row from Neon (Postgres) into Cloudflare D1, unchanged.
//
//   1. Export (read-only on Neon):
//        DATABASE_URL='postgres://...neon...' node scripts/neon-to-d1.mjs export
//      -> writes migration/data.sql and migration/neon-snapshot.json
//   2. Import into D1 (schema first, then data):
//        npx wrangler d1 execute workclock --remote --file=schema.d1.sql
//        npx wrangler d1 execute workclock --remote --file=migration/data.sql
//   3. Verify every row in D1 matches the Neon snapshot:
//        node scripts/neon-to-d1.mjs verify            (add --local for the local D1)
//
// Ids are kept as they are, so sessions, reviews, audit links and foreign keys
// all line up. Id counters continue from Neon's sequences, so no id is reused.
// Neon is only ever read; this script never writes to it.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Parent tables before children, so foreign keys are satisfied during import.
export const TABLES = [
  'manager_users', 'employees', 'app_settings',
  'employee_sessions', 'manager_sessions', 'manager_reset_tokens',
  'shifts', 'rejected_clock_outs', 'manager_force_clockouts',
  'audit_logs', 'auth_attempts', 'pin_reset_requests', 'retention_runs',
];
const SERIAL_TABLES = ['manager_users', 'employees', 'shifts', 'rejected_clock_outs', 'audit_logs', 'auth_attempts', 'pin_reset_requests', 'manager_force_clockouts', 'retention_runs'];
const INT8 = new Set(['id', 'employee_id', 'shift_id', 'actor_id', 'manager_id', 'manager_user_id', 'manager_reviewed_by']);
const NUMERIC = new Set(['hourly_wage', 'manager_custom_paid_hours', 'paid_hours']);
const JSONCOLS = new Set(['metadata', 'deleted']);

/* Convert one Postgres value (as the Neon driver returns it) to its D1 form. */
export function toD1(col, v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (JSONCOLS.has(col)) return typeof v === 'string' ? JSON.stringify(JSON.parse(v)) : JSON.stringify(v);
  if ((INT8.has(col) || NUMERIC.has(col)) && typeof v === 'string') return Number(v);
  return v;
}
export function sqlLiteral(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Non-finite number'); return String(v); }
  return `'${String(v).replace(/'/g, "''")}'`;
}

/* Read everything through a Neon-style sql`` tag and build the D1 import. */
export async function exportData(sql) {
  const snapshot = {}; let out = '-- WorkClock data exported from Neon on ' + new Date().toISOString() + '\nPRAGMA defer_foreign_keys = ON;\n';
  for (const t of TABLES) {
    const rows = await sql([`SELECT * FROM ${t} ORDER BY 1`]);
    snapshot[t] = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toD1(k, v)])));
    for (const r of snapshot[t]) {
      const cols = Object.keys(r);
      out += `INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(c => sqlLiteral(r[c])).join(',')});\n`;
    }
  }
  // Continue each id counter from Neon's sequence (which can be ahead of the
  // highest surviving id after deletions), so ids are never reused.
  out += 'DELETE FROM sqlite_sequence;\n';
  for (const t of SERIAL_TABLES) {
    const seq = await sql([`SELECT last_value, is_called FROM ${t}_id_seq`]);
    const last = seq[0]?.is_called ? Number(seq[0].last_value) : Number(seq[0]?.last_value || 1) - 1;
    const maxId = Math.max(0, ...snapshot[t].map(r => Number(r.id)));
    const next = Math.max(last, maxId);
    if (next > 0) out += `INSERT INTO sqlite_sequence(name,seq) VALUES('${t}',${next});\n`;
  }
  // The INSERT INTO app_settings in schema.d1.sql seeds defaults; Neon's values win.
  out = out.replace(/INSERT INTO app_settings\(/g, 'INSERT OR REPLACE INTO app_settings(');
  return { sqlText: out, snapshot };
}

/* Compare a D1 database row-for-row with the Neon snapshot. */
export function compare(snapshot, readTable) {
  const problems = []; const summary = [];
  for (const t of TABLES) {
    const want = snapshot[t];
    const got = readTable(t);
    const norm = rows => rows.map(r => JSON.stringify(Object.keys(r).sort().map(k => [k, JSONCOLS.has(k) && typeof r[k] === 'string' ? JSON.parse(r[k]) : r[k]])));
    const a = norm(want), b = norm(got);
    const missing = a.filter(x => !b.includes(x));
    summary.push(`${t.padEnd(24)} Neon ${String(want.length).padStart(6)}   D1 ${String(got.length).padStart(6)}   ${missing.length || a.length !== b.length ? 'MISMATCH' : 'identical'}`);
    if (missing.length || a.length !== b.length) problems.push({ table: t, missing: missing.slice(0, 3) });
  }
  return { problems, summary };
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'export') {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the Neon connection string.');
    const { neon } = await import('@neondatabase/serverless');
    const db = neon(process.env.DATABASE_URL);
    const sql = (strings, ...v) => db.query(strings.join(''), v);
    const { sqlText, snapshot } = await exportData(sql);
    mkdirSync('migration', { recursive: true });
    writeFileSync('migration/data.sql', sqlText);
    writeFileSync('migration/neon-snapshot.json', JSON.stringify(snapshot));
    for (const t of TABLES) console.log(`${t.padEnd(24)} ${snapshot[t].length} rows`);
    console.log('\nWrote migration/data.sql and migration/neon-snapshot.json (keep these private: they contain PIN and password hashes).');
  } else if (mode === 'verify') {
    const target = process.argv.includes('--local') ? '--local' : '--remote';
    const snapshot = JSON.parse(readFileSync('migration/neon-snapshot.json', 'utf8'));
    const readTable = t => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'workclock', target, '--json', `--command=SELECT * FROM ${t} ORDER BY 1`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }))[0].results;
    const { problems, summary } = compare(snapshot, readTable);
    console.log(summary.join('\n'));
    if (problems.length) { console.error('\nNOT identical:', JSON.stringify(problems, null, 1)); process.exit(1); }
    console.log('\nEvery row in D1 is identical to Neon.');
  } else {
    console.log('Usage: node scripts/neon-to-d1.mjs export | verify [--local]');
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message || e); process.exit(1); });
