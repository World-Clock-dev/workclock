import { sql,json,requireManager,requireSameOrigin,audit,settingNumber } from './_db.js';
import { safeAdminEmail,appUrl } from './_email.js';
const reasons=new Set(['Manager clock-out','Project completed','Client request','Manager approval','Other']);
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
export default async function handler(req,res){
 try{
  const manager=await requireManager(req,res);if(!manager)return;if(!requireSameOrigin(req,res))return;
  const b=req.body||{},shiftId=Number(b.shiftId),action=String(b.action||''),reason=String(b.reason||'').trim(),message=String(b.message||'').trim().slice(0,1000);
  if(!Number.isInteger(shiftId)||shiftId<1)return json(res,400,{error:'Valid shift id required.'});
  if(action==='clock_out'){
   if(!reasons.has(reason))return json(res,400,{error:'Select a valid manager Clock Out reason.'});
   const sh=await sql`SELECT s.id,s.employee_id,s.clock_in,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.id=${shiftId} AND s.clock_out IS NULL LIMIT 1`;
   if(!sh.length)return json(res,409,{error:'Already clocked out.'});
   const minutes=Math.max(0,Math.floor((Date.now()-new Date(sh[0].clock_in).getTime())/60000));
   const rows=await sql`UPDATE shifts SET clock_out=now(),clock_out_source='manager',clock_out_note=${reason},clock_out_message=${message||null},payment_status='manager_adjusted',paid_minutes=${minutes} WHERE id=${shiftId} AND clock_out IS NULL RETURNING id,clock_in,clock_out,clock_out_note,clock_out_message,paid_minutes`;
   if(!rows.length)return json(res,409,{error:'Already clocked out.'});
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${shiftId},${sh[0].employee_id},'manager_clock_out',${reason},${message||null},'manager',${manager.id})`;
   await audit('manager',manager.id,'manager_clock_out',{shift_id:shiftId,employee_id:sh[0].employee_id,reason,message});
   return json(res,200,{ok:true,shift:rows[0]});
  }
  if(action==='approve_full_shift'){
   const standard=await settingNumber('standard_shift_hours',8),min=await settingNumber('full_shift_threshold_minutes',465),sh=await sql`SELECT s.id,s.employee_id,s.clock_in,s.clock_out,s.payment_status,e.name,e.hourly_wage FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.id=${shiftId} AND s.clock_out IS NOT NULL LIMIT 1`;
   if(!sh.length)return json(res,404,{error:'Shift not found.'});
   const actual=Math.max(0,Math.floor((new Date(sh[0].clock_out)-new Date(sh[0].clock_in))/60000));
   if(!['pending_approval','actual'].includes(sh[0].payment_status))return json(res,400,{error:'This shift is already manager-adjusted.'});
   if(actual<1)return json(res,400,{error:'Shift has no payable minutes.'});
   const rows=await sql`UPDATE shifts SET payment_status='approved_full_shift',paid_minutes=${Math.max(actual,Math.round(standard*60))},approved_by_manager_id=${manager.id},approved_at=now() WHERE id=${shiftId} RETURNING id,payment_status,paid_minutes`;
   await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type,actor_id) VALUES(${shiftId},${sh[0].employee_id},'full_shift_approved','Manager approved full shift',${`Paid as ${standard} hours; actual ${actual} minutes. Threshold ${min} minutes.`},'manager',${manager.id})`;
   await audit('manager',manager.id,'full_shift_approved',{shift_id:shiftId,employee_id:sh[0].employee_id,actual_minutes:actual,paid_minutes:Math.max(actual,Math.round(standard*60))});
   return json(res,200,{ok:true,shift:rows[0]});
  }
  return json(res,400,{error:'Unknown manager shift action.'});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
