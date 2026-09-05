import { sql, json, requireManager, requireSameOrigin, audit } from './_db.js';

const NUMERIC_LIMITS = {
  clock_out_radius_miles: [0.1, 100],
  project_completed_min_paid_hours: [0, 24],
  max_active_employees: [1, 1000],
  full_day_round_threshold_hours: [0, 24]
};
const ALL_KEYS = [...Object.keys(NUMERIC_LIMITS), 'site_lat', 'site_lng', 'site_label'];

async function currentSettings() {
  const rows = await sql`SELECT key,value FROM app_settings WHERE key = ANY(${ALL_KEYS})`;
  const m = {}; for (const r of rows) m[r.key] = r.value;
  const settings = {};
  for (const k of Object.keys(NUMERIC_LIMITS)) settings[k] = Number(m[k]);
  settings.site_lat = m.site_lat || '';
  settings.site_lng = m.site_lng || '';
  settings.site_label = m.site_label || '';
  settings.max_active_employees = Number(m.max_active_employees);
  if (!Number.isFinite(settings.max_active_employees)) settings.max_active_employees = 100;
  return settings;
}

export default async function handler(req, res) {
  try {
    const manager = await requireManager(req, res); if (!manager) return;
    if (req.method === 'GET') return json(res, 200, { settings: await currentSettings() });
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    const b = req.body || {};

    for (const [key, [min, max]] of Object.entries(NUMERIC_LIMITS)) {
      if (b[key] === undefined) continue;
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < min || n > max) return json(res, 400, { error: `Invalid ${key}.` });
      const value = key === 'max_active_employees' ? String(Math.round(n)) : String(n);
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES(${key},${value},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      await audit('manager', manager.id, 'setting_updated', { key, value });
    }

    if (b.site_lat !== undefined || b.site_lng !== undefined) {
      const lat = Number(b.site_lat), lng = Number(b.site_lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return json(res, 400, { error: 'Enter a valid job site latitude and longitude.' });
      }
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES('site_lat',${String(lat)},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES('site_lng',${String(lng)},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      await audit('manager', manager.id, 'setting_updated', { key: 'site_location', lat, lng });
    }
    if (b.site_label !== undefined) {
      const label = String(b.site_label || '').trim().slice(0, 200);
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES('site_label',${label},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
    }

    return json(res, 200, { settings: await currentSettings() });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}
