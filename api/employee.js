import { sql, json, requireEmployee, settingNumber, audit } from './_db.js';
import { safeAdminEmail, appUrl } from './_email.js';

export default async function handler(req,res){
 try{
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const emp=await requireEmployee(req,res);if(!emp)return;
  const u=new URL(req.url,'https://workclock.invalid'),start=u.searchParams.get('start'),end=u.searchParams.get('end');
  if(start&&Number.isNaN(Date.parse(start)))return json(res,400,{error:'Invalid start date.'});
  if(end&&Number.isNaN(Date.parse(end)))return json(res,400,{error:'Invalid end date.'});
  const maxHours=await settingNumber('max_shift_hours',12);
  const openRows=await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
  const open=openRows[0]||null;
  if(open && Date.now()-new Date(open.clock_in).getTime()>=maxHours*3600000){
   const cutoff=new Date(new Date(open.clock_in).getTime()+maxHours*3600000);
   const closed=await sql`UPDATE shifts SET clock_out=${cutoff.toISOString()}::timestamptz,clock_out_source='system',clock_out_note='Automatic 12-hour clock-out',clock_out_message='The maximum shift duration was reached. Please follow the Clock In / Clock Out procedure.',payment_status='actual',paid_minutes=${Math.round(maxHours*60)} WHERE id=${open.id} AND employee_id=${emp.id} AND clock_out IS NULL RETURNING id`;
   if(closed.length){
    await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,actor_type) VALUES(${open.id},${emp.id},'auto_clock_out','Automatic 12-hour clock-out','The maximum shift duration was reached.','system')`;
    await audit('system',null,'auto_clock_out',{shift_id:open.id,employee_id:emp.id,paid_minutes:Math.round(maxHours*60)});
    await safeAdminEmail({subject:`WorkClock: Automatic 12-hour Clock Out — ${emp.name}`,text:`${emp.name}'s shift was automatically clocked out after ${maxHours} hours.

Open Manager Portal: ${appUrl(req)}/?manager=1`,html:`<h2>Automatic Clock Out</h2><p><strong>${String(emp.name).replace(/[&<>"']/g,'')}</strong>'s shift was automatically clocked out after ${maxHours} hours.</p>`});
   }
  }
  const shifts=await sql`SELECT s.id,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.clock_out_source,s.payment_status,s.paid_minutes,s.approved_at,(SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count FROM shifts s WHERE s.employee_id=${emp.id} AND (${start}::timestamptz IS NULL OR s.clock_in>=${start}::timestamptz) AND (${end}::timestamptz IS NULL OR s.clock_in<${end}::timestamptz) ORDER BY s.clock_in`;
  const paidMinimum=await settingNumber('standard_shift_hours',8);
  const latestAuto=await sql`SELECT id,clock_in,clock_out,clock_out_note,clock_out_message FROM shifts WHERE employee_id=${emp.id} AND clock_out_source='system' ORDER BY clock_out DESC LIMIT 1`;
  const recentEvents=await sql`SELECT id,event_type,reason,message,created_at FROM shift_events WHERE employee_id=${emp.id} ORDER BY created_at DESC LIMIT 10`;
  const freshOpen=await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
  return json(res,200,{authorized:true,employee:{id:emp.id,name:emp.name,job_title:emp.job_title||'Employee',hourly_wage:emp.hourly_wage},shifts,openShift:freshOpen[0]||null,events:recentEvents,latestAutoClockout:latestAuto[0]||null,settings:{standard_shift_hours:paidMinimum,max_shift_hours:maxHours,full_shift_threshold_minutes:await settingNumber('full_shift_threshold_minutes',465)}});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
