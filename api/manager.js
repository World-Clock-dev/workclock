import { sql, json, requireManager, settingNumber } from './_db.js';
import { allocatePaidHours, normalizeDayStarts, hoursBetween, effectiveShiftPay } from './_time.js';

function getRange(req){
  const u=new URL(req.url,'https://workclock.invalid');
  const startText=u.searchParams.get('start'),endText=u.searchParams.get('end');
  if(!startText||!endText||Number.isNaN(Date.parse(startText))||Number.isNaN(Date.parse(endText)))throw new Error('Valid start and end are required.');
  const start=new Date(startText),end=new Date(endText);if(!(end>start)||(end-start)>8*86400000)throw new Error('Invalid date range.');
  return {u,start,end,days:normalizeDayStarts(u.searchParams.get('dayStarts'),startText,endText)};
}

/* Employee report: one employee over a long period (up to ~14 months).
   Kept in this file rather than its own api/*.js because Vercel's Hobby plan
   caps a deployment at 12 Serverless Functions and this project uses all 12.
   Returns raw shifts and lets the client bucket them by local day, which keeps
   day boundaries correct in the viewer's timezone. */
const MAX_REPORT_DAYS=430, MAX_REPORT_SHIFTS=3000;

async function handleReport(req,res,u){
  const employeeId=Number(u.searchParams.get('employeeId'));
  if(!Number.isInteger(employeeId)||employeeId<=0)return json(res,400,{error:'Choose an employee.'});
  const startText=u.searchParams.get('start'),endText=u.searchParams.get('end');
  if(!startText||!endText||Number.isNaN(Date.parse(startText))||Number.isNaN(Date.parse(endText)))return json(res,400,{error:'Valid start and end are required.'});
  const start=new Date(startText),end=new Date(endText);
  if(!(end>start))return json(res,400,{error:'End must be after start.'});
  if((end-start)>MAX_REPORT_DAYS*86400000)return json(res,400,{error:'Report range is too long.'});
  const employees=await sql`SELECT id,name,title,hourly_wage,active FROM employees WHERE id=${employeeId} LIMIT 1`;
  if(!employees.length)return json(res,404,{error:'Employee not found.'});
  const shifts=await sql`
    SELECT s.id,s.employee_id,s.clock_in,s.clock_out,s.clock_out_note,s.clock_out_message,
           s.manager_review_status,s.manager_review_note,s.manager_custom_paid_hours,s.manager_original_clock_out,
           e.hourly_wage,
           (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours,
           (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
    FROM shifts s JOIN employees e ON e.id=s.employee_id
    WHERE s.employee_id=${employeeId}
      AND s.clock_in<${end.toISOString()}::timestamptz
      AND (s.clock_out IS NULL OR s.clock_out>${start.toISOString()}::timestamptz)
    ORDER BY s.clock_in ASC
    LIMIT ${MAX_REPORT_SHIFTS}`;
  const minimum=await settingNumber('project_completed_min_paid_hours',8);
  return json(res,200,{employee:employees[0],shifts,truncated:shifts.length>=MAX_REPORT_SHIFTS,settings:{project_completed_min_paid_hours:minimum}});
}

export default async function handler(req,res){
  try{
    const manager=await requireManager(req,res);if(!manager)return;
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
    const url=new URL(req.url,'https://workclock.invalid');
    if(url.searchParams.get('view')==='report')return await handleReport(req,res,url);
    let range;try{range=getRange(req);}catch(e){return json(res,400,{error:e.message});}
    const {start,end,days}=range;
    const employees=await sql`SELECT id,name,title,hourly_wage,active FROM employees WHERE active=true ORDER BY name`;
    const shifts=await sql`
      SELECT s.id,e.id AS employee_id,e.name,e.title,e.hourly_wage,s.clock_in,s.clock_out,s.clock_in_lat,s.clock_in_lng,s.clock_out_lat,s.clock_out_lng,s.clock_out_distance_miles,s.clock_out_note,s.clock_out_message,s.manager_review_status,s.manager_review_note,s.manager_reviewed_at,s.manager_custom_paid_hours,s.manager_original_clock_out,
      (SELECT mf.paid_hours FROM manager_force_clockouts mf WHERE mf.shift_id=s.id ORDER BY mf.created_at DESC LIMIT 1) AS manager_force_paid_hours,
      (SELECT count(*)::int FROM rejected_clock_outs r WHERE r.shift_id=s.id) AS rejected_count
      FROM shifts s JOIN employees e ON e.id=s.employee_id
      WHERE s.clock_in<${end.toISOString()}::timestamptz AND (s.clock_out IS NULL OR s.clock_out>${start.toISOString()}::timestamptz)
      ORDER BY s.clock_in DESC`;
    const minimum=await settingNumber('project_completed_min_paid_hours',8);
    const weekly={};for(const e of employees)weekly[e.id]={employee_id:e.id,name:e.name,title:e.title,wage:Number(e.hourly_wage||0),days:Array(Math.max(1,days.length-1)).fill(0),actual_days:Array(Math.max(1,days.length-1)).fill(0)};
    let totalPaid=0,totalPayroll=0;
    for(const sh of shifts){
      const actual=hoursBetween(sh.clock_in,sh.clock_out), paid=effectiveShiftPay(sh,minimum),alloc=allocatePaidHours(sh,days,minimum);const e=weekly[sh.employee_id];
      if(e){alloc.forEach((v,i)=>{e.days[i]+=v;});
        const actualAlloc=Array(days.length-1).fill(0);for(let i=0;i<days.length-1;i++){const s=days[i],en=days[i+1];const a=new Date(sh.clock_in).getTime(),b=new Date(sh.clock_out||Date.now()).getTime(),os=Math.max(a,s.getTime()),oe=Math.min(b,en.getTime());actualAlloc[i]=Math.max(0,(oe-os)/3600000);e.actual_days[i]+=actualAlloc[i];}
      }
      const periodPaid=alloc.reduce((a,b)=>a+b,0);
      totalPaid+=periodPaid;totalPayroll+=periodPaid*Number(sh.hourly_wage||0);
    }
    const rejected=await sql`
      SELECT r.id,r.shift_id,r.created_at,r.lat,r.lng,r.distance_miles,r.reason,r.note,e.id AS employee_id,e.name,e.title
      FROM rejected_clock_outs r JOIN shifts s ON s.id=r.shift_id JOIN employees e ON e.id=s.employee_id
      WHERE r.created_at>=${start.toISOString()}::timestamptz AND r.created_at<${end.toISOString()}::timestamptz
      ORDER BY r.created_at DESC`;
    const pendingCount=shifts.filter(s=>s.manager_review_status==='pending').length;
    const liveEmployees=shifts.filter(s=>!s.clock_out).length;
    const summary={total_paid_hours:totalPaid,total_payroll:totalPayroll,rejected_clock_outs:rejected.length,pending_approvals:pendingCount,live_clock_ins:liveEmployees};
    for(const e of Object.values(weekly)){e.total=e.days.reduce((a,b)=>a+b,0);e.earnings=e.total*e.wage;}
    return json(res,200,{employees,shifts,summary,weekly:Object.values(weekly),rejectedAttempts:rejected,settings:{project_completed_min_paid_hours:minimum}});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
