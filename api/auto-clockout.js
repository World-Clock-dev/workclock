import { sql,json,settingNumber,audit } from './_db.js';
import { safeAdminEmail,appUrl } from './_email.js';
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
export default async function handler(req,res){
 try{
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const supplied=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!process.env.CRON_SECRET||supplied!==process.env.CRON_SECRET)return json(res,401,{error:'Unauthorized'});
  const maxHours=await settingNumber('max_shift_hours',12),rows=await sql`SELECT s.id,s.employee_id,s.clock_in,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.clock_out IS NULL AND s.clock_in <= now()-(${maxHours} * interval '1 hour') ORDER BY s.clock_in LIMIT 100`;
  let closed=0;
  for(const s of rows){
   const cutoff=new Date(new Date(s.clock_in).getTime()+maxHours*3600000);
   const minutes=Math.max(0,Math.floor((cutoff-new Date(s.clock_in).getTime())/60000));
   const r=await sql`UPDATE shifts SET clock_out=${cutoff.toISOString()}::timestamptz,clock_out_source='system',clock_out_note='Automatic 12-hour clock-out',clock_out_message='The maximum shift duration was reached. Please follow the Clock In / Clock Out procedure.',payment_status='actual',paid_minutes=${minutes} WHERE id=${s.id} AND clock_out IS NULL RETURNING id`;
   if(!r.length)continue;
   closed++;
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${s.id},${s.employee_id},'auto_clock_out','Automatic 12-hour clock-out','The maximum shift duration was reached.','system',NULL)`;
   await audit('system',null,'auto_clock_out',{shift_id:s.id,employee_id:s.employee_id,paid_minutes:minutes});
   await safeAdminEmail({subject:`WorkClock: Automatic 12-hour Clock Out — ${s.name}`,text:`${s.name}'s shift was automatically clocked out after ${maxHours} hours.\nPaid minutes: ${minutes}.\n\nOpen Manager Portal: ${appUrl(req)}/?manager=1`,html:`<h2>Automatic Clock Out</h2><p><strong>${esc(s.name)}</strong>'s shift was automatically clocked out after ${maxHours} hours.</p><p>Paid minutes: ${minutes}</p>`});
  }
  return json(res,200,{ok:true,closed,checked:rows.length});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
