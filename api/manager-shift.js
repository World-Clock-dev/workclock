import { sql, json, requireManager, requireSameOrigin, audit, settingNumber } from './_db.js';
import { effectiveShiftPay } from './_time.js';

function id(v){const n=Number(v);return Number.isInteger(n)&&n>0?n:null;}

export default async function handler(req,res){
  try{
    if(!requireSameOrigin(req,res))return;const manager=await requireManager(req,res);if(!manager)return;
    if(req.method!=='POST'&&req.method!=='PATCH')return json(res,405,{error:'Method not allowed'});
    const b=req.body||{},shiftId=id(b.shiftId);if(!shiftId)return json(res,400,{error:'Shift id required.'});
    if(req.method==='POST'){
      const action=String(b.action||'');if(action!=='force_clock_out')return json(res,400,{error:'Invalid manager action.'});
      const rows=await sql`UPDATE shifts SET clock_out=now(),clock_out_note='Manager forced clock out',clock_out_message=${String(b.message||'').trim().slice(0,500)||'Manager closed this shift from the Manager Portal.'},manager_review_status='not_required',manager_reviewed_by=${manager.id},manager_reviewed_at=now(),manager_review_note='Manager forced clock out' WHERE id=${shiftId} AND clock_out IS NULL RETURNING id,employee_id,clock_in,clock_out`;
      if(!rows.length)return json(res,409,{error:'This shift is already clocked out.'});
      await audit('manager',manager.id,'manager_forced_clock_out',{shift_id:shiftId,employee_id:rows[0].employee_id});return json(res,200,{ok:true,shift:rows[0]});
    }
    const decision=String(b.decision||''),note=String(b.note||'').trim().slice(0,500);
    if(!['approve_full','approve_actual'].includes(decision))return json(res,400,{error:'Choose full 8-hour approval or actual-hours approval.'});
    const rows=await sql`UPDATE shifts SET manager_review_status=${decision==='approve_full'?'approved_full':'approved_actual'},manager_review_note=${note||null},manager_reviewed_by=${manager.id},manager_reviewed_at=now() WHERE id=${shiftId} AND clock_out IS NOT NULL RETURNING id,employee_id,clock_in,clock_out,clock_out_note,manager_review_status`;
    if(!rows.length)return json(res,404,{error:'Completed shift not found.'});
    await audit('manager',manager.id,'shift_pay_reviewed',{shift_id:shiftId,employee_id:rows[0].employee_id,decision,note:note||null});
    const minimum=await settingNumber('project_completed_min_paid_hours',8);
    return json(res,200,{ok:true,shift:rows[0],paidHours:effectiveShiftPay(rows[0],minimum)});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
