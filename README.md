# WorkClock — Employee Time & Attendance

A generalized, business-neutral employee time clock for Vercel + Neon PostgreSQL.

## Included
- Employee sign-in with approved name + 4-digit PIN
- Employee PIN lockout
- Employee "Forgot PIN" request that emails the manager/admin
- Optional employee email stored for future notifications
- Manager sign-in with rate-limited/locked password attempts
- Manager password change and email-based password recovery
- One-time, expiring manager password reset links
- Server-side revocable sessions
- Clock In / Clock Out with browser GPS
- Configurable Clock Out radius
- Atomic one-open-shift-per-employee rule
- Atomic Clock Out update
- Daily/weekly hours and earnings
- Configurable Project completed paid-day minimum
- Manager employee management and PIN reset
- Rejected Clock Out logging and audit log

## Email setup
This version uses the Resend email API because it works cleanly with Vercel serverless functions.

Set these Vercel environment variables:
- `ADMIN_EMAIL=finecoatpainters.info@gmail.com`
- `RESEND_API_KEY=...`
- `EMAIL_FROM=WorkClock <notifications@your-verified-domain.com>`
- `APP_URL=https://your-production-domain.example`

For production, verify the sending domain in Resend. The admin recipient remains `finecoatpainters.info@gmail.com` unless you change `ADMIN_EMAIL`.

## Required core environment variables
- `DATABASE_URL` — Neon PostgreSQL connection string
- `SESSION_SECRET` — random secret, at least 32 characters
- `CRON_SECRET` — random secret used to authenticate the Vercel stale-shift cron job

## Database
Run `schema.sql` against a fresh Neon database. For an existing WorkClock v2 database, run the same schema; it contains `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` migrations for the email/reset tables.

## Recovery behavior
- Employee forgot PIN: employee enters their approved name. The system sends a notification to `ADMIN_EMAIL`. It does not reveal the PIN.
- Manager forgot password: manager requests a reset link. A single-use link valid for 30 minutes is emailed to `ADMIN_EMAIL`.
- Manager resets an employee PIN from the dashboard; the employee's existing sessions are revoked.

## Deployment
1. Push the complete project, including `vercel.json`, to GitHub. The Vercel Cron schedule is defined there.
2. In Vercel, import the GitHub repository and add all environment variables from `.env.example` under Project Settings → Environment Variables.
3. Set `CRON_SECRET` to a long random value. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when invoking the scheduled function.
4. Deploy to production. The cron schedule in `vercel.json` runs `/api/cron-close-stale-shifts` once daily at 09:00 UTC.
5. In Neon, run `schema.sql` against the production database before employees begin using the application.
6. Create the first manager with `node scripts/create-manager.mjs` using the production `DATABASE_URL`, or run the equivalent SQL securely.
7. After deployment, sign in as manager, configure the job-site latitude/longitude, clock-out radius, payroll settings, and employees.

Use a separate Neon database for testing so test shifts never enter production payroll data. Never commit `.env` or any real secrets to GitHub.
