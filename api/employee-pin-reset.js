import { sql, norm, json, requireSameOrigin, hashIp } from './_db.js';
import { adminEmail, safeAdminEmail, appUrl } from './_email.js';
export default async function handler(req,res){
  try{
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});if(!requireSameOrigin(req,res))return;
    const name=String(req.body?.name||'').trim().replace(/\s+/g,' ');if(!name||name.length>120)return json(res,400,{error:'Enter your approved employee name.'});
    const ipHash=hashIp(req);const ipRecent=await sql`SELECT count(*)::int AS n FROM pin_reset_requests WHERE request_ip_hash=${ipHash} AND created_at>now()-interval '15 minutes'`;
    if(Number(ipRecent[0]?.n||0)>=10)return json(res,429,{error:'Too many PIN reset requests from this connection. Try again later.'});
    const employee=(await sql`SELECT id,name FROM employees WHERE normalized_name=${norm(name)} AND active=true LIMIT 1`)[0];
    if(employee){
      const recent=await sql`SELECT count(*)::int AS n FROM pin_reset_requests WHERE employee_id=${employee.id} AND created_at>now()-interval '15 minutes'`;
      if(Number(recent[0]?.n||0)<3){
        await sql`INSERT INTO pin_reset_requests(employee_id,requested_name,request_ip_hash) VALUES(${employee.id},${name},${ipHash})`;
        await safeAdminEmail({subject:`WorkClock PIN reset request — ${employee.name}`,text:`Employee ${employee.name} requested a PIN reset. Sign in to the WorkClock Manager Dashboard and use Reset PIN.\n\nManager dashboard: ${appUrl(req)}/?manager=1\n\nThis message was sent to ${adminEmail()}.`,html:`<p><strong>${employee.name}</strong> requested a PIN reset.</p><p>Sign in to the WorkClock Manager Dashboard and use <strong>Reset PIN</strong>.</p><p><a href="${appUrl(req)}/?manager=1">Open Manager Dashboard</a></p>`});
      }
    } else {
      await sql`INSERT INTO pin_reset_requests(employee_id,requested_name,request_ip_hash) VALUES(NULL,${name},${ipHash})`;
    }
    return json(res,200,{ok:true,message:'If that employee is active, the manager has been notified. Please wait for your manager to reset your PIN.'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
