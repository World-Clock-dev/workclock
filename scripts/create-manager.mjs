import { neon } from '@neondatabase/serverless';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required.'); process.exit(1); }
const sql = neon(url);
const rl = createInterface({ input, output });
try {
  const username = (await rl.question('Manager username [manager]: ')).trim().toLowerCase() || 'manager';
  const password = await rl.question('Manager password (12+ characters): ', { hideEchoBack: true });
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    INSERT INTO manager_users(username,password_hash,active,failed_login_attempts,locked_until,password_changed_at)
    VALUES(${username},crypt(${password},gen_salt('bf')),true,0,null,now())
    ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,active=true,failed_login_attempts=0,locked_until=null,password_changed_at=now()`;
  console.log(`Manager account '${username}' is ready.`);
} finally { rl.close(); }
