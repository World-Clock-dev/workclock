import { sql,json,requireManager,settingNumber } from './_db.js';
function actualMinutes(a,b){return Math.max(0,Math.floor((new Date(b||Date.now())-new Date(a))/60000));}
function paidMinutes(x,standardMinutes){if(x.payment_status==='approved_full_shift')return Math.max(Number(x.paid_minutes||0),standardMinutes);return Number(x.paid_minutes??actualMinutes(x.clock_in,x.clock_out));}
export default async function handler(req,res){
 try{
  const manager=await requireManager(req,res);if(!manager)return;
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const u=new URL(req.url,'https://workclock.invalid'),startText=u.searchParams.get('start'),endText=u.searchParams.get('end');
  if(!startText||!endText||Number.isNaN(Date.parse(startText))||Number.isNaN(Date.parse(endText)))return json(res,400,{error:'Valid start and end are required.'});
  const start=new Date(startText),end=new Date(endText);if(!(end>start)||(end-start)>8*86400000)return json(res,400,{error:'Invalid date range.'});
  const employees=await sql`SELECT id,name,email,job_title,hourly_wage,active,(pin_hash IS NOT NULL) AS has_pin FROM employees WHERE active=true ORDER BY name`;
  const shifts=await sql`SELECT s.id,e.id AS employee_id,e.name,e.job_title,e.hourly_wage,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.clock_out_source,s.payment_status,s.paid_minutes,s.approved_at,(SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count,(SELECT count(*)::int FROM shift_events ev WHERE ev.shift_id=s.id AND ev.event_type='clock_out_rejected') AS rejected_attempts FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.clock_in>=${start.toISOString()}::timestamptz AND s.clock_in<${end.toISOString()}::timestamptz ORDER BY s.clock_in DESC`;
  const events=await sql`SELECT ev.id,ev.shift_id,ev.employee_id,e.name,e.job_title,ev.event_type,ev.reason,ev.message,ev.lat,ev.lng,ev.distance_miles,ev.actor_type,ev.created_at FROM shift_events ev LEFT JOIN employees e ON e.id=ev.employee_id WHERE ev.created_at>=${start.toISOString()}::timestamptz AND ev.created_at<${end.toISOString()}::timestamptz ORDER BY ev.created_at DESC LIMIT 500`;
  const standardMinutes=Math.round((await settingNumber('standard_shift_hours',8))*60),weekly={};
  for(const e of employees)weekly[e.id]={employee_id:e.id,name:e.name,job_title:e.job_title,wage:Number(e.hourly_wage||0),days:Array(7).fill(0),actual_days:Array(7).fill(0)};
  const summary={total_paid_hours:0,total_payroll:0,rejected_clock_outs:0,pending_approvals:0};
  for(const x of shifts){const ci=new Date(x.clock_in),i=Math.floor((ci-start)/86400000),pm=paidMinutes(x,standardMinutes),am=actualMinutes(x.clock_in,x.clock_out),e=weekly[x.employee_id];summary.rejected_clock_outs+=Number(x.rejected_attempts||0);if(x.payment_status==='pending_approval')summary.pending_approvals++;if(i>=0&&i<7&&e){e.days[i]+=pm;e.actual_days[i]+=am;}summary.total_paid_hours+=pm/60;summary.total_payroll+=(pm/60)*Number(x.hourly_wage||0);}
  for(const e of Object.values(weekly)){e.days=e.days.map(v=>v/60);e.actual_days=e.actual_days.map(v=>v/60);e.total=e.days.reduce((a,b)=>a+b,0);e.earnings=e.days.reduce((a,b)=>a+b,0)*e.wage;}
  return json(res,200,{employees,shifts,events,summary,weekly:Object.values(weekly),settings:{standard_shift_hours:standardMinutes/60,full_shift_threshold_minutes:await settingNumber('full_shift_threshold_minutes',465),max_shift_hours:await settingNumber('max_shift_hours',12)}});
 }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
