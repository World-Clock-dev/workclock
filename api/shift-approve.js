import { sql, json, requireManager, requireSameOrigin, audit } from './_db.js';

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;

    const shiftId = Number(req.body?.shiftId);
    const action = String(req.body?.action || '');
    if (!Number.isInteger(shiftId) || shiftId <= 0) return json(res, 400, { error: 'A valid shift is required.' });
    if (!['approve', 'adjust'].includes(action)) return json(res, 400, { error: 'Action must be approve or adjust.' });

    // Approval is deliberately limited to completed shifts that are actually
    // awaiting review. This prevents a manager from approving an arbitrary
    // shift ID or approving an ordinary shift that needs no approval.
    const eligible = await sql`
      SELECT id, employee_id, clock_in, clock_out, approval_status, auto_clocked_out
      FROM shifts
      WHERE id=${shiftId}
        AND clock_out IS NOT NULL
        AND cancelled=false
        AND (approval_status='pending' OR (auto_clocked_out=true AND approval_status IS NULL))
      LIMIT 1`;
    if (!eligible.length) return json(res, 409, { error: 'This shift is not currently awaiting manager approval.' });

    if (action === 'approve') {
      const rows = await sql`
        UPDATE shifts
        SET approval_status='approved', approved_by=${manager.id}, approved_at=now()
        WHERE id=${shiftId}
          AND clock_out IS NOT NULL
          AND cancelled=false
          AND (approval_status='pending' OR (auto_clocked_out=true AND approval_status IS NULL))
        RETURNING id`;
      if (!rows.length) return json(res, 409, { error: 'This shift was already reviewed. Please refresh.' });
      await audit('manager', manager.id, 'shift_approved', { shift_id: shiftId });
      return json(res, 200, { ok: true });
    }

    const hours = Number(req.body?.paidHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return json(res, 400, { error: 'Enter a valid number of paid hours (0–24).' });
    const rows = await sql`
      UPDATE shifts
      SET approval_status='adjusted', approved_paid_hours=${hours}, approved_by=${manager.id}, approved_at=now()
      WHERE id=${shiftId}
        AND clock_out IS NOT NULL
        AND cancelled=false
        AND (approval_status='pending' OR (auto_clocked_out=true AND approval_status IS NULL))
      RETURNING id`;
    if (!rows.length) return json(res, 409, { error: 'This shift was already reviewed. Please refresh.' });
    await audit('manager', manager.id, 'shift_adjusted', { shift_id: shiftId, paid_hours: hours });
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
