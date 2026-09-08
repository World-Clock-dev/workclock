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
- Manager can approve full hours or actual hours per exception shift
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

## Database
Run `schema.sql` against a fresh Neon database. It is also written to migrate the existing WorkClock schema with `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements.

Important added migration fields include employee titles, clock-out messages, manager review fields, rejected-attempt messages/IP data, and authentication rate-limit records.

## Payroll rules in this version
- Personal reason: actual hours only.
- Ending shift: actual hours, except a shift at or above 7.75 hours receives the configured minimum (normally 8.00 hours).
- Project completed, Client request, Manager approval: minimum paid hours (normally 8.00) and a manager review flag. The manager can later approve actual hours instead.
- Manager forced Clock Out: actual hours unless the manager later changes the payment review.

## Deployment
GitHub repository → Vercel project → Neon database. Existing Vercel/Neon setup can be retained. The only client-side addition is Leaflet + OpenStreetMap tiles for the two-location map; it does not require a Vercel server resource or API route.
