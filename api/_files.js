import { Buffer } from 'node:buffer';
import { sql, sqlBatch } from './_db.js';

/* Uploaded files (documents, work orders, accident photos, chat photos).

   - When the R2 bucket is connected (binding FILES in wrangler.toml), files go
     to R2: up to 25 MB each, 10 GB free, streamed in and out with no decoding.
   - Until then they are kept in D1 as base64 text in 900 KB pieces. Encoding
     and decoding use Node's Buffer, which is native code, so even an 8 MB file
     stays well inside the free plan's 10 ms CPU limit.

   A file's key says where it lives: "r2/<uuid>" or "db/<uuid>". Files saved
   before this (resource_chunks / attachment_chunks) are still read by their
   old code paths. */

let BUCKET = null;
export function bindFiles(env) { BUCKET = env?.FILES || null; }
export const filesInR2 = () => !!BUCKET;
export const maxUpload = () => (BUCKET ? 25 : 8) * 1024 * 1024;

const PIECE = 900_000;
let ready = false;
async function ensure() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS file_blobs (key TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (key, idx))`;
  ready = true;
}

// File types that can be uploaded. PDFs and pictures open in the browser; the rest download.
export const FILE_TYPES = {
  'application/pdf': 'pdf', 'image/jpeg': 'img', 'image/png': 'img', 'image/webp': 'img',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.ms-excel': 'doc', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'doc', 'text/plain': 'doc'
};

/* bytes: ArrayBuffer or Uint8Array. Returns the new key. */
export async function putBlob(bytes, mime) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const id = crypto.randomUUID();
  if (BUCKET) {
    await BUCKET.put(id, u8, { httpMetadata: { contentType: mime } });
    return 'r2/' + id;
  }
  await ensure();
  const b64 = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  const rows = [];
  for (let i = 0, n = 0; i < b64.length; i += PIECE, n++) rows.push(['INSERT INTO file_blobs(key,idx,data) VALUES(?,?,?)', 'db/' + id, n, b64.slice(i, i + PIECE)]);
  if (!rows.length) rows.push(['INSERT INTO file_blobs(key,idx,data) VALUES(?,?,?)', 'db/' + id, 0, '']);
  await sqlBatch(rows);
  return 'db/' + id;
}

/* Returns a ReadableStream or Uint8Array, or null when missing. */
export async function getBlob(key) {
  if (!key) return null;
  if (key.startsWith('r2/')) {
    if (!BUCKET) return null;
    const o = await BUCKET.get(key.slice(3));
    return o ? o.body : null;
  }
  await ensure();
  const parts = await sql`SELECT data FROM file_blobs WHERE key=${key} ORDER BY idx`;
  if (!parts.length) return null;
  return decodeBase64(parts.map(p => p.data).join(''));
}

export async function deleteBlob(key) {
  if (!key) return;
  if (key.startsWith('r2/')) { if (BUCKET) await BUCKET.delete(key.slice(3)); return; }
  await ensure();
  await sql`DELETE FROM file_blobs WHERE key=${key}`;
}

export const decodeBase64 = b64 => { const b = Buffer.from(b64, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
export const safeName = n => String(n || 'file').replace(/[^\w.\- ]/g, '_').slice(0, 150) || 'file';

/* Send a stored file. Pictures and PDFs open in the browser; others download. */
export function sendBlob(res, body, mime, filename) {
  const inline = FILE_TYPES[mime] === 'pdf' || FILE_TYPES[mime] === 'img';
  res.setHeader('Content-Type', FILE_TYPES[mime] ? mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName(filename)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return res.status(200).end(body);
}
