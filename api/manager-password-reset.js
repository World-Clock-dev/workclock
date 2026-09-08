import { sql, json, newToken, hashToken, requireSameOrigin, norm, hashIp } from './_db.js';
import { adminEmail, safeAdminEmail, appUrl } from './_email.js';
export default async function handler(req,res){
  try{
    if(req.method==='POST'){
      if(!requireSameOrigin(req,res))return;const ipHash=hashIp(req);const recent=await sql`SELECT count(*)::int AS n FROM auth_attempts WHERE kind='manager_reset' AND ip_hash=${ipHash} AND created_at>now()-interval '15 minutes'`;
      if(Number(recent[0]?.n||0)>=10)return json(res,429,{error:'Too many reset requests from this connection. Try again later.'});
      await sql`INSERT INTO auth_attempts(kind,ip_hash,created_at) VALUES('manager_reset',${ipHash},now())`;
      const username=norm(req.body?.username);if(!username)return json(res,400,{error:'Enter the manager username.'});
      const rows=await sql`SELECT id,username FROM manager_users WHERE lower(username)=${username} AND active=true LIMIT 1`;
      if(rows.length){
        const recentUser=await sql`SELECT count(*)::int AS n FROM manager_reset_tokens WHERE manager_user_id=${rows[0].id} AND created_at>now()-interval '15 minutes' AND used_at IS NULL`;
        if(Number(recentUser[0]?.n||0)<3){const token=newToken();await sql`INSERT INTO manager_reset_tokens(token_hash,manager_user_id,expires_at) VALUES(${hashToken(token)},${rows[0].id},now()+interval '30 minutes')`;const link=`${appUrl(req)}/?manager=1&reset=${encodeURIComponent(token)}`;await safeAdminEmail({subject:'WorkClock manager password reset',text:`A manager password reset was requested. This link expires in 30 minutes and can be used once:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,html:`<p>A manager password reset was requested.</p><p><a href="${link}">Reset Manager Password</a></p><p>This link expires in 30 minutes and can be used once.</p><p>If you did not request this, ignore this email.</p>`});}
      }
      return json(res,200,{ok:true,message:`If the manager account exists, a reset link has been sent to ${adminEmail()}.`});
    }
    if(req.method==='PATCH'){
      if(!requireSameOrigin(req,res))return;const token=String(req.body?.token||''),password=String(req.body?.newPassword||'');if(!token||password.length<12||password.length>200)return json(res,400,{error:'Use a new password between 12 and 200 characters.'});
      const rows=await sql`
        WITH claimed AS (
          UPDATE manager_reset_tokens SET used_at=now()
          WHERE token_hash=${hashToken(token)} AND used_at IS NULL AND expires_at>now()
          RETURNING manager_user_id
        )
        UPDATE manager_users
        SET password_hash=crypt(${password},gen_salt('bf')),password_changed_at=now(),failed_login_attempts=0,locked_until=null
        WHERE id IN (SELECT manager_user_id FROM claimed)
        RETURNING id`;
      if(!rows.length)return json(res,400,{error:'This reset link is invalid or expired. Request a new one.'});
      await sql`DELETE FROM manager_sessions WHERE manager_user_id=${rows[0].id}`;
      return json(res,200,{ok:true});
    }
    return json(res,405,{error:'Method not allowed'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
