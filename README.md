# WorkClock — Employee Time & Attendance

A business-neutral employee time clock for Vercel + Neon PostgreSQL. The project uses ordinary Vercel serverless functions and a client-side map; no paid Vercel add-on or separate backend service is required.

## Included
- Employee sign-in with approved name + 4-digit PIN
- Employee PIN lockout and rate-limited reset requests
- Employee title shown under the employee name (Painter, Assistant painter, Office administrator, etc.)
- Manager sign-in with password lockout and IP-based rate limiting
- Manager password change and email-based password recovery
- Server-side revocable sessions using an HMAC derived from `SESSION_SECRET`
- Clock In / Clock Out with browser GPS
- Configurable Clock Out radius, default 3 miles
- Out-of-radius Clock Out attempts are rejected, but the attempted GPS location, reason, and optional message are saved
- Out-of-radius attempts email the configured manager/admin recipient
- Next-day employee notice after a rejected location attempt
- Clock Out reasons: Ending shift, Personal reason, Doctor appointment, Emergency, Project completed, Client request, Manager approval
- Optional Clock Out message
- Personal-reason clock-outs are paid for actual working time
- Normal shifts reaching 7 hours 45 minutes are paid as a full 8-hour shift
- Project completed, Client request, and Manager approval are paid at the configured minimum by default and marked for manager review
- Manager can approve full hours, actual hours, or custom hours per exception shift
- Custom-hours review can also correct a wrong clock-out time, for shifts left running overnight or over a weekend
- Rolling data retention: time data older than the configured window (default 6 months) is deleted nightly
- Manager can force Clock Out for an employee from the dashboard
- One-open-shift-per-employee constraint and race-safe Clock Out update
- Daily/weekly calculations split overnight shifts across calendar-day boundaries
- Shift queries include shifts that overlap the selected period, including shifts that started before the period
- Employee portal shows daily hours and earnings, including short 15/30-minute shifts
- Employee portal shows Clock In and Clock Out pins on the same map
- Manager portal puts Shift Details at the top and includes day names
- Manager portal shows rejection/exception history, reasons, optional messages, review status, earnings, and GPS links
- Manager employee management including title, wage, email, and PIN reset
- No "Manager Dashboard" link is shown on the employee portal

## Email setup
Set these Vercel environment variables:
- `ADMIN_EMAIL` — manager/admin notification recipient
- `RESEND_API_KEY` — Resend API key
- `EMAIL_FROM` — verified sender, for example `WorkClock <notifications@your-verified-domain.com>`
- `APP_URL` — production WorkClock URL

## Required core environment variables
- `DATABASE_URL` — Neon PostgreSQL connection string
- `SESSION_SECRET` — random secret, at least 32 characters
- `CRON_SECRET` — random secret used to authorize the nightly retention job. Vercel sends it automatically as `Authorization: Bearer $CRON_SECRET` once the variable is set. **If it is not set, the nightly cleanup will not run** and old data is kept until a manager runs it manually.

## Database
Run `schema.sql` against a fresh Neon database. It is also written to migrate the existing WorkClock schema with `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements.

Important added migration fields include employee titles, clock-out messages, manager review fields, rejected-attempt messages/IP data, and authentication rate-limit records.

## Payroll rules in this version
- Personal reason: actual hours only.
- Ending shift: actual hours, except a shift at or above 7.75 hours receives the configured minimum (normally 8.00 hours).
- Project completed, Client request, Manager approval: minimum paid hours (normally 8.00) and a manager review flag. The manager can later approve actual hours instead.
- Manager forced Clock Out: actual hours unless the manager later changes the payment review.
- Custom hours: the manager sets the paid hours directly (0–24). This overrides every other rule, including a previous forced clock-out, and is the option to use when a shift was left running by mistake.

## Missed clock-outs
If an employee clocks in on, say, Thursday and does not clock out until Monday, the shift records ~97 actual hours. Approving actual or full hours would pay all of them. The **Custom hours…** option in Shift Details lets the manager set the real paid hours and correct the clock-out timestamp in one step.

Correcting the clock-out matters: paid hours are spread across the calendar days a shift covers, so 8 custom hours on an uncorrected 4-day shift would be split across all four days (~2h each). With the clock-out corrected, all 8 hours land on the day actually worked. The dialog prefills the corrected clock-out as clock-in plus the standard day, so the common case is one confirmation. The original timestamp is preserved in `shifts.manager_original_clock_out` and the change is written to the audit log.

## Data retention
WorkClock keeps a rolling window of time data, set in Manager Portal → Data Retention (default 6 months, range 1–120).

A nightly Vercel cron (`vercel.json`, 03:00 UTC) calls `/api/retention` and deletes, from before the cutoff: completed shifts and their rejected-attempt and forced-clock-out history (via `ON DELETE CASCADE`), audit logs, login-attempt records, and PIN reset requests. Expired sessions and reset tokens are cleared on every run.

Never deleted: employees, wages, titles, PINs, manager accounts, and app settings. Open (not yet clocked-out) shifts are also never deleted, however old, so an employee still on the clock cannot be stranded.

Managers can use **Check what would be removed** for a dry run that deletes nothing, or **Run cleanup now** to purge immediately after confirming. Each run is recorded in `retention_runs` and the audit log.

## Deployment
GitHub repository → Vercel project → Neon database. Existing Vercel/Neon setup can be retained. The only client-side addition is Leaflet + OpenStreetMap tiles for the two-location map; it does not require a Vercel server resource or API route.
