# WorkClock on Cloudflare (Workers + D1)

This branch (`cloudflare-d1`) runs WorkClock on Cloudflare's free plan:

| Part | Vercel + Neon (main) | Cloudflare (this branch) |
|---|---|---|
| Front end | Vercel static files | Workers Static Assets (same files, unchanged) |
| API | 12 Vercel functions in `api/` | One Worker (`src/worker.js`) running the same `api/` handlers |
| Database | Neon Postgres | Cloudflare D1 (`schema.d1.sql`) |
| Nightly cleanup | Vercel cron, 03:00 UTC | Cron Trigger, 03:00 UTC |
| PIN/password check | Postgres `pgcrypto` | `bcryptjs` in the Worker (reads the same hashes) |
| Address | your Vercel URL | `https://workclock-w5qy0n.wc7ptpfk.workers.dev` |

There is no 12-function limit on Cloudflare, so new endpoints can be added as new files.
No custom domain or company subdomain is configured; the app uses only the random
`workers.dev` address.

## What changed in the code

- `api/_db.js`: the `sql` helper now talks to D1. It returns values in exactly the
  shapes the Neon driver returned (ids and money as strings like `"15.00"`,
  true/false, JSON objects), so `app.js` receives identical JSON.
- Every query: Postgres-only syntax (`now()`, `interval`, `::casts`, `crypt()`,
  `CURRENT_DATE`, the data-modifying `WITH`) replaced with SQLite equivalents.
  Times are stored as ISO-8601 UTC text. Money and hours are rounded to 2
  decimals on save, as Postgres `NUMERIC(10,2)` did.
- Payroll rules (`api/_time.js`), clock-out reasons, review logic, retention
  rules and the front end (`index.html`, `app.js`, `style.css`) are unchanged.

## Testing done before any move

The original code (Postgres) and this version (D1, run locally in Cloudflare's
own `workerd` runtime) were given identical data and identical requests, and
every answer was compared:

- 97 of 97 checks identical: logins (including hashes made by Postgres), employee
  management, 14 kinds of historical shift (8-hour, 7h50→8h, personal reason,
  project/client/manager review, overnight, Sunday→Monday, 97-hour missed
  clock-out with custom hours, forced clock-out, out-of-radius), three payroll
  weeks, employee reports, the employee portal, live clock-in/out, manager
  reviews and corrections, settings, retention, PIN/password lockouts, password
  change and reset, and the final contents of every table.
- 10 simultaneous clock-ins (or clock-outs) for one employee: exactly one succeeds.
- Cross-site requests, malformed input and SQL-injection attempts are refused.
- The nightly Cron Trigger runs the retention job.
- Migration: data exported from Postgres and imported into D1 was identical in all
  13 tables, and both versions then showed the same payroll screens.

## Known differences (none affect payroll or data)

1. **Everyone signs in once** on the new address. Browser logins, the saved
   English/Spanish choice and location permission belong to the old address.
2. **Id gaps:** Postgres skipped an id after a failed insert (for example a
   double-tapped Clock In). D1 does not. Ids are never reused either way.
3. **Login CPU time:** a PIN check takes about 5 ms; the free plan allows 10 ms
   per request. If Cloudflare ever reports CPU-limit errors on login, the fix is
   to re-hash on next login. No PIN would need resetting.

## Live setup (done)

- D1 database `workclock` (id `8be6128e-c08a-41c4-bb45-e1853d04af04`), Eastern North America, schema applied.
- Worker `workclock-w5qy0n`, built automatically by Cloudflare from the `cloudflare-d1` branch.
- Account `workers.dev` name changed to a random `wc7ptpfk` so the address carries no company name.
  No custom domain or route is attached.

## Data move (done 18 Nov 2026)

All data was copied from Neon on 18 Nov 2026. `scripts/neon-export-query.sql`, run
read-only in Neon's SQL Editor, produced the D1 INSERT statements. They were loaded
in the D1 console and checked table by table against Neon: row counts, id sums, pay
hours, wages, first and last times and text lengths all match. Three values containing
line breaks were then copied byte-for-byte. The live Neon schema had 14 legacy columns
that `schema.sql` didn't list; they were added to D1 (see the end of `schema.d1.sql`).

## Deploying from scratch (reference)

```bash
npm install
npx wrangler login                      # opens Cloudflare in the browser
npx wrangler d1 create workclock        # paste the database_id into wrangler.toml
npx wrangler d1 execute workclock --remote --file=schema.d1.sql

# Secrets: copy SESSION_SECRET exactly from Vercel.
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put APP_URL         # the new workers.dev address

npx wrangler deploy
```

## Moving the data (cutover)

1. Pick a quiet time (for example late evening) and tell staff not to clock in or
   out for about 15 minutes.
2. Export from Neon (read-only):
   `DATABASE_URL='<neon url>' node scripts/neon-to-d1.mjs export`
3. Import: `npx wrangler d1 execute workclock --remote --file=migration/data.sql`
4. Verify every row: `node scripts/neon-to-d1.mjs verify`
5. Check the new address (manager login, this week's Shift Details), then share
   the new link with staff.
6. Keep Vercel and Neon running, unchanged, as a fallback for a few weeks.

`migration/` holds PIN and password hashes. It is in `.gitignore`; delete it after
the move.

## Local development

```bash
cp .dev.vars.example .dev.vars          # set SESSION_SECRET
npm run db:schema:local
node scripts/create-manager.mjs --local
npm run dev                             # http://localhost:8787
```
