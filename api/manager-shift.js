import { sql, json, requireManager, requireSameOrigin, audit } from './_db.js';
import { hoursBetween } from './_time.js';

function id(v){const n=Number(v);return Number.isInteger(n)&&n>0?n:null;}
function clean(v,max=500){return String(v??'').trim().slice(0,max);}
function parseDateTime(v){const d=new Date(String(v||''));return Number.isFinite(d.getTime())?d:null;}

export default async function handler(req,res){
  try{
    if(!requireSameOrigin(req,res))return;const manager=await requireManager(req,res);if(!manager)return;
    if(req.method!=='POST'&&req.method!=='PATCH')return json(res,405,{error:'Method not allowed'});
    const b=req.body||{},shiftId=id(b.shiftId);if(!shiftId)return json(res,400,{error:'Shift id required.'});

    if(req.method==='POST'){
      const action=String(b.action||'');
      if(action!=='force_clock_out')return json(res,400,{error:'Invalid manager action.'});
      const clockOutAt=parseDateTime(b.clockOutAt);if(!clockOutAt)return json(res,400,{error:'Choose a valid clock-out date and time.'});
      if(clockOutAt.getTime()>Date.now()+5*60*1000)return json(res,400,{error:'Manager clock-out time cannot be more than 5 minutes in the future.'});
      const payMode=['actual','eight','custom'].includes(String(b.payMode||''))?String(b.payMode):'actual';
      const customPaid=Number(b.paidHours);
      if(payMode==='custom'&&(!Number.isFinite(customPaid)||customPaid<0||customPaid>24))return json(res,400,{error:'Custom paid hours must be between 0 and 24.'});
      const note=clean(b.message)||'Manager closed this shift from the Manager Portal.';
      const rows=await sql`
        UPDATE shifts
        SET clock_out=${clockOutAt.toISOString()}::timestamptz,
            clock_out_note='Manager force clock out',
            clock_out_message=${note},
            manager_review_status='not_required',
            manager_reviewed_by=${manager.id},
            manager_reviewed_at=now(),
            manager_review_note=${`Manager force clock-out; payroll mode: ${payMode}${payMode==='custom'?` (${customPaid} hours)`:''}`}
        WHERE id=${shiftId} AND clock_out IS NULL
        RETURNING id,employee_id,clock_in,clock_out,clock_out_note,clock_out_message`;
      if(!rows.length)return json(res,409,{error:'This shift is already clocked out.'});
      const actual=hoursBetween(rows[0].clock_in,rows[0].clock_out);
      const paid=payMode==='eight'?8:payMode==='custom'?customPaid:actual;
      await sql`INSERT INTO manager_force_clockouts(shift_id,manager_id,clock_out_at,pay_mode,paid_hours,note) VALUES(${shiftId},${manager.id},${clockOutAt.toISOString()}::timestamptz,${payMode},${paid},${note})`;
      await audit('manager',manager.id,'manager_forced_clock_out',{shift_id:shiftId,employee_id:rows[0].employee_id,clock_out_at:clockOutAt.toISOString(),pay_mode:payMode,paid_hours:paid,note});
      return json(res,200,{ok:true,shift:rows[0],actualHours:actual,paidHours:paid});
    }

    const decision=String(b.decision||''),note=clean(b.note);
    if(!['approve_full','approve_actual'].includes(decision))return json(res,400,{error:'Choose full 8-hour approval or actual-hours approval.'});
    const rows=await sql`UPDATE shifts SET manager_review_status=${decision==='approve_full'?'approved_full':'approved_actual'},manager_review_note=${note||null},manager_reviewed_by=${manager.id},manager_reviewed_at=now() WHERE id=${shiftId} AND clock_out IS NOT NULL RETURNING id,employee_id,clock_in,clock_out,clock_out_note,manager_review_status`;
    if(!rows.length)return json(res,404,{error:'Completed shift not found.'});
    await audit('manager',manager.id,'shift_pay_reviewed',{shift_id:shiftId,employee_id:rows[0].employee_id,decision,note:note||null});
    return json(res,200,{ok:true,shift:rows[0]});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
