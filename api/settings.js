import { sql, json, requireManager, requireSameOrigin, audit } from './_db.js';

const LIMITS = {
  clock_out_radius_miles: [0.1, 100],
  project_completed_min_paid_hours: [0, 24],
  max_active_employees: [1, 1000]
};
export default async function handler(req,res){
  try{
    const manager=await requireManager(req,res); if(!manager)return;
    if(req.method==='GET'){
      const rows=await sql`SELECT key,value FROM app_settings WHERE key IN ('clock_out_radius_miles','project_completed_min_paid_hours','max_active_employees')`;
      const settings={}; for(const r of rows)settings[r.key]=Number(r.value);
      return json(res,200,{settings});
    }
    if(req.method!=='PATCH')return json(res,405,{error:'Method not allowed'});
    if(!requireSameOrigin(req,res))return;
    const b=req.body||{};
    for(const [key,[min,max]] of Object.entries(LIMITS)){
      if(b[key]===undefined)continue;
      const n=Number(b[key]);
      if(!Number.isFinite(n)||n<min||n>max)return json(res,400,{error:`Invalid ${key}.`});
      const value=key==='max_active_employees'?String(Math.round(n)):String(n);
      await sql`INSERT INTO app_settings(key,value,updated_at) VALUES(${key},${value},now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      await audit('manager',manager.id,'setting_updated',{key,value});
    }
    const rows=await sql`SELECT key,value FROM app_settings WHERE key IN ('clock_out_radius_miles','project_completed_min_paid_hours','max_active_employees')`;
    const settings={};for(const r of rows)settings[r.key]=Number(r.value);return json(res,200,{settings});
  }catch(e){console.error(e);return json(res,500,{error:'Server error'});}
}
