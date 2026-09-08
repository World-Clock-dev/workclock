import { sql, json, newToken, hashToken, setManagerCookie, clearManagerCookie, getManager, getCookie, requireSameOrigin, audit, norm, hashIp } from './_db.js';
export default async function handler(req,res){
  try{
    if(req.method==='GET'){const s=await getManager(req);return json(res,200,{authenticated:!!s,username:s?.username||null});}
    if(!requireSameOrigin(req,res))return;
    if(req.method==='POST'){
      const b=req.body||{},username=norm(b.username),password=String(b.password||''),ipHash=hashIp(req);
      if(!username||!password)return json(res,400,{error:'Username and password are required.'});
      const recent=await sql`SELECT count(*)::int AS n FROM auth_attempts WHERE kind='manager_login' AND ip_hash=${ipHash} AND created_at>now()-interval '15 minutes'`;
      if(Number(recent[0]?.n||0)>=30)return json(res,429,{error:'Too many login attempts from this connection. Try again later.'});
      await sql`INSERT INTO auth_attempts(kind,ip_hash,created_at) VALUES('manager_login',${ipHash},now())`;
      const rows=await sql`SELECT id,username,password_hash,failed_login_attempts,locked_until FROM manager_users WHERE lower(username)=${username} AND active=true LIMIT 1`;
      if(!rows.length)return json(res,401,{error:'Incorrect manager username or password.'});
      const m=rows[0];if(m.locked_until&&new Date(m.locked_until)>new Date())return json(res,429,{error:'Too many incorrect attempts. Try again in 10 minutes.'});
      const ok=await sql`SELECT crypt(${password},${m.password_hash})=${m.password_hash} AS ok`;
      if(!ok[0]?.ok){const changed=await sql`UPDATE manager_users SET failed_login_attempts=failed_login_attempts+1,locked_until=CASE WHEN failed_login_attempts+1>=5 THEN now()+interval '10 minutes' ELSE locked_until END WHERE id=${m.id} RETURNING failed_login_attempts`;const attempts=Number(changed[0]?.failed_login_attempts||0);if(attempts>=5)return json(res,429,{error:'Too many incorrect attempts. Login locked for 10 minutes.'});return json(res,401,{error:'Incorrect manager username or password.'});}
      await sql`UPDATE manager_users SET failed_login_attempts=0,locked_until=null WHERE id=${m.id}`;
      const old=getCookie(req,'wc_manager');if(old)await sql`DELETE FROM manager_sessions WHERE token_hash=${hashToken(old)}`;
      const token=newToken();await sql`INSERT INTO manager_sessions(token_hash,manager_user_id,expires_at) VALUES(${hashToken(token)},${m.id},now()+interval '12 hours')`;setManagerCookie(req,res,token);await audit('manager',m.id,'manager_login');
      return json(res,200,{ok:true,username:m.username});
    }
    if(req.method==='DELETE'){const tok=getCookie(req,'wc_manager');if(tok)await sql`DELETE FROM manager_sessions WHERE token_hash=${hashToken(tok)}`;clearManagerCookie(req,res);return json(res,200,{ok:true});}
    return json(res,405,{error:'Method not allowed'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
