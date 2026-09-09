import { sql, norm, json, newToken, hashToken, setEmployeeCookie, clearEmployeeCookie, getEmployeeSession, getCookie, requireSameOrigin, audit, hashIp } from './_db.js';

async function rateLimited(ipHash) {
  const r=await sql`SELECT count(*)::int AS n FROM auth_attempts WHERE kind='employee_login' AND ip_hash=${ipHash} AND created_at>now()-interval '15 minutes'`;
  return Number(r[0]?.n||0)>=30;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){const emp=await getEmployeeSession(req);return json(res,200,{authenticated:!!emp,employee:emp?{id:emp.id,name:emp.name,title:emp.title,hourly_wage:emp.hourly_wage}:null});}
    if(!requireSameOrigin(req,res))return;
    if(req.method==='POST'){
      const b=req.body||{},name=norm(b.name),pin=String(b.pin||'').trim(),ipHash=hashIp(req);
      if(!name||!/^[0-9]{4}$/.test(pin))return json(res,400,{error:'Enter your approved name and 4-digit PIN.'});
      if(await rateLimited(ipHash))return json(res,429,{error:'Too many login attempts from this connection. Try again later.'});
      await sql`INSERT INTO auth_attempts(kind,ip_hash,created_at) VALUES('employee_login',${ipHash},now())`;
      const rows=await sql`SELECT id,name,title,hourly_wage,pin_hash,failed_pin_attempts,pin_locked_until FROM employees WHERE normalized_name=${name} AND active=true LIMIT 1`;
      if(!rows.length)return json(res,401,{error:'Incorrect employee name or PIN.'});
      const e=rows[0];
      if(e.pin_locked_until&&new Date(e.pin_locked_until)>new Date())return json(res,429,{error:'Too many incorrect PIN attempts. Try again in 10 minutes or contact your manager.'});
      if(!e.pin_hash)return json(res,401,{error:'Incorrect employee name or PIN.'});
      const ok=await sql`SELECT crypt(${pin},${e.pin_hash})=${e.pin_hash} AS ok`;
      if(!ok[0]?.ok){const changed=await sql`UPDATE employees SET failed_pin_attempts=failed_pin_attempts+1,pin_locked_until=CASE WHEN failed_pin_attempts+1>=5 THEN now()+interval '10 minutes' ELSE pin_locked_until END,updated_at=now() WHERE id=${e.id} RETURNING failed_pin_attempts`;const next=Number(changed[0]?.failed_pin_attempts||0);if(next>=5)return json(res,429,{error:'Too many incorrect PIN attempts. Login locked for 10 minutes.'});return json(res,401,{error:'Incorrect employee name or PIN.'});}
      await sql`UPDATE employees SET failed_pin_attempts=0,pin_locked_until=null,updated_at=now() WHERE id=${e.id}`;
      const old=getCookie(req,'wc_employee');if(old)await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(old)}`;
      const token=newToken();await sql`INSERT INTO employee_sessions(token_hash,employee_id,expires_at) VALUES(${hashToken(token)},${e.id},now()+interval '12 hours')`;setEmployeeCookie(req,res,token);await audit('employee',e.id,'employee_login');
      return json(res,200,{ok:true,employee:{id:e.id,name:e.name,title:e.title,hourly_wage:e.hourly_wage}});
    }
    if(req.method==='DELETE'){const tok=getCookie(req,'wc_employee');if(tok)await sql`DELETE FROM employee_sessions WHERE token_hash=${hashToken(tok)}`;clearEmployeeCookie(req,res);return json(res,200,{ok:true});}
    return json(res,405,{error:'Method not allowed'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
