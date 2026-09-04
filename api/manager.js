import { sql, json, requireManager, getPaySettings, computePaidHours, needsApproval } from './_db.js';

const FULL_DAY_REASONS = new Set(['project completed', 'client request']);
const PERSONAL_REASONS = new Set(['personal reason', 'doctor appointment', 'emergency']);

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const u = new URL(req.url, 'https://workclock.invalid'), startText = u.searchParams.get('start'), endText = u.searchParams.get('end');
    if (!startText || !endText || Number.isNaN(Date.parse(startText)) || Number.isNaN(Date.parse(endText))) return json(res, 400, { error: 'Valid start and end are required.' });
    const start = new Date(startText), end = new Date(endText);
    if (!(end > start) || (end - start) > 8 * 86400000) return json(res, 400, { error: 'Invalid date range.' });

    const settings = await getPaySettings();

    const employees = await sql`
      SELECT e.id,e.name,e.hourly_wage,e.active,
             EXISTS(SELECT 1 FROM shifts s WHERE s.employee_id=e.id AND s.clock_out IS NULL) AS has_open_shift
      FROM employees e WHERE e.active=true ORDER BY e.name`;

    const shifts = await sql`
      SELECT s.id,e.id AS employee_id,e.name,e.hourly_wage,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,
             s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,
             s.cancelled,s.auto_clocked_out,s.closed_by_manager,s.approval_status,s.approved_paid_hours,
             (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
      FROM shifts s JOIN employees e ON e.id=s.employee_id
      WHERE s.clock_in>=${start.toISOString()}::timestamptz AND s.clock_in<${end.toISOString()}::timestamptz
      ORDER BY s.clock_in DESC`;

    const q = (u.searchParams.get('search') || '').trim().toLowerCase();
    const rows = q ? shifts.filter(x => String(x.name).toLowerCase().includes(q)) : shifts;

    const summary = { total_paid_hours: 0, total_payroll: 0, rejected_clock_outs: 0 };
    const weekly = {};
    for (const e of employees) weekly[e.id] = { employee_id: e.id, name: e.name, wage: Number(e.hourly_wage || 0), days: [0,0,0,0,0,0,0] };
    for (const x of shifts) {
      const paid = computePaidHours(x, settings);
      const wage = Number(x.hourly_wage || 0);
      summary.total_paid_hours += paid;
      summary.total_payroll += paid * wage;
      summary.rejected_clock_outs += Number(x.rejected_count || 0);
      const w = weekly[x.employee_id];
      if (w && x.clock_out) {
        const idx = Math.floor((new Date(x.clock_in) - start) / 86400000);
        if (idx >= 0 && idx < 7) w.days[idx] += paid;
      }
    }
    for (const w of Object.values(weekly)) { w.total = w.days.reduce((a, b) => a + b, 0); w.earnings = w.total * w.wage; }

    // --- Exceptions: everything worth the manager's attention, surfaced in
    // one place instead of email, per your request.
    const radiusRejections = await sql`
      SELECT r.id, e.name, r.distance_miles, r.reason, r.created_at
      FROM rejected_clock_outs r
      JOIN shifts s ON s.id=r.shift_id
      JOIN employees e ON e.id=s.employee_id
      WHERE r.created_at>=${start.toISOString()}::timestamptz AND r.created_at<${end.toISOString()}::timestamptz
      ORDER BY r.created_at DESC`;

    const overtime = [], earlyPersonal = [], pendingApproval = [];
    for (const x of shifts) {
      if (!x.clock_out || x.cancelled) continue;
      const actual = Math.max(0, (new Date(x.clock_out) - new Date(x.clock_in)) / 3600000);
      const paid = computePaidHours(x, settings);
      const note = String(x.clock_out_note || '').toLowerCase();
      if (actual > settings.project_completed_min_paid_hours + 0.01 && !x.auto_clocked_out) {
        overtime.push({ shiftId: x.id, name: x.name, date: x.clock_in, actualHours: actual, overBy: actual - settings.project_completed_min_paid_hours });
      }
      if (PERSONAL_REASONS.has(note)) {
        earlyPersonal.push({ shiftId: x.id, name: x.name, date: x.clock_in, reason: x.clock_out_note, message: x.clock_out_message, actualHours: actual, paidHours: paid });
      }
      if (needsApproval(x, settings)) {
        pendingApproval.push({ shiftId: x.id, name: x.name, date: x.clock_in, reason: x.clock_out_note, message: x.clock_out_message, actualHours: actual, provisionalPaidHours: paid });
      }
      if (x.auto_clocked_out && !x.approval_status) {
        pendingApproval.push({ shiftId: x.id, name: x.name, date: x.clock_in, reason: 'Auto clock-out (12h)', message: null, actualHours: actual, provisionalPaidHours: paid, isAutoClose: true });
      }
    }

    return json(res, 200, {
      employees, shifts: rows, summary, weekly: Object.values(weekly),
      settings: {
        clock_out_radius_miles: settings.clock_out_radius_miles,
        project_completed_min_paid_hours: settings.project_completed_min_paid_hours,
        full_day_round_threshold_hours: settings.full_day_round_threshold_hours
      },
      exceptions: { radiusRejections, overtime, earlyPersonal, pendingApproval }
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
