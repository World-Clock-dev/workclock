const RESEND_API_URL = 'https://api.resend.com/emails';
export function adminEmail(){ return process.env.ADMIN_EMAIL || 'finecoatpainters.info@gmail.com'; }
export function appUrl(req){ return (process.env.APP_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`).replace(/\/$/,''); }
export async function sendEmail({to,subject,text,html}){
  const key=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM;
  if(!key||!from) throw new Error('Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  const r=await fetch(RESEND_API_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify({from,to:Array.isArray(to)?to:[to],subject,text,html})});
  if(!r.ok){const body=await r.text();throw new Error(`Email provider error: ${r.status} ${body}`);} return r.json();
}
export async function safeAdminEmail(message){try{await sendEmail({to:adminEmail(),...message});return true;}catch(e){console.error('Email delivery failed:',e);return false;}}
