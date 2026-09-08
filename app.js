(() => {
  const $ = id => document.getElementById(id);
  const managerMode = new URLSearchParams(location.search).get('manager') === '1';
  $('employeeSection').classList.toggle('hide', managerMode);
  $('managerSection').classList.toggle('hide', !managerMode);

  const ds = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ws = d => { const x = ds(d), w = x.getDay(); x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w)); return x; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dur = ms => { let s=Math.floor(Math.max(0,ms)/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60); s%=60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const shortDur = ms => { const s=Math.floor(Math.max(0,ms)/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
  const actualMinutes = x => Math.max(0, Math.floor((new Date(x.clock_out || Date.now()) - new Date(x.clock_in))/60000));
  const paidMinutes = x => { const n = x?.paid_minutes; return (n !== null && n !== undefined && Number.isFinite(Number(n))) ? Number(n) : actualMinutes(x || {}); };
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#92;'}[m] || m));
  const money = (mins,wage) => `$${((Number(mins||0)/60)*Number(wage||0)).toFixed(2)}`;
  const fmtMins = mins => `${Math.floor(Number(mins||0)/60)}h ${Math.round(Number(mins||0)%60)}m`;
  const api = async (url,opt={}) => { const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})},cache:'no-store'}); let j={}; try{j=await r.json();}catch{} if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;throw e;} return j; };
  const geo = () => new Promise((resolve,reject) => { if(!navigator.geolocation)return reject(new Error('GPS is unavailable on this device/browser.')); navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),e=>reject(new Error(e.code===1?'Location permission denied. Please allow location access.':'Could not get your location.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0}); });
  const stat = (message,type='info') => { const el=$('status'); if(el)el.innerHTML=`<div class="status ${type}">${esc(message)}</div>`; };
  const statusLabel = s => ({pending_approval:'Pending manager approval',approved_full_shift:'Approved full shift',manager_adjusted:'Manager adjusted',actual:'Actual minutes'}[s] || 'Actual minutes');
  const safeDays = v => Array.isArray(v) && v.length===7 ? v : Array(7).fill(0);
  const safeArr = v => Array.isArray(v) ? v : [];

  /* ---------- Slow crossfade carousel for the real job-site photos on auth screens ---------- */
  function initImageCarousels(){
    document.querySelectorAll('.authVisual').forEach(visual=>{
      const frames=[...visual.querySelectorAll('.authImage')];
      if(frames.length<2)return;
      let i=frames.findIndex(f=>f.classList.contains('active'));
      if(i<0)i=0;
      setInterval(()=>{ frames[i].classList.remove('active'); i=(i+1)%frames.length; frames[i].classList.add('active'); },4500);
    });
  }

  let empCache=null, employeeIdentity=null;
  function showEmployeeLogin(){ employeeIdentity=null;empCache=null;$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent=''; }
  function showEmployeeApp(emp){ employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name;$('employeeTitleDisplay').textContent=emp.job_title||'Employee';$('weekDate').value=$('weekDate').value||iso(new Date());loadEmployee(); }

  function renderEmployee(){
    if(managerMode || !employeeIdentity || !empCache) return;
    try{
      const p=empCache.employee || employeeIdentity || {}, open=empCache.openShift;
      $('shift').classList.toggle('hide',!open); $('earlyNoteWrap').classList.toggle('hide',!open); $('in').disabled=!!open; $('out').disabled=!open;
      if(open){ const ci=new Date(open.clock_in);$('clockedAt').textContent=ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('running').textContent=dur(Date.now()-ci.getTime()); }
      const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+7);
      $('weekTitle').textContent=`Week: ${start.toLocaleDateString([],{month:'short',day:'numeric'})} – ${new Date(end.getTime()-86400000).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
      const mins=Array(7).fill(0),rate=Number(p.hourly_wage||0),names=['MON','TUE','WED','THU','FRI','SAT','SUN'];
      for(const x of safeArr(empCache.shifts)){ const i=Math.floor((ds(new Date(x.clock_in))-ds(start))/86400000); if(i>=0&&i<7) mins[i]+=paidMinutes(x); }
      let total=0; const today=ds(new Date());
      $('days').innerHTML=names.map((name,i)=>{const dt=new Date(start);dt.setDate(dt.getDate()+i);const dayMins=Number(mins[i]||0);total+=dayMins;const isToday=dt.getTime()===today.getTime();return `<div class="day${isToday?' today':''}"><div><div class="dn">${name}</div><div class="dd">${dt.toLocaleDateString([],{month:'numeric',day:'numeric'})}</div></div><div><div class="dh">${(dayMins/60).toFixed(2)}h</div><div class="dm">${money(dayMins,rate)}</div></div></div>`;}).join('');
      $('weekTotal').textContent=(total/60).toFixed(2); $('weekEarned').textContent=money(total,rate);
      const now=new Date(),curStart=ws(now);
      if(start.getTime()===curStart.getTime()){const idx=Math.floor((ds(now)-ds(curStart))/86400000),todayMins=Number(mins[idx]||0);$('hoursToday').textContent=(todayMins/60).toFixed(2);$('earnedToday').textContent=`${money(todayMins,rate)} earned today`;$('hoursWeek').textContent=(total/60).toFixed(2);$('earnedWeek').textContent=`${money(total,rate)} earned this week`;} else {$('hoursToday').textContent='0.00';$('earnedToday').textContent='$0.00 earned today';$('hoursWeek').textContent=(total/60).toFixed(2);$('earnedWeek').textContent=`${money(total,rate)} earned this week`;}
    }catch(e){ console.error('renderEmployee failed:',e); stat('Could not display your earnings right now. Pull to refresh or sign in again.','bad'); }
  }

  function tick(){ if(managerMode)return; const d=new Date();$('clock').textContent=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('dateText').textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'});if(empCache?.openShift)renderEmployee(); }

  async function loadEmployee(){
    if(managerMode||!employeeIdentity)return;
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+7);
    try{ empCache=await api(`/api/employee?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`); employeeIdentity={...employeeIdentity,...(empCache.employee||{})}; renderEmployee();
      const a=empCache.latestAutoClockout;if(a){const key=`wc_auto_notice_${employeeIdentity.id}_${a.id}`;if(!localStorage.getItem(key)){$('employeeNotice').innerHTML=`<strong>Important:</strong> Your previous shift was automatically clocked out after the maximum 12-hour limit. Please follow the Clock In and Clock Out procedure. <button id="dismissNotice" class="noticeClose">Dismiss</button>`;$('employeeNotice').classList.remove('hide');$('dismissNotice').onclick=()=>{localStorage.setItem(key,'1');$('employeeNotice').classList.add('hide');};}}
    }catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}
  }

  async function initEmployee(){
    initImageCarousels();
    try{const s=await api('/api/employee-auth');if(s.authenticated)showEmployeeApp(s.employee);else showEmployeeLogin();}catch{showEmployeeLogin();}
    $('employeeLoginBtn').onclick=async()=>{const name=$('employeeLoginName').value.trim(),pin=$('employeePin').value.trim(),b=$('employeeLoginBtn');b.disabled=true;try{$('employeeLoginError').textContent='';const j=await api('/api/employee-auth',{method:'POST',body:JSON.stringify({name,pin})});$('employeePin').value='';showEmployeeApp(j.employee);}catch(e){$('employeeLoginError').textContent=e.message;}finally{b.disabled=false;}};
    $('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')$('employeeLoginBtn').click();});
    $('forgotEmployeeBtn').onclick=()=>{$('employeeRecovery').classList.toggle('hide');$('employeeRecoveryMsg').textContent='Enter your approved name and we will notify the manager. Your PIN is never emailed.';};
    $('requestPinResetBtn').onclick=async()=>{const name=$('recoveryEmployeeName').value.trim();if(!name)return $('employeeRecoveryMsg').textContent='Enter your approved employee name.';try{$('requestPinResetBtn').disabled=true;const j=await api('/api/employee-pin-reset',{method:'POST',body:JSON.stringify({name})});$('employeeRecoveryMsg').textContent=j.message;}catch(e){$('employeeRecoveryMsg').textContent=e.message;}finally{$('requestPinResetBtn').disabled=false;}};
    $('employeeLogoutBtn').onclick=async()=>{try{await api('/api/employee-auth',{method:'DELETE'});}catch{}showEmployeeLogin();};
    $('weekDate').value=iso(new Date());$('weekDate').oninput=loadEmployee;$('prev').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()-7);$('weekDate').value=iso(d);loadEmployee();};$('next').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()+7);$('weekDate').value=iso(d);loadEmployee();};
    $('in').onclick=async()=>{const b=$('in');if(b.disabled)return;b.disabled=true;try{stat('Checking GPS…');const c=await geo();await api('/api/clock-in',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude})});stat('Clock In accepted. Your location was saved.','ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}finally{if(empCache?.openShift)$('in').disabled=true;else $('in').disabled=false;}};
    $('out').onclick=async()=>{const b=$('out');if(b.disabled)return;b.disabled=true;try{stat('Checking GPS and location limit…');const c=await geo();const j=await api('/api/clock-out',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude,note:$('earlyNote').value,message:$('earlyMessage').value})});stat(`Clock Out accepted. Distance from Clock In: ${Number(j.distance).toFixed(2)} miles.`,'ok');$('earlyMessage').value='';await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}finally{$('out').disabled=!empCache?.openShift;}};
    tick();setInterval(tick,1000);
  }

  let managerPeople=[];
  async function loadPeople(){const j=await api('/api/employees');managerPeople=j.employees||[];renderPeople();}
  function renderPeople(){
    if(!managerMode)return;
    $('approvedList').innerHTML=managerPeople.map(p=>`<div class="pill"><div class="personBlock"><b>${esc(p.name)}</b><span>${esc(p.job_title||'Employee')} · $${Number(p.hourly_wage||0).toFixed(2)}/hr · ${p.email?esc(p.email)+' · ':''}${p.has_pin?'PIN set':'PIN needed'}</span></div><button data-edit="${p.id}">Edit</button><button data-pin="${p.id}">${p.has_pin?'Reset PIN':'Set PIN'}</button><button class="remove" data-remove="${p.id}">Remove</button></div>`).join('')||'<span class="small">No active employees yet.</span>';
    document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{const p=managerPeople.find(x=>String(x.id)===String(b.dataset.edit));if(!p)return;const job=prompt('Job title:',p.job_title||'Employee');if(job===null)return;const wage=prompt('Hourly wage:',Number(p.hourly_wage||0).toFixed(2));if(wage===null)return;try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:p.id,jobTitle:job,wage:Number(wage)})});await loadPeople();await mgrRender();}catch(e){alert(e.message);}});
    document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const pin=prompt('Enter a new 4-digit PIN:');if(pin===null)return;if(!/^\d{4}$/.test(pin))return alert('PIN must be exactly 4 digits.');try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:b.dataset.pin,pin})});$('employeeMsg').textContent='PIN updated. The employee must sign in again.';await loadPeople();}catch(e){$('employeeMsg').textContent=e.message;}});
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Deactivate this employee? Existing time records will remain available.'))return;try{await api(`/api/employees?id=${encodeURIComponent(b.dataset.remove)}`,{method:'DELETE'});await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}});
  }
  async function loadSettings(){try{const j=await api('/api/settings'),s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles??3;$('standardShiftSetting').value=s.standard_shift_hours??8;$('thresholdSetting').value=s.full_shift_threshold_minutes??465;$('maxShiftSetting').value=s.max_shift_hours??12;$('maxEmployeesSetting').value=s.max_active_employees??100;}catch(e){$('settingsMsg').textContent=e.message;}}
  async function managerAction(shiftId,action,reason,message=''){return api('/api/manager-shift',{method:'POST',body:JSON.stringify({shiftId,action,reason,message})});}

  /* ---------- Clock-out reason modal: replaces a blind prompt() with the actual valid reasons ---------- */
  let mcoShiftId=null;
  function openManagerClockOut(shiftId,who){
    mcoShiftId=shiftId; $('mcoWho').textContent=who?`— ${who}`:''; $('mcoReason').value='Manager clock-out'; $('mcoMessage').value='';
    $('mcoModal').classList.remove('hide');
  }
  function closeManagerClockOut(){ $('mcoModal').classList.add('hide'); mcoShiftId=null; }
  function wireManagerClockOutTriggers(root){
    root.querySelectorAll('[data-manager-out]').forEach(b=>b.onclick=()=>openManagerClockOut(b.dataset.managerOut,b.dataset.managerOutWho||''));
  }

  function renderDailyEarnings(rows){
    const byEmp=new Map();
    for(const x of rows){const id=String(x.employee_id);if(!byEmp.has(id))byEmp.set(id,{name:x.name,job_title:x.job_title,wage:Number(x.hourly_wage||0),actual:0,paid:0,statuses:[]});const e=byEmp.get(id);e.actual+=actualMinutes(x);e.paid+=paidMinutes(x);e.statuses.push(statusLabel(x.payment_status));}
    const list=[...byEmp.values()].sort((a,b)=>a.name.localeCompare(b.name));
    $('dailyRows').innerHTML=list.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.job_title||'Employee')}</td><td>$${e.wage.toFixed(2)}</td><td>${fmtMins(e.actual)}</td><td>${fmtMins(e.paid)}</td><td class="earnedCell">${money(e.paid,e.wage)}</td><td>${esc([...new Set(e.statuses)].join(', '))}</td></tr>`).join('')||'<tr><td colspan="7">No earnings recorded for this date.</td></tr>';
  }

  function renderRightNow(openShifts){
    const list=safeArr(openShifts);
    $('rightNowCount').textContent=list.length;
    $('rightNowList').innerHTML=list.length? list.map(s=>{const elapsed=shortDur(Date.now()-new Date(s.clock_in).getTime());return `<div class="rnRow"><div class="rnWho"><b>${esc(s.name)}</b><span>${esc(s.job_title||'Employee')} · since ${new Date(s.clock_in).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><div class="rnElapsed">${elapsed}</div><button class="tableBtn out" data-manager-out="${s.id}" data-manager-out-who="${esc(s.name)}">Clock Out</button></div>`;}).join('') : '<div class="rightNowEmpty">No one is clocked in right now.</div>';
    wireManagerClockOutTriggers($('rightNowList'));
  }

  async function mgrRender(){
    if(!managerMode)return;
    try{
      const mode=$('period').value,d=$('mdate').value?new Date($('mdate').value+'T12:00:00'):new Date(),start=mode==='week'?ws(d):ds(d),end=new Date(start);end.setDate(end.getDate()+(mode==='week'?7:1));const inc=new Date(end);inc.setDate(inc.getDate()-1);$('range').textContent=mode==='week'?`Week: ${start.toLocaleDateString()} – ${inc.toLocaleDateString()}`:start.toLocaleDateString();
      const j=await api(`/api/manager?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`),q=$('search').value.trim().toLowerCase(),rows=(j.shifts||[]).filter(x=>!q||String(x.name||'').toLowerCase().includes(q)||String(x.job_title||'').toLowerCase().includes(q));
      managerPeople=j.employees||managerPeople;
      const standardHours=Number(j.settings?.standard_shift_hours ?? 8);
      renderRightNow(j.openShifts);
      $('rows').innerHTML=rows.map(x=>{const am=actualMinutes(x),pm=paidMinutes(x),w=Number(x.hourly_wage||0),ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;let action='—';if(!co)action=`<button class="tableBtn out" data-manager-out="${x.id}" data-manager-out-who="${esc(x.name)}">Clock Out</button>`;if(x.payment_status==='pending_approval')action+=` <button class="tableBtn approve" data-approve="${x.id}">Approve ${standardHours}h</button>`;return `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.job_title||'Employee')}</td><td>${ci.toLocaleDateString([],{weekday:'long'})}</td><td>${ci.toLocaleDateString()}</td><td>${ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${co?co.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Open'}</td><td>${fmtMins(am)}</td><td>${fmtMins(pm)}</td><td>${esc(statusLabel(x.payment_status))}</td><td>${money(pm,w)}</td><td>${esc(x.clock_out_note||'—')}</td><td>${esc(x.clock_out_message||'—')}</td><td>${esc(x.clock_out_source||'—')}</td><td>${action}</td></tr>`;}).join('')||'<tr><td colspan="14">No shift records for this period.</td></tr>';
      wireManagerClockOutTriggers($('rows'));
      document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{if(!confirm(`Approve this shift for the full ${standardHours}-hour payment?`))return;try{b.disabled=true;await managerAction(b.dataset.approve,'approve_full_shift','Manager approved full shift');await mgrRender();}catch(e){alert(e.message);b.disabled=false;}});
      $('empCount').textContent=managerPeople.length;$('mHours').textContent=Number(j.summary?.total_paid_hours||0).toFixed(2);$('payroll').textContent='$'+Number(j.summary?.total_payroll||0).toFixed(2);$('rejected').textContent=Number(j.summary?.rejected_clock_outs||0);
      renderDailyEarnings(rows);
      const weekly=safeArr(j.weekly);
      if(mode==='week'){
        $('weeklyCard').classList.remove('hide');
        $('weeklyRows').innerHTML=weekly.filter(e=>!q||String(e.name||'').toLowerCase().includes(q)||String(e.job_title||'').toLowerCase().includes(q)).map(e=>{const days=safeDays(e.days);return `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.job_title||'Employee')}</td><td>$${Number(e.wage||0).toFixed(2)}</td>${days.map(v=>{const h=Number(v||0);return `<td><span class="hoursCell">${h.toFixed(2)}h</span><span class="earnCell">${money(h*60,e.wage)}</span></td>`;}).join('')}<td><b>${Number(e.total||0).toFixed(2)}h</b></td><td><b>$${Number(e.earnings||0).toFixed(2)}</b></td></tr>`;}).join('')||'<tr><td colspan="12">No employees or earnings for this week.</td></tr>';
      } else $('weeklyCard').classList.add('hide');
      $('eventRows').innerHTML=(j.events||[]).filter(e=>!q||String(e.name||'').toLowerCase().includes(q)).map(e=>`<tr><td>${new Date(e.created_at).toLocaleDateString([],{weekday:'long'})}</td><td>${new Date(e.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(e.name||'—')}</td><td>${esc(e.event_type)}</td><td>${esc(e.reason||'—')}</td><td>${esc(e.message||'—')}</td><td>${e.distance_miles==null?'—':Number(e.distance_miles).toFixed(2)+' mi'}</td></tr>`).join('')||'<tr><td colspan="7">No events.</td></tr>';
    }catch(e){if(e.status===401)location.href='/?manager=1';else $('settingsMsg').textContent='Connection error: '+e.message;}
  }

  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),jobTitle=$('newJobTitle').value.trim()||'Employee',email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,jobTitle,email,wage,pin})});$('newName').value='';$('newJobTitle').value='';$('newEmail').value='';$('newWage').value='';$('newPin').value='';$('employeeMsg').textContent='Employee saved and PIN set.';await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}};
    $('saveSettings').onclick=async()=>{try{const j=await api('/api/settings',{method:'PATCH',body:JSON.stringify({clock_out_radius_miles:Number($('radiusSetting').value),standard_shift_hours:Number($('standardShiftSetting').value),full_shift_threshold_minutes:Number($('thresholdSetting').value),max_shift_hours:Number($('maxShiftSetting').value),max_active_employees:Number($('maxEmployeesSetting').value)})});const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles;$('standardShiftSetting').value=s.standard_shift_hours;$('thresholdSetting').value=s.full_shift_threshold_minutes;$('maxShiftSetting').value=s.max_shift_hours;$('maxEmployeesSetting').value=s.max_active_employees;$('settingsMsg').textContent='Settings saved.';}catch(e){$('settingsMsg').textContent=e.message;}};
    $('changeManagerPasswordBtn').onclick=async()=>{const currentPassword=$('currentManagerPassword').value,newPassword=$('newManagerPassword').value,confirmPassword=$('confirmManagerPassword').value;if(!currentPassword||!newPassword||!confirmPassword)return $('managerPasswordMsg').textContent='Complete all password fields.';if(newPassword!==confirmPassword)return $('managerPasswordMsg').textContent='New passwords do not match.';try{await api('/api/manager-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('managerPasswordMsg').textContent='Password changed. Please sign in again.';setTimeout(()=>location.reload(),700);}catch(e){$('managerPasswordMsg').textContent=e.message;}};
    $('logoutBtn').onclick=async()=>{try{await api('/api/manager-auth',{method:'DELETE'});}catch{}location.href='/?manager=1';};['period','mdate','search'].forEach(id=>$(id).addEventListener('input',mgrRender));$('refresh').onclick=mgrRender;await loadPeople();await loadSettings();await mgrRender();setInterval(()=>{if(!$('managerApp').classList.contains('hide'))mgrRender();},30000);
  }
  async function initManager(){
    initImageCarousels();
    $('mcoCancelBtn').onclick=closeManagerClockOut;
    $('mcoConfirmBtn').onclick=async()=>{
      if(!mcoShiftId)return closeManagerClockOut();
      const reason=$('mcoReason').value,message=$('mcoMessage').value,btn=$('mcoConfirmBtn'),id=mcoShiftId;
      btn.disabled=true;
      try{ await managerAction(id,'clock_out',reason,message); closeManagerClockOut(); await mgrRender(); }
      catch(e){ alert(e.message); }
      finally{ btn.disabled=false; }
    };
    const resetToken=new URLSearchParams(location.search).get('reset');
    if(resetToken){$('managerLogin').classList.remove('hide');$('managerApp').classList.add('hide');$('managerLoginBtn').classList.add('hide');$('forgotManagerBtn').classList.add('hide');$('managerRecovery').classList.add('hide');$('managerResetBox').classList.remove('hide');$('managerLogin').querySelector('.authContent').classList.add('resetMode');$('managerResetBox').dataset.token=resetToken;}
    try{const sess=await api('/api/manager-auth');if(sess.authenticated&&!resetToken)return startManagerApp();}catch{}
    $('managerLogin').classList.remove('hide');$('managerApp').classList.add('hide');
    $('managerLoginBtn').onclick=async()=>{const username=$('managerUser').value.trim(),password=$('managerPass').value,b=$('managerLoginBtn');b.disabled=true;try{$('loginError').textContent='';await api('/api/manager-auth',{method:'POST',body:JSON.stringify({username,password})});await startManagerApp();}catch(e){$('loginError').textContent=e.message;}finally{b.disabled=false;}};
    $('managerPass').addEventListener('keydown',e=>{if(e.key==='Enter')$('managerLoginBtn').click();});
    $('forgotManagerBtn').onclick=()=>{$('managerRecovery').classList.toggle('hide');$('managerRecoveryMsg').textContent='A secure reset link will be sent to the configured admin email.';};
    $('requestManagerResetBtn').onclick=async()=>{const username=$('recoveryManagerUsername').value.trim();if(!username)return $('managerRecoveryMsg').textContent='Enter the manager username.';try{$('requestManagerResetBtn').disabled=true;const j=await api('/api/manager-password-reset',{method:'POST',body:JSON.stringify({username})});$('managerRecoveryMsg').textContent=j.message;}catch(e){$('managerRecoveryMsg').textContent=e.message;}finally{$('requestManagerResetBtn').disabled=false;}};
    $('completeManagerResetBtn').onclick=async()=>{const a=$('resetManagerPassword').value,b=$('resetManagerPasswordConfirm').value;if(a!==b)return $('managerResetMsg').textContent='Passwords do not match.';try{await api('/api/manager-password-reset',{method:'PATCH',body:JSON.stringify({token:resetToken,newPassword:a})});$('managerResetMsg').textContent='Password reset successfully. You can now sign in.';setTimeout(()=>location.href='/?manager=1',900);}catch(e){$('managerResetMsg').textContent=e.message;}};
  }
  document.querySelectorAll('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{const input=$(btn.dataset.togglePassword);if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';btn.textContent=visible?'Show':'Hide';}));
  if(managerMode)initManager();else initEmployee();
})();
