import { sql, json, getManager, getEmployeeSession, requireSameOrigin, audit, nowIso } from './_db.js';
import { FILE_TYPES, putBlob, deleteBlob, maxUpload, safeName } from './_files.js';
import { ensureCompany } from './company.js';
import { ensureChat, addMessage } from './chat.js';

/* POST /api/upload?kind=...  with the file itself as the request body
   (Content-Type = the file's type). Sending the raw file instead of base64
   inside JSON keeps big uploads cheap for the server.

   kind=resource  manager  title, category, [id to replace the file]
   kind=incident  manager  id = accident/incident entry
   kind=project   manager  id = project (work order files)
   kind=chat      manager (employeeId) or painter: a photo or file message */

const txt = (v, max) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length <= max ? s : null; };
const idOf = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const manager = await getManager(req), emp = manager ? null : await getEmployeeSession(req);
    if (!manager && !emp) return json(res, 401, { error: 'Login required.' });
    if (!requireSameOrigin(req, res)) return;
    const u = new URL(req.url, 'https://workclock.invalid'), q = k => u.searchParams.get(k);
    const kind = q('kind');
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!FILE_TYPES[mime]) return json(res, 400, { error: 'Choose a PDF, a picture (JPG/PNG), or a Word or Excel file.' });
    const bytes = req.body instanceof ArrayBuffer ? req.body : null;
    if (!bytes || !bytes.byteLength) return json(res, 400, { error: 'Choose a file.' });
    const max = maxUpload();
    if (bytes.byteLength > max) return json(res, 400, { error: `The file is too large (${Math.round(max / 1048576)} MB at most).` });
    const filename = safeName(q('name') || 'file');
    const size = bytes.byteLength, now = nowIso();

    if (kind === 'chat') {
      await ensureChat();
      let empId;
      if (manager) { empId = idOf(q('employeeId')); if (!empId || !(await sql`SELECT 1 FROM employees WHERE id=${empId}`).length) return json(res, 400, { error: 'Choose a painter.' }); }
      else empId = Number(emp.id);
      if (FILE_TYPES[mime] !== 'img' && FILE_TYPES[mime] !== 'pdf') return json(res, 400, { error: 'Send a photo or a PDF.' });
      const key = await putBlob(bytes, mime);
      const id = await addMessage(empId, !!manager, { blob_key: key, filename, mime, size });
      return json(res, 200, { ok: true, id });
    }

    if (!manager) return json(res, 403, { error: 'Only the manager can upload this.' });
    await ensureCompany();

    if (kind === 'resource') {
      const id = idOf(q('id'));
      if (id) {
        const old = (await sql`SELECT blob_key FROM resources WHERE id=${id}`)[0];
        if (!old) return json(res, 404, { error: 'Document not found.' });
        const key = await putBlob(bytes, mime);
        await sql`UPDATE resources SET mime=${mime},filename=${filename},size=${size},chunks=0,blob_key=${key},updated_at=${now} WHERE id=${id}`;
        await sql`DELETE FROM resource_chunks WHERE resource_id=${id}`;
        if (old.blob_key) await deleteBlob(old.blob_key);
        await audit('manager', manager.id, 'resource_uploaded', { id, size });
        return json(res, 200, { ok: true, id });
      }
      const title = txt(q('title'), 120), category = txt(q('category'), 40) || 'Other';
      if (!title) return json(res, 400, { error: 'Give the document a name.' });
      if (category === null) return json(res, 400, { error: 'The category must be 40 characters or fewer.' });
      const kindCol = category === 'Employee Handbook' ? 'handbook' : category === 'SOP' ? 'sop' : 'other';
      const key = await putBlob(bytes, mime);
      const rid = Number((await sql`INSERT INTO resources(title,kind,category,mime,filename,size,chunks,blob_key,created_at,updated_at) VALUES(${title},${kindCol},${category},${mime},${filename},${size},0,${key},${now},${now}) RETURNING id`)[0].id);
      await audit('manager', manager.id, 'resource_uploaded', { id: rid, title, size });
      return json(res, 200, { ok: true, id: rid });
    }

    if (kind === 'incident' || kind === 'project') {
      const id = idOf(q('id'));
      const exists = kind === 'incident' ? await sql`SELECT 1 FROM vehicle_incidents WHERE id=${id}` : await sql`SELECT 1 FROM projects WHERE id=${id}`;
      if (!id || !exists.length) return json(res, 404, { error: kind === 'incident' ? 'Entry not found.' : 'Project not found.' });
      if (kind === 'project' && (await sql`SELECT count(*) AS n FROM attachments WHERE owner_type='project' AND owner_id=${id}`)[0].n >= 10) return json(res, 400, { error: 'Up to 10 files per project.' });
      if (kind === 'incident' && (await sql`SELECT count(*) AS n FROM attachments WHERE owner_type='incident' AND owner_id=${id}`)[0].n >= 20) return json(res, 400, { error: 'Up to 20 photos or files per entry.' });
      const key = await putBlob(bytes, mime);
      const aid = Number((await sql`INSERT INTO attachments(owner_type,owner_id,filename,mime,size,chunks,blob_key,created_at) VALUES(${kind},${id},${filename},${mime},${size},0,${key},${now}) RETURNING id`)[0].id);
      await audit('manager', manager.id, kind + '_file_added', { owner_id: id, id: aid, size });
      return json(res, 200, { ok: true, id: aid });
    }
    return json(res, 400, { error: 'Unknown upload.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'The upload failed. Please try again.' });
  }
}
