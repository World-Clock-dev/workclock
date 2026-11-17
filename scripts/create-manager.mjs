// Create or reset a manager account in the Cloudflare D1 database.
//   node scripts/create-manager.mjs            (remote D1, the live database)
//   node scripts/create-manager.mjs --local    (local development database)
// The password is hashed here with bcrypt (the same format pgcrypto produced),
// written to a temporary SQL file and applied with `wrangler d1 execute`.
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv.includes('--local') ? '--local' : '--remote';
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const rl = createInterface({ input, output });
let file;
try {
  const username = (await rl.question('Manager username [manager]: ')).trim().toLowerCase() || 'manager';
  const password = await rl.question('Manager password (12+ characters): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const hash = await bcrypt.hash(password, 6);
  const now = new Date().toISOString();
  const dir = mkdtempSync(join(tmpdir(), 'workclock-'));
  file = join(dir, 'manager.sql');
  writeFileSync(file, `INSERT INTO manager_users(username,password_hash,active,failed_login_attempts,locked_until,password_changed_at)
VALUES(${q(username)},${q(hash)},1,0,NULL,${q(now)})
ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,active=1,failed_login_attempts=0,locked_until=NULL,password_changed_at=excluded.password_changed_at;\n`);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'workclock', target, `--file=${file}`], { stdio: 'inherit' });
  console.log(`Manager account '${username}' is ready (${target.slice(2)} database).`);
} finally {
  rl.close();
  if (file) try { unlinkSync(file); } catch {}
}
