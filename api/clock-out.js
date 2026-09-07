import { sql,json,validCoords,distanceMiles,requireEmployee,requireSameOrigin,settingNumber,audit } from './_db.js';
import { safeAdminEmail,appUrl } from './_email.js';

const ALLOWED = new Set(['Ending shift','Personal reason','Doctor appointment','Emergency','Project completed','Client request','Manager approval','Other']);
function cleanMessage(v){const s=String(v??'').trim();return s.slice(0,1000);}
export default async function handler(req,res){
  try{
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    if(!requireSameOrigin(req,res))return;
    const emp=await requireEmployee(req,res);if(!emp)return;
    const b=req.body||{},lat=Number(b.lat),lng=Number(b.lng),note=String(b.note||'Ending shift').trim(),message=cleanMessage(b.message);
    if(!validCoords(lat,lng))return json(res,400,{error:'A valid GPS location is required.'});
    if(!ALLOWED.has(note))return json(res,400,{error:'Please select a valid Clock Out reason.'});
    const sh=await sql`SELECT id,clock_in,clock_in_lat,clock_in_lng FROM shifts WHERE employee_id=${emp.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    if(!sh.length)return json(res,409,{error:'Already clocked out. You do not have an active Clock In.'});
    const shift=sh[0],miles=distanceMiles(Number(shift.clock_in_lat),Number(shift.clock_in_lng),lat,lng),radius=await settingNumber('clock_out_radius_miles',3);
    if(miles>radius){
      await sql`INSERT INTO rejected_clock_outs(shift_id,lat,lng,distance_miles,reason,message) VALUES(${shift.id},${lat},${lng},${miles},${`More than ${radius.toFixed(2)} miles from Clock In`},${message||null})`;
      await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,lat,lng,distance_miles,actor_type,actor_id) VALUES(${shift.id},${emp.id},'clock_out_rejected',${note},${message||null},${lat},${lng},${miles},'employee',${emp.id})`;
      await audit('employee',emp.id,'clock_out_rejected',{shift_id:shift.id,distance_miles:miles,reason:note,message});
      await safeAdminEmail({subject:`WorkClock: Clock Out rejected — ${emp.name}`,text:`${emp.name} attempted to Clock Out outside the allowed radius.\n\nReason: ${note}\nDistance: ${miles.toFixed(2)} miles\nAllowed radius: ${radius.toFixed(2)} miles\nTime: ${new Date().toLocaleString()}\n\nThe Clock Out was NOT accepted. The attempt is recorded in the Manager Portal.\n${message?`Message: ${message}\n`:''}${appUrl(req)}/?manager=1`,html:`<h2>Clock Out rejected</h2><p><strong>${escapeHtml(emp.name)}</strong> attempted to clock out outside the allowed radius.</p><p>Reason: ${escapeHtml(note)}<br>Distance: ${miles.toFixed(2)} miles<br>Allowed radius: ${radius.toFixed(2)} miles</p>${message?`<p>Message: ${escapeHtml(message)}</p>`:''}<p>The attempt was rejected and recorded in the Manager Portal.</p>`});
      return json(res,403,{error:`CLOCK OUT REJECTED — you are ${miles.toFixed(2)} miles from Clock In. You must be within ${radius.toFixed(2)} miles.`,distance:miles,rejected:true});
    }
    const durationMinutes=Math.max(0,Math.floor((Date.now()-new Date(shift.clock_in).getTime())/60000));
    const standardMinutes=Math.round((await settingNumber('standard_shift_hours',8))*60);
    const thresholdMinutes=Math.round(await settingNumber('full_shift_threshold_minutes',465));
    const autoFullShift=note==='End of scheduled shift' && durationMinutes>=thresholdMinutes;
    const needsApproval=['Project completed','Client request','Manager approval'].includes(note);
    const rows=await sql`UPDATE shifts SET clock_out=now(),clock_out_lat=${lat},clock_out_lng=${lng},clock_out_distance_miles=${miles},clock_out_note=${note},clock_out_message=${message||null},clock_out_source='employee',payment_status=${needsApproval?'pending_approval':autoFullShift?'approved_full_shift':'actual'},paid_minutes=${autoFullShift?Math.max(durationMinutes,standardMinutes):durationMinutes} WHERE id=${shift.id} AND employee_id=${emp.id} AND clock_out IS NULL RETURNING id,clock_in,clock_out,clock_out_distance_miles,clock_out_note,clock_out_message,payment_status,paid_minutes`;
    if(!rows.length)return json(res,409,{error:'Already clocked out. This shift was just closed.'});
    await sql`INSERT INTO shift_events(shift_id,employee_id,event_type,reason,message,lat,lng,distance_miles,actor_type,actor_id) VALUES(${shift.id},${emp.id},'clock_out',${note},${message||null},${lat},${lng},${miles},'employee',${emp.id})`;
    await audit('employee',emp.id,'clock_out',{shift_id:shift.id,distance_miles:miles,reason:note,message,payment_status:needsApproval?'pending_approval':'actual'});
    await safeAdminEmail({subject:`WorkClock: Clock Out — ${emp.name}`,text:`${emp.name} clocked out successfully.\nReason: ${note}\nMessage: ${message||'None'}\nDistance from Clock In: ${miles.toFixed(2)} miles\nWorked: ${durationMinutes} minutes\nPayment: ${needsApproval?'Manager approval required':autoFullShift?`Full ${standardMinutes/60}-hour shift`:'Actual minutes'}\n\nOpen Manager Portal: ${appUrl(req)}/?manager=1`,html:`<h2>Employee Clock Out</h2><p><strong>${escapeHtml(emp.name)}</strong> clocked out successfully.</p><p>Reason: ${escapeHtml(note)}<br>Message: ${escapeHtml(message||'None')}<br>Distance: ${miles.toFixed(2)} miles<br>Worked: ${durationMinutes} minutes<br>Payment: ${needsApproval?'Manager approval required':autoFullShift?`Full ${standardMinutes/60}-hour shift`:'Actual minutes'}</p>`});
    return json(res,200,{ok:true,distance:miles,shift:rows[0]});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
