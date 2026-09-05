import { sql, json, audit } from './_db.js';

// Invoked by Vercel Cron (see vercel.json) once a day. Vercel automatically
// sends `Authorization: Bearer <CRON_SECRET>` on scheduled invocations — this
// check exists so nobody else can trigger it by just knowing the URL.
export default async function handler(req, res) {
  try {
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
    if (!process.env.CRON_SECRET || req.headers.authorization !== expected) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    const stale = await sql`
      SELECT id, employee_id, clock_in FROM shifts
      WHERE clock_out IS NULL AND clock_in < now() - interval '12 hours'`;

    for (const s of stale) {
      await sql`
        UPDATE shifts
        SET clock_out=clock_in + interval '12 hours', clock_out_note='Auto clock-out (12h)',
            auto_clocked_out=true, stale_notice_seen=false
        WHERE id=${s.id} AND clock_out IS NULL`;
      await audit('system', null, 'shift_auto_closed', { shift_id: s.id, employee_id: s.employee_id, source: 'cron' });
    }

    return json(res, 200, { ok: true, closed: stale.length });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
