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
    if(!['approve_full','approve_actual','approve_custom'].includes(decision))return json(res,400,{error:'Choose full-hour, actual-hour, or custom-hour approval.'});

    if(decision==='approve_custom'){
      const paidHours=Number(b.paidHours);
      if(!Number.isFinite(paidHours)||paidHours<0||paidHours>24)return json(res,400,{error:'Custom paid hours must be between 0 and 24.'});
      const existing=await sql`SELECT id,clock_in,clock_out FROM shifts WHERE id=${shiftId} AND clock_out IS NOT NULL LIMIT 1`;
      if(!existing.length)return json(res,404,{error:'Completed shift not found.'});
      const current=existing[0];
      let corrected=null;
      const raw=b.clockOut==null?'':String(b.clockOut).trim();
      if(raw){
        const parsed=parseDateTime(raw);
        if(!parsed)return json(res,400,{error:'Choose a valid corrected clock-out date and time.'});
        if(parsed.getTime()<=new Date(current.clock_in).getTime())return json(res,400,{error:'Corrected clock-out must be after the clock-in time.'});
        if(parsed.getTime()>Date.now()+5*60*1000)return json(res,400,{error:'Corrected clock-out cannot be more than 5 minutes in the future.'});
        corrected=parsed.toISOString();
      }
      const rows=await sql`
        UPDATE shifts SET
          manager_review_status='approved_custom',
          manager_custom_paid_hours=${paidHours},
          clock_out=COALESCE(${corrected}::timestamptz,clock_out),
          manager_original_clock_out=CASE WHEN ${corrected}::timestamptz IS NOT NULL AND manager_original_clock_out IS NULL THEN clock_out ELSE manager_original_clock_out END,
          manager_review_note=${note||null},
          manager_reviewed_by=${manager.id},
          manager_reviewed_at=now()
        WHERE id=${shiftId} AND clock_out IS NOT NULL
        RETURNING id,employee_id,clock_in,clock_out,clock_out_note,manager_review_status,manager_custom_paid_hours,manager_original_clock_out`;
      if(!rows.length)return json(res,404,{error:'Completed shift not found.'});
      await audit('manager',manager.id,'shift_pay_reviewed',{shift_id:shiftId,employee_id:rows[0].employee_id,decision,paid_hours:paidHours,corrected_clock_out:corrected,original_clock_out:rows[0].manager_original_clock_out,note:note||null});
      return json(res,200,{ok:true,shift:rows[0],paidHours});
    }

    const rows=await sql`UPDATE shifts SET manager_review_status=${decision==='approve_full'?'approved_full':'approved_actual'},manager_custom_paid_hours=NULL,manager_review_note=${note||null},manager_reviewed_by=${manager.id},manager_reviewed_at=now() WHERE id=${shiftId} AND clock_out IS NOT NULL RETURNING id,employee_id,clock_in,clock_out,clock_out_note,manager_review_status`;
    if(!rows.length)return json(res,404,{error:'Completed shift not found.'});
    await audit('manager',manager.id,'shift_pay_reviewed',{shift_id:shiftId,employee_id:rows[0].employee_id,decision,note:note||null});
    return json(res,200,{ok:true,shift:rows[0]});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
