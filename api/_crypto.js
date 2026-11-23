/* Encryption for sensitive employee data (SSN, driver's licence photo).
   AES-GCM with a key derived from SESSION_SECRET, so the database alone does
   not reveal them. Changing SESSION_SECRET makes existing values unreadable. */

const enc = new TextEncoder(), dec = new TextDecoder();
let keyPromise = null, keySecret = null;

function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(text) { const s = atob(text); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

function key() {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  if (!keyPromise || keySecret !== secret) {
    keySecret = secret;
    keyPromise = crypto.subtle.digest('SHA-256', enc.encode('workclock-records-v1:' + secret))
      .then(raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keyPromise;
}

export async function seal(text) {
  if (text == null || text === '') return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(String(text))));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  return 'v1:' + b64(all);
}

export async function open(sealed) {
  if (!sealed) return null;
  if (!String(sealed).startsWith('v1:')) throw new Error('Unknown format');
  const all = unb64(String(sealed).slice(3));
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, await key(), all.subarray(12)));
}
