// Consolidated API dispatcher.
//
// WHY THIS FILE EXISTS:
// Vercel's Hobby plan caps "Other" (non-framework) projects at 12 Serverless
// Functions per deployment. Each file that used to live directly in /api
// (excluding underscore-prefixed helpers) became its own Function, and this
// project had 13 route files -> the deployment was rejected after the build
// step succeeded, which matches the "Build Completed / Deploying outputs..."
// hang with no further detail.
//
// Every one of those 13 files is reproduced below UNCHANGED (same checks,
// same SQL, same order of operations) as a plain function. A single default
// export dispatches to the right one based on the request path. vercel.json
// rewrites every /api/* request to this file, so every URL the frontend
// already calls (/api/employee, /api/clock-in, /api/manager-auth, etc.)
// keeps working exactly as before - nothing in app.js needs to change.
//
// This file is the ONLY thing in /api now (aside from the untouched _db.js
// and _email.js helpers, which Vercel already excludes from function count
// because they start with an underscore), so the deployment now creates a
// single Vercel Function instead of 13.

import {
  sql, norm, json, validCoords, distanceMiles, getCookie, hashToken, newToken,
  requireSameOrigin, getManager, requireManager, setManagerCookie, clearManagerCookie,
  getEmployeeSession, requireEmployee, setEmployeeCookie, clearEmployeeCookie,
  settingNumber, audit
} from './_db.js';
import { adminEmail, safeAdminEmail, appUrl } from './_email.js';

// Shared HTML-escaping helper. Previously duplicated (identically) as
// `esc()` in manager-shift.js and auto-clockout.js, and as `escapeHtml()`
// in clock-out.js. Defined once here; all call sites below use this copy.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ============================================================
   /api/employee  (was api/employee.js)
   ============================================================ */
async function handleEmployeeSelf(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const emp = await requireEmployee(req, res); if (!emp) return;
    const u = new URL(req.url, 'https://workclock.invalid'), start = u.searchParams.get('start'), end = u.searchParams.get('end');
    if (start && Number.isNaN(Date.parse(start))) return json(res, 400, { error: 'Invalid start date.' });
    if (end && Number.isNaN(Date.parse(end))) return json(res, 400, { error: 'Invalid end date.' });
    const maxHours = await settingNumber('max_shift_hours', 12);
    const openRows = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    const open = openRows[0] || null;
    if (open && Date.now() - new Date(open.clock_in).getTime() >= maxHours * 3600000) {
      const cutoff = new Date(new Date(open.clock_in).getTime() + maxHours * 3600000);
      const closed = await sql`UPDATE shifts SET clock_out=${cutoff.toISOString()}::timestamptz,clock_out_source='system',clock_out_note='Automatic 12-hour clock-out',clock_out_message='The maximum shift duration was reached. Please follow the Clock In / Clock Out procedure.',payment_status='actual',paid_minutes=${Math.round(maxHours * 60)} WHERE id=${open.id} AND employee_id=${emp.id} AND clock_out IS NULL RETURNING id`;
      if (closed.length) {
        await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type) VALUES(${open.id},${emp.id},'auto_clock_out','Automatic 12-hour clock-out','The maximum shift duration was reached.','system')`;
        await audit('system', null, 'auto_clock_out', { shift_id: open.id, employee_id: emp.id, paid_minutes: Math.round(maxHours * 60) });
        await safeAdminEmail({ subject: `WorkClock: Automatic 12-hour Clock Out — ${emp.name}`, text: `${emp.name}'s shift was automatically clocked out after ${maxHours} hours.\n\nOpen Manager Portal: ${appUrl(req)}/?manager=1`, html: `<h2>Automatic Clock Out</h2><p><strong>${escapeHtml(emp.name)}</strong>'s shift was automatically clocked out after ${maxHours} hours.</p>` });
      }
    }
    const shifts = await sql`SELECT s.id,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.clock_out_source,s.payment_status,s.paid_minutes,s.approved_at,(SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count FROM shifts s WHERE s.employee_id=${emp.id} AND (${start}::timestamptz IS NULL OR s.clock_in>=${start}::timestamptz) AND (${end}::timestamptz IS NULL OR s.clock_in<${end}::timestamptz) ORDER BY s.clock_in`;
    const paidMinimum = await settingNumber('standard_shift_hours', 8);
    const latestAuto = await sql`SELECT id,clock_in,clock_out,clock_out_note,clock_out_message FROM shifts WHERE employee_id=${emp.id} AND clock_out_source='system' ORDER BY clock_out DESC LIMIT 1`;
    const recentEvents = await sql`SELECT id,event_type,reason,message,created_at FROM shift_events WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 10`;
    const freshOpen = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    return json(res, 200, { authorized: true, employee: { id: emp.id, name: emp.name, job_title: emp.job_title || 'Employee', hourly_wage: emp.hourly_wage }, shifts, openShift: freshOpen[0] || null, events: recentEvents, latestAutoClockout: latestAuto[0] || null, settings: { standard_shift_hours: paidMinimum, max_shift_hours: maxHours, full_shift_threshold_minutes: await settingNumber('full_shift_threshold_minutes', 465) } });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}

/* ============================================================
   /api/employee-auth  (was api/employee-auth.js)
   ============================================================ */
async function handleEmployeeAuth(req, res) {
  try {
    if (req.method === 'GET') {
      const emp = await getEmployeeSession(req);
      return json(res, 200, { authenticated: !!emp, employee: emp ? { id: emp.id, name: emp.name, job_title: emp.job_title || 'Employee' } : null });
    }
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'POST') {
      const b = req.body || {};
      const name = norm(b.name);
      const pin = String(b.pin || '').trim();
      if (!name || !/^\d{4}$/.test(pin)) return json(res, 400, { error: 'Enter your approved name and 4-digit PIN.' });
      const rows = await sql`SELECT id,name,job_title,pin_hash,failed_pin_attempts,pin_locked_until FROM employees WHERE normalized_name=${name} AND active=true LIMIT 1`;
      if (!rows.length) return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      const e = rows[0];
      if (e.pin_locked_until && new Date(e.pin_locked_until) > new Date()) return json(res, 429, { error: 'Too many incorrect PIN attempts. Try again in 10 minutes or contact your manager.' });
      if (!e.pin_hash) return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      const ok = await sql`SELECT crypt(${pin}, ${e.pin_hash})=${e.pin_hash} AS ok`;
      if (!ok[0]?.ok) {
        const changed = await sql`
          UPDATE employees
          SET failed_pin_attempts=failed_pin_attempts+1,
              pin_locked_until=CASE WHEN failed_pin_attempts+1>=5 THEN now()+interval '10 minutes' ELSE pin_locked_until END,
              updated_at=now()
          WHERE id=${e.id}
          RETURNING failed_pin_attempts, pin_locked_until`;
        const next = Number(changed[0]?.failed_pin_attempts || 0);
        if (next >= 5) return json(res, 429, { error: 'Too many incorrect PIN attempts. Login locked for 10 minutes.' });
        return json(res, 401, { error: 'Incorrect employee name or PIN.' });
      }
      await sql`UPDATE employees SET failed_pin_attempts=0,pin_locked_until=null,updated_at=now() WHERE id=${e.id}`;
      const old = getCookie(req, 'wc_employee');
      if (old) await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(old)}`;
      const token = newToken();
      await sql`INSERT INTO employee_sessions(token_hash,employee_id,expires_at) VALUES(${hashToken(token)},${e.id},now()+interval '12 hours')`;
      setEmployeeCookie(res, token);
      await audit('employee', e.id, 'employee_login');
      return json(res, 200, { ok: true, employee: { id: e.id, name: e.name, job_title: e.job_title || 'Employee' } });
    }
    if (req.method === 'DELETE') {
      const tok = getCookie(req, 'wc_employee');
      if (tok) await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(tok)}`;
      clearEmployeeCookie(res);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

/* ============================================================
   /api/employee-pin-reset  (was api/employee-pin-reset.js)
   ============================================================ */
async function handleEmployeePinReset(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 120) return json(res, 400, { error: 'Enter your approved employee name.' });
    const employee = (await sql`SELECT id,name FROM employees WHERE normalized_name=${norm(name)} AND active=true LIMIT 1`)[0];
    // Always return the same success response so the endpoint cannot be used to enumerate employees.
    if (employee) {
      const recent = await sql`SELECT count(*)::int AS n FROM pin_reset_requests WHERE employee_id=${employee.id} AND created_at > now()-interval '15 minutes'`;
      if (Number(recent[0]?.n || 0) < 3) {
        await sql`INSERT INTO pin_reset_requests(employee_id,requested_name) VALUES(${employee.id},${name})`;
        await safeAdminEmail({
          subject: `WorkClock PIN reset request — ${employee.name}`,
          text: `Employee ${employee.name} requested a PIN reset. Sign in to the WorkClock Manager Dashboard and use Reset PIN.\n\nManager dashboard: ${appUrl(req)}/?manager=1\n\nThis message was sent to ${adminEmail()}.`,
          html: `<p><strong>${employee.name}</strong> requested a PIN reset.</p><p>Sign in to the WorkClock Manager Dashboard and use <strong>Reset PIN</strong>.</p><p><a href="${appUrl(req)}/?manager=1">Open Manager Dashboard</a></p>`
        });
      }
    }
    return json(res, 200, { ok: true, message: 'If that employee is active, the manager has been notified. Please wait for your manager to reset your PIN.' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}

/* ============================================================
   /api/clock-in  (was api/clock-in.js)
   ============================================================ */
async function handleClockIn(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {}, lat = Number(b.lat), lng = Number(b.lng);
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    try {
      const sh = await sql`INSERT INTO shifts(employee_id,clock_in_lat,clock_in_lng) VALUES(${emp.id},${lat},${lng}) RETURNING id,clock_in`;
      await audit('employee', emp.id, 'clock_in', { shift_id: sh[0].id });
      return json(res, 200, { ok: true, employee: { id: emp.id, name: emp.name }, shift: sh[0] });
    } catch (e) {
      if (e?.code === '23505') return json(res, 409, { error: 'You are already clocked in.' });
      throw e;
    }
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

/* ============================================================
   /api/clock-out  (was api/clock-out.js)
   ============================================================ */
const ALLOWED = new Set(['End of scheduled shift', 'Personal reason', 'Doctor appointment', 'Emergency', 'Project completed', 'Client request', 'Manager approval', 'Other']);
function cleanMessage(v) { const s = String(v ?? '').trim(); return s.slice(0, 1000); }
async function handleClockOut(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const emp = await requireEmployee(req, res); if (!emp) return;
    const b = req.body || {}, lat = Number(b.lat), lng = Number(b.lng), note = String(b.note || 'End of scheduled shift').trim(), message = cleanMessage(b.message);
    if (!validCoords(lat, lng)) return json(res, 400, { error: 'A valid GPS location is required.' });
    if (!ALLOWED.has(note)) return json(res, 400, { error: 'Please select a valid Clock Out reason.' });
    const sh = await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if (!sh.length) return json(res, 409, { error: 'Already clocked out. You do not have an active Clock In.' });
    const shift = sh[0], miles = distanceMiles(Number(shift.clock_in_lat), Number(shift.clock_in_lng), lat, lng), radius = await settingNumber('clock_out_radius_miles', 3);
    if (miles > radius) {
      await sql`INSERT INTO rejected_clock_outs(shift_id,lat,lng,distance_miles,reason,message) VALUES(${shift.id},${lat},${lng},${miles},${`More than ${radius.toFixed(2)} miles from Clock In`},${message || null})`;
      await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,lat,lng,distance_miles,actor_type,actor_id) VALUES(${shift.id},${emp.id},'clock_out_rejected',${note},${message || null},${lat},${lng},${miles},'employee',${emp.id})`;
      await audit('employee', emp.id, 'clock_out_rejected', { shift_id: shift.id, distance_miles: miles, reason: note, message });
      await safeAdminEmail({ subject: `WorkClock: Clock Out rejected — ${emp.name}`, text: `${emp.name} attempted to Clock Out outside the allowed radius.\n\nReason: ${note}\nDistance: ${miles.toFixed(2)} miles\nAllowed radius: ${radius.toFixed(2)} miles\nTime: ${new Date().toLocaleString()}\n\nThe Clock Out was NOT accepted. The attempt is recorded in the Manager Portal.\n${message ? `Message: ${message}\n` : ''}${appUrl(req)}/?manager=1`, html: `<h2>Clock Out rejected</h2><p><strong>${escapeHtml(emp.name)}</strong> attempted to clock out outside the allowed radius.</p><p>Reason: ${escapeHtml(note)}<br>Distance: ${miles.toFixed(2)} miles<br>Allowed radius: ${radius.toFixed(2)} miles</p>${message ? `<p>Message: ${escapeHtml(message)}</p>` : ''}<p>The attempt was rejected and recorded in the Manager Portal.</p>` });
      return json(res, 403, { error: `CLOCK OUT REJECTED — you are ${miles.toFixed(2)} miles from Clock In. You must be within ${radius.toFixed(2)} miles.`, distance: miles, rejected: true });
    }
    const durationMinutes = Math.max(0, Math.floor((Date.now() - new Date(shift.clock_in).getTime()) / 60000));
    const standardMinutes = Math.round((await settingNumber('standard_shift_hours', 8)) * 60);
    const thresholdMinutes = Math.round(await settingNumber('full_shift_threshold_minutes', 465));
    const autoFullShift = note === 'End of scheduled shift' && durationMinutes >= thresholdMinutes;
    const needsApproval = ['Project completed', 'Client request', 'Manager approval'].includes(note);
    const rows = await sql`UPDATE shifts SET clock_out=now(),clock_out_lat=${lat},clock_out_lng=${lng},clock_out_distance_miles=${miles},clock_out_note=${note},clock_out_message=${message || null},clock_out_source='employee',payment_status=${needsApproval ? 'pending_approval' : autoFullShift ? 'approved_full_shift' : 'actual'},paid_minutes=${autoFullShift ? Math.max(durationMinutes, standardMinutes) : durationMinutes} WHERE id=${shift.id} AND employee_id=${emp.id} AND clock_out IS NULL RETURNING id,clock_in,clock_out,clock_out_distance_miles,clock_out_note,clock_out_message,payment_status,paid_minutes`;
    if (!rows.length) return json(res, 409, { error: 'Already clocked out. This shift was just closed.' });
    await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,lat,lng,distance_miles,actor_type,actor_id) VALUES(${shift.id},${emp.id},'clock_out',${note},${message || null},${lat},${lng},${miles},'employee',${emp.id})`;
    await audit('employee', emp.id, 'clock_out', { shift_id: shift.id, distance_miles: miles, reason: note, message, payment_status: needsApproval ? 'pending_approval' : 'actual' });
    await safeAdminEmail({ subject: `WorkClock: Clock Out — ${emp.name}`, text: `${emp.name} clocked out successfully.\nReason: ${note}\nMessage: ${message || 'None'}\nDistance from Clock In: ${miles.toFixed(2)} miles\nWorked: ${durationMinutes} minutes\nPayment: ${needsApproval ? 'Manager approval required' : autoFullShift ? `Full ${standardMinutes / 60}-hour shift` : 'Actual minutes'}\n\nOpen Manager Portal: ${appUrl(req)}/?manager=1`, html: `<h2>Employee Clock Out</h2><p><strong>${escapeHtml(emp.name)}</strong> clocked out successfully.</p><p>Reason: ${escapeHtml(note)}<br>Message: ${escapeHtml(message || 'None')}<br>Distance: ${miles.toFixed(2)} miles<br>Worked: ${durationMinutes} minutes<br>Payment: ${needsApproval ? 'Manager approval required' : autoFullShift ? `Full ${standardMinutes / 60}-hour shift` : 'Actual minutes'}</p>` });
    return json(res, 200, { ok: true, distance: miles, shift: rows[0] });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}

/* ============================================================
   /api/employees  (was api/employees.js)
   ============================================================ */
function validEmail(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const e = String(value).trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.toLowerCase() : undefined;
}
function validWage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null;
}
function validId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
async function handleEmployees(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'GET') {
      const rows = await sql`SELECT id,name,email,job_title,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin FROM employees WHERE active=true ORDER BY name`;
      return json(res, 200, { employees: rows });
    }
    if (req.method === 'POST') {
      const b = req.body || {}, name = String(b.name || '').trim().replace(/\s+/g, ' '), jobTitle = String(b.jobTitle || 'Employee').trim().replace(/\s+/g, ' '), wage = validWage(b.wage ?? 0), pin = String(b.pin || '').trim(), email = validEmail(b.email);
      if (email === undefined) return json(res, 400, { error: 'Enter a valid employee email or leave it blank.' });
      if (!name || name.length > 120 || !jobTitle || jobTitle.length > 100) return json(res, 400, { error: 'Enter a valid employee name (1–120 characters) and job title.' });
      if (wage === null) return json(res, 400, { error: 'Enter a valid hourly wage.' });
      if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'Enter a 4-digit employee PIN.' });
      const max = Number((await sql`SELECT value FROM app_settings WHERE key='max_active_employees' LIMIT 1`)[0]?.value || 100);
      const count = await sql`SELECT count(*)::int AS n FROM employees WHERE active=true`;
      const existing = await sql`SELECT id FROM employees WHERE normalized_name=${norm(name)} LIMIT 1`;
      if (count[0].n >= max && !existing.length) return json(res, 400, { error: `Maximum ${max} active employees.` });
      const rows = await sql`
        INSERT INTO employees(name,normalized_name,email,job_title,hourly_wage,active,pin_hash,failed_pin_attempts,pin_locked_until,updated_at)
        VALUES(${name},${norm(name)},${email},${jobTitle},${wage},true,crypt(${pin},gen_salt('bf')),0,null,now())
        ON CONFLICT(normalized_name) DO UPDATE SET name=excluded.name,email=excluded.email,job_title=excluded.job_title,hourly_wage=excluded.hourly_wage,active=true,pin_hash=excluded.pin_hash,failed_pin_attempts=0,pin_locked_until=null,updated_at=now()
        RETURNING id,name,email,job_title,hourly_wage,active,true AS has_pin`;
      await sql`DELETE FROM employee_sessions WHERE employee_id=${rows[0].id}`;
      await audit('manager', manager.id, existing.length ? 'employee_reactivated_or_updated' : 'employee_created', { employee_id: rows[0].id });
      return json(res, 200, { employee: rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = req.body || {}, id = validId(b.id);
      if (!id) return json(res, 400, { error: 'Employee id required.' });
      if (b.pin !== undefined) {
        const pin = String(b.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'PIN must be exactly 4 digits.' });
        const rows = await sql`UPDATE employees SET pin_hash=crypt(${pin},gen_salt('bf')),failed_pin_attempts=0,pin_locked_until=null,updated_at=now() WHERE id=${id} AND active=true RETURNING id,name,email,job_title,hourly_wage,active,true AS has_pin`;
        if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
        await sql`DELETE FROM employee_sessions WHERE employee_id=${id}`;
        await audit('manager', manager.id, 'employee_pin_reset', { employee_id: id });
        return json(res, 200, { employee: rows[0] });
      }
      const wage = validWage(b.wage);
      const jobTitle = b.jobTitle === undefined ? null : String(b.jobTitle || '').trim().replace(/\s+/g, ' ');
      if (wage === null) return json(res, 400, { error: 'Invalid wage.' });
      if (jobTitle !== null && (!jobTitle || jobTitle.length > 100)) return json(res, 400, { error: 'Invalid job title.' });
      const rows = jobTitle === null
        ? await sql`UPDATE employees SET hourly_wage=${wage},updated_at=now() WHERE id=${id} AND active=true RETURNING id,name,email,job_title,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin`
        : await sql`UPDATE employees SET hourly_wage=${wage},job_title=${jobTitle},updated_at=now() WHERE id=${id} AND active=true RETURNING id,name,email,job_title,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin`;
      if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
      await audit('manager', manager.id, 'employee_wage_updated', { employee_id: id, wage });
      return json(res, 200, { employee: rows[0] });
    }
    if (req.method === 'DELETE') {
      const id = validId(new URL(req.url, 'https://workclock.invalid').searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'Employee id required.' });
      const rows = await sql`UPDATE employees SET active=false,updated_at=now() WHERE id=${id} AND active=true RETURNING id,name`;
      if (!rows.length) return json(res, 404, { error: 'Employee not found.' });
      await sql`DELETE FROM employee_sessions WHERE employee_id=${id}`;
      await audit('manager', manager.id, 'employee_deactivated', { employee_id: id });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

/* ============================================================
   /api/settings  (was api/settings.js)
   ============================================================ */
const LIMITS={clock_out_radius_miles:[0.1,100],standard_shift_hours:[0.25,24],full_shift_threshold_minutes:[0,1440],max_shift_hours:[1,24],max_active_employees:[1,1000]};
async function handleSettings(req,res){try{const manager=await requireManager(req,res);if(!manager)return;if(req.method==='GET'){const rows=await sql`SELECT key,value FROM app_settings WHERE key IN ('clock_out_radius_miles','standard_shift_hours','full_shift_threshold_minutes','max_shift_hours','max_active_employees')`;const settings={};for(const r of rows)settings[r.key]=Number(r.value);return json(res,200,{settings});}if(req.method!=='PATCH')return json(res,405,{error:'Method not allowed'});if(!requireSameOrigin(req,res))return;const b=req.body||{};for(const [key,[min,max]] of Object.entries(LIMITS)){if(b[key]===undefined)continue;const n=Number(b[key]);if(!Number.isFinite(n)||n<min||n>max)return json(res,400,{error:`Invalid ${key}.`});const value=key==='max_active_employees'||key==='full_shift_threshold_minutes'?String(Math.round(n)):String(n);await sql`INSERT INTO app_settings(key,value,updated_at) VALUES(${key},${value},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;await audit('manager',manager.id,'setting_updated',{key,value});}const rows=await sql`SELECT key,value FROM app_settings WHERE key IN ('clock_out_radius_miles','standard_shift_hours','full_shift_threshold_minutes','max_shift_hours','max_active_employees')`;const settings={};for(const r of rows)settings[r.key]=Number(r.value);return json(res,200,{settings});}catch(e){console.error(e);return json(res,500,{error:'Server error'});}}

/* ============================================================
   /api/manager-shift  (was api/manager-shift.js)
   ============================================================ */
const reasons=new Set(['Manager clock-out','Project completed','Client request','Manager approval','Other']);
async function handleManagerShift(req,res){
 try{
  const manager=await requireManager(req,res);if(!manager)return;if(!requireSameOrigin(req,res))return;
  const b=req.body||{},shiftId=Number(b.shiftId),action=String(b.action||''),reason=String(b.reason||'').trim(),message=String(b.message||'').trim().slice(0,1000);
  if(!Number.isInteger(shiftId)||shiftId<1)return json(res,400,{error:'Valid shift id required.'});
  if(action==='clock_out'){
   if(!reasons.has(reason))return json(res,400,{error:'Select a valid manager Clock Out reason.'});
   const sh=await sql`SELECT s.id,s.employee_id,s.clock_in,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.id=${shiftId} AND s.clock_out IS NULL LIMIT 1`;
   if(!sh.length)return json(res,409,{error:'Already clocked out.'});
   const minutes=Math.max(0,Math.floor((Date.now()-new Date(sh[0].clock_in).getTime())/60000));
   const rows=await sql`UPDATE shifts SET clock_out=now(),clock_out_source='manager',clock_out_note=${reason},clock_out_message=${message||null},payment_status='manager_adjusted',paid_minutes=${minutes} WHERE id=${shiftId} AND clock_out IS NULL RETURNING id,clock_in,clock_out,clock_out_note,clock_out_message,paid_minutes`;
   if(!rows.length)return json(res,409,{error:'Already clocked out.'});
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${shiftId},${sh[0].employee_id},'manager_clock_out',${reason},${message||null},'manager',${manager.id})`;
   await audit('manager',manager.id,'manager_clock_out',{shift_id:shiftId,employee_id:sh[0].employee_id,reason,message});
   return json(res,200,{ok:true,shift:rows[0]});
  }
  if(action==='approve_full_shift'){
   const standard=await settingNumber('standard_shift_hours',8),min=await settingNumber('full_shift_threshold_minutes',465),sh=await sql`SELECT s.id,s.employee_id,s.clock_in,s.clock_out,s.payment_status,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.id=${shiftId} AND s.clock_out IS NOT NULL LIMIT 1`;
   if(!sh.length)return json(res,404,{error:'Shift not found.'});
   const actual=Math.max(0,Math.floor((new Date(sh[0].clock_out)-new Date(sh[0].clock_in))/60000));
   if(!['pending_approval','actual'].includes(sh[0].payment_status))return json(res,400,{error:'This shift is already manager-adjusted.'});
   if(actual<1)return json(res,400,{error:'Shift has no payable minutes.'});
   const rows=await sql`UPDATE shifts SET payment_status='approved_full_shift',paid_minutes=${Math.max(actual,Math.round(standard*60))},approved_by_manager_id=${manager.id},approved_at=now() WHERE id=${shiftId} RETURNING id,payment_status,paid_minutes`;
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${shiftId},${sh[0].employee_id},'full_shift_approved','Manager approved full shift',${`Paid as ${standard} hours; actual ${actual} minutes. Threshold ${min} minutes.`},'manager',${manager.id})`;
   await audit('manager',manager.id,'full_shift_approved',{shift_id:shiftId,employee_id:sh[0].employee_id,actual_minutes:actual,paid_minutes:Math.max(actual,Math.round(standard*60))});
   return json(res,200,{ok:true,shift:rows[0]});
  }
  return json(res,400,{error:'Unknown manager shift action.'});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}

/* ============================================================
   /api/manager  (was api/manager.js)
   ============================================================ */
function actualMinutes(a,b){return Math.max(0,Math.floor((new Date(b||Date.now())-new Date(a))/60000));}
function paidMinutes(x,standardMinutes){if(x.payment_status==='approved_full_shift')return Math.max(Number(x.paid_minutes||0),standardMinutes);return Number(x.paid_minutes??actualMinutes(x.clock_in,x.clock_out));}
async function handleManager(req,res){
 try{
  const manager=await requireManager(req,res);if(!manager)return;
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const u=new URL(req.url,'https://workclock.invalid'),startText=u.searchParams.get('start'),endText=u.searchParams.get('end');
  if(!startText||!endText||Number.isNaN(Date.parse(startText))||Number.isNaN(Date.parse(endText)))return json(res,400,{error:'Valid start and end are required.'});
  const start=new Date(startText),end=new Date(endText);if(!(end>start)||(end-start)>8*86400000)return json(res,400,{error:'Invalid date range.'});
  const employees=await sql`SELECT id,name,email,job_title,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin FROM employees WHERE active=true ORDER BY name`;
  const shifts=await sql`SELECT s.id,e.id AS employee_id,e.name,e.job_title,e.hourly_wage,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.clock_out_source,s.payment_status,s.paid_minutes,s.approved_at,(SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count,(SELECT count(*)::int FROM shift_events ev WHERE ev.shift_id=s.id AND ev.event_type='clock_out_rejected') AS rejected_attempts FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.clock_in>=${start.toISOString()}::timestamptz AND s.clock_in<${end.toISOString()}::timestamptz ORDER BY s.clock_in DESC`;
  const events=await sql`SELECT ev.id,ev.shift_id,ev.employee_id,e.name,e.job_title,ev.event_type,ev.reason,ev.message,ev.lat,ev.lng,ev.distance_miles,ev.actor_type,ev.created_at FROM shift_events ev LEFT JOIN employees e ON e.id=ev.employee_id WHERE ev.created_at>=${start.toISOString()}::timestamptz AND ev.created_at<${end.toISOString()}::timestamptz ORDER BY ev.created_at DESC LIMIT 500`;
  const standardMinutes=Math.round((await settingNumber('standard_shift_hours',8))*60),weekly={};
  for(const e of employees)weekly[e.id]={employee_id:e.id,name:e.name,job_title:e.job_title,wage:Number(e.hourly_wage||0),days:Array(7).fill(0),actual_days:Array(7).fill(0)};
  const summary={total_paid_hours:0,total_payroll:0,rejected_clock_outs:0,pending_approvals:0};
  for(const x of shifts){const ci=new Date(x.clock_in),i=Math.floor((ci-start)/86400000),pm=paidMinutes(x,standardMinutes),am=actualMinutes(x.clock_in,x.clock_out),e=weekly[x.employee_id];summary.rejected_clock_outs+=Number(x.rejected_attempts||0);if(x.payment_status==='pending_approval')summary.pending_approvals++;if(i>=0&&i<7&&e){e.days[i]+=pm;e.actual_days[i]+=am;}summary.total_paid_hours+=pm/60;summary.total_payroll+=(pm/60)*Number(x.hourly_wage||0);}
  for(const e of Object.values(weekly)){e.days=e.days.map(v=>v/60);e.actual_days=e.actual_days.map(v=>v/60);e.total=e.days.reduce((a,b)=>a+b,0);e.earnings=e.days.reduce((a,b)=>a+b,0)*e.wage;}
  return json(res,200,{employees,shifts,events,summary,weekly:Object.values(weekly),settings:{standard_shift_hours:standardMinutes/60,full_shift_threshold_minutes:await settingNumber('full_shift_threshold_minutes',465),max_shift_hours:await settingNumber('max_shift_hours',12)}});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}

/* ============================================================
   /api/manager-password  (was api/manager-password.js)
   ============================================================ */
async function handleManagerPassword(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const b = req.body || {}, current = String(b.currentPassword || ''), next = String(b.newPassword || '');
    if (!current || !next) return json(res, 400, { error: 'Current and new password are required.' });
    if (next.length < 12 || next.length > 200) return json(res, 400, { error: 'New password must be 12–200 characters.' });
    const ok = await sql`SELECT id FROM manager_users WHERE id=${manager.id} AND active=true AND password_hash=crypt(${current},password_hash) LIMIT 1`;
    if (!ok.length) return json(res, 401, { error: 'Current manager password is incorrect.' });
    await sql`UPDATE manager_users SET password_hash=crypt(${next},gen_salt('bf')),password_changed_at=now(),failed_login_attempts=0,locked_until=null WHERE id=${manager.id}`;
    await sql`DELETE FROM manager_sessions WHERE manager_user_id=${manager.id}`;
    clearManagerCookie(res);
    await audit('manager', manager.id, 'manager_password_changed');
    return json(res, 200, { ok: true, signedOut: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

/* ============================================================
   /api/manager-auth  (was api/manager-auth.js)
   ============================================================ */
async function handleManagerAuth(req, res) {
  try {
    if (req.method === 'GET') {
      const s = await getManager(req);
      return json(res, 200, { authenticated: !!s, username: s?.username || null });
    }
    if (!requireSameOrigin(req, res)) return;
    if (req.method === 'POST') {
      const b = req.body || {}, username = norm(b.username), password = String(b.password || '');
      if (!username || !password) return json(res, 400, { error: 'Username and password are required.' });
      const rows = await sql`SELECT id,username,password_hash,failed_login_attempts,locked_until FROM manager_users WHERE lower(username)=${username} AND active=true LIMIT 1`;
      if (!rows.length) return json(res, 401, { error: 'Incorrect manager username or password.' });
      const m = rows[0];
      if (m.locked_until && new Date(m.locked_until) > new Date()) return json(res, 429, { error: 'Too many incorrect attempts. Try again in 10 minutes.' });
      const ok = await sql`SELECT crypt(${password},${m.password_hash})=${m.password_hash} AS ok`;
      if (!ok[0]?.ok) {
        const changed = await sql`
          UPDATE manager_users
          SET failed_login_attempts=failed_login_attempts+1,
              locked_until=CASE WHEN failed_login_attempts+1>=5 THEN now()+interval '10 minutes' ELSE locked_until END
          WHERE id=${m.id}
          RETURNING failed_login_attempts`;
        const attempts = Number(changed[0]?.failed_login_attempts || 0);
        if (attempts >= 5) return json(res, 429, { error: 'Too many incorrect attempts. Login locked for 10 minutes.' });
        return json(res, 401, { error: 'Incorrect manager username or password.' });
      }
      await sql`UPDATE manager_users SET failed_login_attempts=0,locked_until=null WHERE id=${m.id}`;
      const old = getCookie(req, 'wc_manager');
      if (old) await sql`DELETE FROM manager_sessions WHERE token_hash=${hashToken(old)}`;
      const token = newToken();
      await sql`INSERT INTO manager_sessions(token_hash,manager_user_id,expires_at) VALUES(${hashToken(token)},${m.id},now()+interval '12 hours')`;
      setManagerCookie(res, token);
      await audit('manager', m.id, 'manager_login');
      return json(res, 200, { ok: true, username: m.username });
    }
    if (req.method === 'DELETE') {
      const tok = getCookie(req, 'wc_manager');
      if (tok) await sql`DELETE FROM manager_sessions WHERE token_hash=${hashToken(tok)}`;
      clearManagerCookie(res);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

/* ============================================================
   /api/manager-password-reset  (was api/manager-password-reset.js)
   ============================================================ */
async function handleManagerPasswordReset(req, res) {
  try {
    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      const username = norm(req.body?.username);
      if (!username) return json(res, 400, { error: 'Enter the manager username.' });
      const rows = await sql`SELECT id,username FROM manager_users WHERE lower(username)=${username} AND active=true LIMIT 1`;
      // Generic response prevents username enumeration.
      if (rows.length) {
        const recent = await sql`SELECT count(*)::int AS n FROM manager_reset_tokens WHERE manager_user_id=${rows[0].id} AND created_at > now()-interval '15 minutes' AND used_at IS NULL`;
        if (Number(recent[0]?.n || 0) < 3) {
          const token = newToken();
          await sql`INSERT INTO manager_reset_tokens(token_hash,manager_user_id,expires_at) VALUES(${hashToken(token)},${rows[0].id},now()+interval '30 minutes')`;
          const link = `${appUrl(req)}/?manager=1&reset=${encodeURIComponent(token)}`;
          await safeAdminEmail({
            subject: 'WorkClock manager password reset',
            text: `A manager password reset was requested. This link expires in 30 minutes and can be used once:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
            html: `<p>A manager password reset was requested.</p><p><a href="${link}">Reset Manager Password</a></p><p>This link expires in 30 minutes and can be used once.</p><p>If you did not request this, ignore this email.</p>`
          });
        }
      }
      return json(res, 200, { ok: true, message: `If the manager account exists, a reset link has been sent to ${adminEmail()}.` });
    }
    if (req.method === 'PATCH') {
      if (!requireSameOrigin(req, res)) return;
      const token = String(req.body?.token || ''), password = String(req.body?.newPassword || '');
      if (!token || password.length < 12 || password.length > 200) return json(res, 400, { error: 'Use a new password between 12 and 200 characters.' });
      const rows = await sql`SELECT manager_user_id FROM manager_reset_tokens WHERE token_hash=${hashToken(token)} AND used_at IS NULL AND expires_at>now() LIMIT 1`;
      if (!rows.length) return json(res, 400, { error: 'This reset link is invalid or expired. Request a new one.' });
      await sql`UPDATE manager_users SET password_hash=crypt(${password},gen_salt('bf')),password_changed_at=now(),failed_login_attempts=0,locked_until=null WHERE id=${rows[0].manager_user_id}`;
      await sql`UPDATE manager_reset_tokens SET used_at=now() WHERE token_hash=${hashToken(token)}`;
      await sql`DELETE FROM manager_sessions WHERE manager_user_id=${rows[0].manager_user_id}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) { console.error(e); return json(res, 500, { error: 'Server error' }); }
}

/* ============================================================
   /api/auto-clockout  (was api/auto-clockout.js — called by Vercel Cron)
   ============================================================ */
async function handleAutoClockout(req,res){
 try{
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const supplied=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!process.env.CRON_SECRET||supplied!==process.env.CRON_SECRET)return json(res,401,{error:'Unauthorized'});
  const maxHours=await settingNumber('max_shift_hours',12),rows=await sql`SELECT s.id,s.employee_id,s.clock_in,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.clock_out IS NULL AND s.clock_in <= now()-(${maxHours} * interval '1 hour') ORDER BY s.clock_in LIMIT 100`;
  let closed=0;
  for(const s of rows){
   const cutoff=new Date(new Date(s.clock_in).getTime()+maxHours*3600000);
   const minutes=Math.max(0,Math.floor((cutoff-new Date(s.clock_in).getTime())/60000));
   const r=await sql`UPDATE shifts SET clock_out=${cutoff.toISOString()}::timestamptz,clock_out_source='system',clock_out_note='Automatic 12-hour clock-out',clock_out_message='The maximum shift duration was reached. Please follow the Clock In / Clock Out procedure.',payment_status='actual',paid_minutes=${minutes} WHERE id=${s.id} AND clock_out IS NULL RETURNING id`;
   if(!r.length)continue;
   closed++;
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${s.id},${s.employee_id},'auto_clock_out','Automatic 12-hour clock-out','The maximum shift duration was reached.','system',NULL)`;
   await audit('system',null,'auto_clock_out',{shift_id:s.id,employee_id:s.employee_id,paid_minutes:minutes});
   await safeAdminEmail({subject:`WorkClock: Automatic 12-hour Clock Out — ${s.name}`,text:`${s.name}'s shift was automatically clocked out after ${maxHours} hours.\nPaid minutes: ${minutes}.\n\nOpen Manager Portal: ${appUrl(req)}/?manager=1`,html:`<h2>Automatic Clock Out</h2><p><strong>${escapeHtml(s.name)}</strong>'s shift was automatically clocked out after ${maxHours} hours.</p><p>Paid minutes: ${minutes}</p>`});
  }
  return json(res,200,{ok:true,closed,checked:rows.length});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}

/* ============================================================
   Dispatcher — one Vercel Function serving every /api/* route.
   vercel.json rewrites "/api/(.*)" to this file, so req.url still
   carries the ORIGINAL requested path (e.g. /api/clock-in); we just
   read its pathname to pick the right handler above.
   ============================================================ */
const ROUTES = {
  '/api/employee': handleEmployeeSelf,
  '/api/employee-auth': handleEmployeeAuth,
  '/api/employee-pin-reset': handleEmployeePinReset,
  '/api/clock-in': handleClockIn,
  '/api/clock-out': handleClockOut,
  '/api/employees': handleEmployees,
  '/api/settings': handleSettings,
  '/api/manager-shift': handleManagerShift,
  '/api/manager': handleManager,
  '/api/manager-password': handleManagerPassword,
  '/api/manager-auth': handleManagerAuth,
  '/api/manager-password-reset': handleManagerPasswordReset,
  '/api/auto-clockout': handleAutoClockout,
};

export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'https://workclock.invalid');
  const route = ROUTES[pathname];
  if (!route) return json(res, 404, { error: 'Not found' });
  return route(req, res);
}
