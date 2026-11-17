import { sql, json, requireManager, requireSameOrigin, clearManagerCookie, getCookie, hashToken, audit, nowIso, hashSecret, verifySecret } from './_db.js';
export default async function handler(req,res){
  try{
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});if(!requireSameOrigin(req,res))return;const m=await requireManager(req,res);if(!m)return;
    const current=String(req.body?.currentPassword||''),next=String(req.body?.newPassword||'');
    if(next.length<12||next.length>200)return json(res,400,{error:'Use a new password between 12 and 200 characters.'});
    const stored=(await sql`SELECT password_hash FROM manager_users WHERE id=${m.id}`)[0]?.password_hash;
    if(!(await verifySecret(current,stored)))return json(res,401,{error:'Current password is incorrect.'});
    await sql`UPDATE manager_users SET password_hash=${await hashSecret(next)},password_changed_at=${nowIso()},failed_login_attempts=0,locked_until=null WHERE id=${m.id}`;
    await sql`DELETE FROM manager_sessions WHERE manager_user_id=${m.id}`;const tok=getCookie(req,'wc_manager');if(tok)await sql`DELETE FROM manager_sessions WHERE token_hash=${hashToken(tok)}`;
    clearManagerCookie(req,res);await audit('manager',m.id,'manager_password_changed');return json(res,200,{ok:true});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
