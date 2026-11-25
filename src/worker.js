/* WorkClock on Cloudflare Workers.

   - Static files (index.html, app.js, style.css, icons) are served by Workers
     Static Assets, exactly as Vercel served them from the project root.
   - /api/<name> runs the same handler in api/<name>.js that ran on Vercel.
     A small adapter gives each handler the Vercel-style (req, res) it expects,
     so the business logic and payroll rules are untouched.
   - The nightly data-retention job is a Cron Trigger (wrangler.toml), replacing
     the Vercel cron in vercel.json. The 12-function limit no longer applies,
     but the file layout is kept so the two versions stay easy to compare. */

import { bindEnv } from '../api/_db.js';
import clockIn from '../api/clock-in.js';
import clockOut from '../api/clock-out.js';
import employeeAuth from '../api/employee-auth.js';
import employeePinReset from '../api/employee-pin-reset.js';
import employee from '../api/employee.js';
import employees from '../api/employees.js';
import managerAuth from '../api/manager-auth.js';
import managerPasswordReset from '../api/manager-password-reset.js';
import managerPassword from '../api/manager-password.js';
import managerShift from '../api/manager-shift.js';
import manager from '../api/manager.js';
import settings from '../api/settings.js';
import supplies from '../api/supplies.js';
import records from '../api/records.js';
import performance from '../api/performance.js';
import company from '../api/company.js';
import chat from '../api/chat.js';
import upload from '../api/upload.js';
import vacreq from '../api/vacreq.js';
import { bindFiles } from '../api/_files.js';

export const ROUTES = {
  'clock-in': clockIn,
  'clock-out': clockOut,
  'employee-auth': employeeAuth,
  'employee-pin-reset': employeePinReset,
  'employee': employee,
  'employees': employees,
  'manager-auth': managerAuth,
  'manager-password-reset': managerPasswordReset,
  'manager-password': managerPassword,
  'manager-shift': managerShift,
  'manager': manager,
  'settings': settings,
  'supplies': supplies,
  'records': records,
  'performance': performance,
  'company': company,
  'chat': chat,
  'upload': upload,
  'vacreq': vacreq,
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/* Build the Vercel-style request object the handlers were written for. */
export async function toVercelRequest(request, url) {
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  headers['x-forwarded-host'] = url.host;
  if (!headers.host) headers.host = url.host;
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers['x-forwarded-for'] = ip;

  let body;
  // File uploads arrive as the raw file: keep the bytes as they are.
  if (request.method === 'POST' && url.pathname.replace(/\/$/, '') === '/api/upload') body = await request.arrayBuffer();
  else if (!['GET', 'HEAD'].includes(request.method)) {
    const text = await request.text();
    if (text) {
      const type = headers['content-type'] || '';
      if (type.includes('application/json')) body = JSON.parse(text); // invalid JSON -> 400 below
      else { try { body = JSON.parse(text); } catch { body = text; } }
    }
  }
  return { method: request.method, url: url.pathname + url.search, headers, body, query: Object.fromEntries(url.searchParams), socket: { remoteAddress: ip || '' } };
}

/* Collect what a handler writes through the Vercel-style response object. */
export function makeVercelResponse() {
  const state = { status: 200, headers: new Headers(), body: null, ended: false };
  const res = {
    statusCode: 200,
    status(code) { state.status = code; res.statusCode = code; return res; },
    setHeader(name, value) {
      if (Array.isArray(value)) { state.headers.delete(name); value.forEach(v => state.headers.append(name, v)); }
      else state.headers.set(name, String(value));
      return res;
    },
    getHeader(name) { return state.headers.get(name); },
    end(body) { state.body = body ?? null; state.ended = true; return res; },
    json(data) { if (!state.headers.has('content-type')) state.headers.set('content-type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(data)); },
  };
  return { res, toResponse: () => new Response(state.body, { status: state.ended ? state.status : 500, headers: state.headers }) };
}

export async function runHandler(handler, request, url) {
  let req;
  try { req = await toVercelRequest(request, url); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400, headers: JSON_HEADERS }); }
  const { res, toResponse } = makeVercelResponse();
  await handler(req, res);
  return toResponse();
}

async function runRetentionCron() {
  const url = new URL('https://workclock.internal/api/settings?action=retention');
  const req = { method: 'GET', url: url.pathname + url.search, headers: {}, body: undefined, query: { action: 'retention' }, socket: {}, __cloudflareCron: true };
  const { res, toResponse } = makeVercelResponse();
  await settings(req, res);
  const r = toResponse();
  const text = await r.text();
  if (r.status !== 200) throw new Error(`Retention job failed: ${r.status} ${text}`);
  console.log('Retention job:', text);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      bindEnv(env);
      bindFiles(env);
      // vercel.json rewrite: /api/retention -> /api/settings?action=retention
      if (url.pathname.replace(/\/$/, '') === '/api/retention') {
        url.pathname = '/api/settings';
        url.searchParams.set('action', 'retention');
      }
      const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
      const handler = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
      if (!handler) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });
      return runHandler(handler, request, url);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    bindEnv(env);
    ctx.waitUntil(runRetentionCron());
  },
};
