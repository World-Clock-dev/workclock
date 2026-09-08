(() => {
  const $ = id => document.getElementById(id);
  const managerMode = new URLSearchParams(location.search).get('manager') === '1';
  $('employeeSection').classList.toggle('hide', managerMode);
  $('managerSection').classList.toggle('hide', !managerMode);

  const ds = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ws = d => { const x = ds(d), w = x.getDay(); x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w)); return x; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dur = ms => { let s=Math.floor(Math.max(0,ms)/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);s%=60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const hours = x => Math.max(0, (new Date(x.clock_out || Date.now()) - new Date(x.clock_in)) / 3600000);
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#92;'}[m] || m));
  const api = async (url, opt={}) => {
    const headers = {...(opt.headers||{})};
    if (opt.body !== undefined) headers['content-type']='application/json';
    const r = await fetch(url, {...opt,headers,cache:'no-store'});
    let j={}; try{j=await r.json();}catch{}
    if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;e.payload=j;throw e;} return j;
  };
  const geo = () => new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('GPS is unavailable on this device/browser.'));
    navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),e=>reject(new Error(e.code===1?'Location permission denied. Please allow location access.':'Could not get your location.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  const stat = (message,type='info') => { const el=$('status'); if(el)el.innerHTML=`<div class="status ${type}">${esc(message)}</div>`; };
  const dayBounds = (start,count) => { const out=[]; for(let i=0;i<=count;i++){const d=new Date(start);d.setDate(d.getDate()+i);out.push(d.toISOString());} return out; };
  const qp = arr => encodeURIComponent(arr.join(','));
  const fmtDay = d => d.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'});
  const reasonNeedsReview = r => ['Project completed','Client request','Manager approval'].includes(String(r||''));

  let empCache=null, employeeIdentity=null, projectMinimum=8, employeeMap=null, employeeMarkers=[];
  function showEmployeeLogin(){employeeIdentity=null;empCache=null;$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent='';}
  function showEmployeeApp(emp){employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name||'—';$('employeeTitleDisplay').textContent=emp.title||'';$('weekDate').value=$('weekDate').value||iso(new Date());loadEmployee();}
  function ensureEmployeeMap(){
    if(employeeMap || !window.L) return;
    employeeMap=L.map('employeeMap').setView([20,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(employeeMap);
  }
  function renderEmployeeMap(){
    ensureEmployeeMap();if(!employeeMap||!empCache)return;
    employeeMarkers.forEach(m=>m.remove());employeeMarkers=[];
    const open=empCache.openShift, latest=(empCache.shifts||[]).filter(s=>s.clock_out).slice(-1)[0];
    const points=[];
    if(open?.clock_in_lat!=null)points.push({lat:Number(open.clock_in_lat),lng:Number(open.clock_in_lng),label:'Clock In'});
    if(latest?.clock_in_lat!=null)points.push({lat:Number(latest.clock_in_lat),lng:Number(latest.clock_in_lng),label:'Clock In'});
    if(latest?.clock_out_lat!=null)points.push({lat:Number(latest.clock_out_lat),lng:Number(latest.clock_out_lng),label:'Clock Out'});
    const unique=points.filter((p,i,a)=>a.findIndex(x=>x.lat===p.lat&&x.lng===p.lng&&x.label===p.label)===i);
    unique.forEach(p=>{const m=L.marker([p.lat,p.lng]).addTo(employeeMap).bindPopup(`${p.label}<br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);employeeMarkers.push(m);});
    if(unique.length===1)employeeMap.setView([unique[0].lat,unique[0].lng],14);else if(unique.length>1)employeeMap.fitBounds(L.latLngBounds(unique.map(p=>[p.lat,p.lng])),{padding:[20,20]});
    setTimeout(()=>employeeMap.invalidateSize(),100);
  }
  function renderEmployee(){
    if(managerMode||!employeeIdentity||!empCache)return;
    const p=empCache.employee,open=empCache.openShift;
    $('employeeTitleDisplay').textContent=p.title||'';
    $('shift').classList.toggle('hide',!open);$('earlyNoteWrap').classList.toggle('hide',!open);$('in').disabled=!!open;$('out').disabled=!open;
    if(open){const ci=new Date(open.clock_in);$('clockedAt').textContent=ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('running').textContent=dur(Date.now()-ci.getTime());}
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+6);
    $('weekTitle').textContent=`Week: ${start.toLocaleDateString([],{month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
    const a=(empCache.summary?.days||Array(7).fill(0)),rate=Number(p.hourly_wage||0),names=['MON','TUE','WED','THU','FRI','SAT','SUN'];let total=0;
    $('days').innerHTML=names.map((name,i)=>{const dt=new Date(start);dt.setDate(dt.getDate()+i);const v=Number(a[i]||0);total+=v;return `<div class="day"><div><div class="dn">${name}</div><div class="dd">${dt.toLocaleDateString([],{month:'numeric',day:'numeric'})}</div></div><div><div class="dh">${v.toFixed(2)}</div><div class="dm">$${(v*rate).toFixed(2)}</div></div></div>`;}).join('');
    $('weekTotal').textContent=total.toFixed(2);$('weekEarned').textContent='$'+(total*rate).toFixed(2);
    const now=new Date(),curStart=ws(now),idx=Math.floor((ds(now)-ds(curStart))/86400000),today=curStart.getTime()===start.getTime()?Number(a[idx]||0):0;
    $('hoursToday').textContent=today.toFixed(2);$('earnedToday').textContent='$'+(today*rate).toFixed(2);$('hoursWeek').textContent=total.toFixed(2);$('earnedWeek').textContent='$'+(total*rate).toFixed(2);
    renderEmployeeMap();
    if(empCache.ruleAlert)stat(empCache.ruleAlert,'info');
  }
  async function loadEmployee(){
    if(managerMode||!employeeIdentity)return;
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),bounds=dayBounds(start,7),end=new Date(bounds[bounds.length-1]);
    try{empCache=await api(`/api/employee?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`);employeeIdentity=empCache.employee;projectMinimum=Number(empCache.settings?.project_completed_min_paid_hours??8);renderEmployee();}
    catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}
  }
  function tick(){if(managerMode)return;const d=new Date();$('clock').textContent=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('dateText').textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'});if(empCache?.openShift)renderEmployee();}

  async function initEmployee(){
    try{const s=await api('/api/employee-auth');if(s.authenticated)showEmployeeApp(s.employee);else showEmployeeLogin();}catch{showEmployeeLogin();}
    $('employeeLoginBtn').onclick=async()=>{const name=$('employeeLoginName').value.trim(),pin=$('employeePin').value.trim();try{$('employeeLoginError').textContent='';const j=await api('/api/employee-auth',{method:'POST',body:JSON.stringify({name,pin})});$('employeePin').value='';showEmployeeApp(j.employee);}catch(e){$('employeeLoginError').textContent=e.message;}};
    $('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')$('employeeLoginBtn').click();});
    $('forgotEmployeeBtn').onclick=()=>{$('employeeRecovery').classList.toggle('hide');$('employeeRecoveryMsg').textContent='Enter your approved name and we will notify the manager. Your PIN is never emailed.';};
    $('requestPinResetBtn').onclick=async()=>{const name=$('recoveryEmployeeName').value.trim();if(!name)return $('employeeRecoveryMsg').textContent='Enter your approved employee name.';try{const j=await api('/api/employee-pin-reset',{method:'POST',body:JSON.stringify({name})});$('employeeRecoveryMsg').textContent=j.message;}catch(e){$('employeeRecoveryMsg').textContent=e.message;}};
    $('employeeLogoutBtn').onclick=async()=>{try{await api('/api/employee-auth',{method:'DELETE'});}catch{}showEmployeeLogin();};
    $('weekDate').value=iso(new Date());$('weekDate').oninput=loadEmployee;
    $('prev').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()-7);$('weekDate').value=iso(d);loadEmployee();};
    $('next').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()+7);$('weekDate').value=iso(d);loadEmployee();};
    $('in').onclick=async()=>{try{stat('Checking GPS…');const c=await geo();const j=await api('/api/clock-in',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude})});stat(j.ruleAlert||'Clock In accepted. Your location was saved.','ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}};
    $('out').onclick=async()=>{try{stat('Checking GPS and location limit…');const c=await geo();const j=await api('/api/clock-out',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude,note:$('earlyNote').value,message:$('clockOutMessage').value.trim()})});$('clockOutMessage').value='';stat(j.managerReview?'Clock Out accepted. The manager must review this exception.':`Clock Out accepted. Distance from Clock In: ${Number(j.distance).toFixed(2)} miles.`,'ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.payload?.ruleAlert||e.message,'bad');}};
    tick();setInterval(tick,1000);
  }

  let managerPeople=[];
  async function loadPeople(){const j=await api('/api/employees');managerPeople=j.employees||[];renderPeople();}
  function renderPeople(){
    if(!managerMode)return;
    $('approvedList').innerHTML=managerPeople.map(p=>`<div class="pill"><div class="personMeta"><b>${esc(p.name)}</b><span>${esc(p.title||'No title')} · $${Number(p.hourly_wage).toFixed(2)}/hr · ${p.email?esc(p.email)+' · ':''}${p.has_pin?'PIN set':'PIN needed'}</span></div><input class="inlineTitle" data-title-id="${p.id}" value="${esc(p.title||'')}" maxlength="80" placeholder="Title"><button data-save-person="${p.id}">Save</button><button data-pin="${p.id}">${p.has_pin?'Reset PIN':'Set PIN'}</button><button class="remove" data-remove="${p.id}">Remove</button></div>`).join('')||'<span class="small">No active employees yet.</span>';
    document.querySelectorAll('[data-save-person]').forEach(b=>b.onclick=async()=>{const p=managerPeople.find(x=>String(x.id)===String(b.dataset.savePerson)),title=document.querySelector(`[data-title-id="${b.dataset.savePerson}"]`)?.value||'';if(!p)return;try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:p.id,title,wage:Number(p.hourly_wage),email:p.email||''})});await loadPeople();}catch(e){$('employeeMsg').textContent=e.message;}});
    document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const pin=prompt('Enter a new 4-digit PIN:');if(pin===null)return;if(!/^\d{4}$/.test(pin))return alert('PIN must be exactly 4 digits.');try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:b.dataset.pin,pin})});$('employeeMsg').textContent='PIN updated. The employee must sign in again.';await loadPeople();}catch(e){$('employeeMsg').textContent=e.message;}});
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Deactivate this employee? Existing time records will remain available.'))return;try{await api(`/api/employees?id=${encodeURIComponent(b.dataset.remove)}`,{method:'DELETE'});await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}});
  }
  const loc=(a,b,label='View')=>a==null?'—':`<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${encodeURIComponent(a+','+b)}">${label}</a>`;
  const statusLabel=s=>({pending:'Pending manager review',approved_full:'Approved full hours',approved_actual:'Approved actual hours',not_required:'—'}[s]||'—');
  const safeMapPair=(x)=>{if(x.clock_in_lat==null)return '—';const inUrl=`https://www.google.com/maps?q=${encodeURIComponent(`${x.clock_in_lat},${x.clock_in_lng}`)}`;if(x.clock_out_lat==null)return `<a target="_blank" rel="noopener noreferrer" href="${inUrl}">Clock In</a>`;const outUrl=`https://www.google.com/maps?q=${encodeURIComponent(`${x.clock_out_lat},${x.clock_out_lng}`)}`;return `<a target="_blank" rel="noopener noreferrer" href="${inUrl}">In</a> / <a target="_blank" rel="noopener noreferrer" href="${outUrl}">Out</a>`;};
  async function loadSettings(){try{const j=await api('/api/settings');const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles??3;$('projectMinSetting').value=s.project_completed_min_paid_hours??8;$('maxEmployeesSetting').value=s.max_active_employees??100;}catch(e){$('settingsMsg').textContent=e.message;}}
  async function reviewShift(id,decision){const note=prompt(decision==='approve_full'?'Manager note (optional):':'Manager note (optional):')||'';try{await api('/api/manager-shift',{method:'PATCH',body:JSON.stringify({shiftId:id,decision,note})});await mgrRender();}catch(e){alert(e.message);}}
  async function forceClockOut(id){if(!confirm('Clock this employee out now from the Manager Portal?'))return;try{await api('/api/manager-shift',{method:'POST',body:JSON.stringify({action:'force_clock_out',shiftId:id})});await mgrRender();}catch(e){alert(e.message);}}
  async function mgrRender(){
    if(!managerMode)return;
    try{
      const mode=$('period').value,d=$('mdate').value?new Date($('mdate').value+'T12:00:00'):new Date(),start=mode==='week'?ws(d):ds(d),daysCount=mode==='week'?7:1,bounds=dayBounds(start,daysCount),end=new Date(bounds[bounds.length-1]);
      $('range').textContent=mode==='week'?`Week: ${start.toLocaleDateString()} – ${new Date(bounds[6]).toLocaleDateString()}`:fmtDay(start);
      const j=await api(`/api/manager?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`),q=$('search').value.trim().toLowerCase(),rows=(j.shifts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q));
      managerPeople=j.employees||managerPeople;
      $('rows').innerHTML=rows.map(x=>{
        const actual=hours(x),paid=(()=>{if(x.manager_review_status==='approved_actual')return actual;if(x.manager_review_status==='approved_full')return Math.max(actual,Number(j.settings?.project_completed_min_paid_hours??8));if(reasonNeedsReview(x.clock_out_note))return Math.max(actual,Number(j.settings?.project_completed_min_paid_hours??8));if(x.clock_out_note==='Ending shift'&&actual>=7.75)return Math.max(actual,Number(j.settings?.project_completed_min_paid_hours??8));return actual;})();
        const earned=paid*Number(x.hourly_wage||0),ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;
        const review=x.manager_review_status==='pending'?`<button class="mini primary" data-review-full="${x.id}">Approve 8h</button><button class="mini secondary" data-review-actual="${x.id}">Approve Actual</button>`:esc(statusLabel(x.manager_review_status));
        const action=x.clock_out? (x.manager_review_status==='pending'?review:'—') : `<button class="mini danger" data-force="${x.id}">Clock Out</button>`;
        return `<tr><td><b>${esc(x.name)}</b><div class="small">${esc(x.title||'')}</div></td><td>${fmtDay(ci)}</td><td>${ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${co?co.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Open'}</td><td>${actual.toFixed(2)}</td><td>${paid.toFixed(2)}</td><td>$${earned.toFixed(2)}</td><td><b>${esc(x.clock_out_note||'—')}</b>${x.clock_out_message?`<div class="small">${esc(x.clock_out_message)}</div>`:''}</td><td>${review}</td><td>${safeMapPair(x)}</td><td>${x.clock_out?'':'<span class="small">Open shift</span>'}${x.clock_out&&x.manager_review_status==='pending'?'':''}${!x.clock_out?action:''}</td></tr>`;
      }).join('')||'<tr><td colspan="11">No records.</td></tr>';
      document.querySelectorAll('[data-review-full]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewFull,'approve_full'));
      document.querySelectorAll('[data-review-actual]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewActual,'approve_actual'));
      document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>forceClockOut(b.dataset.force));

      $('rejectedRows').innerHTML=(j.rejectedAttempts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q)).map(x=>{const t=new Date(x.created_at);return `<tr><td><b>${esc(x.name)}</b><div class="small">${esc(x.title||'')}</div></td><td>${fmtDay(t)}</td><td>${t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(x.reason)}</td><td>${esc(x.note||'—')}</td><td>${Number(x.distance_miles).toFixed(2)} mi</td><td>${loc(x.lat,x.lng,'View location')}</td></tr>`;}).join('')||'<tr><td colspan="7">No rejected clock-out attempts in this period.</td></tr>';
      $('empCount').textContent=managerPeople.length;$('mHours').textContent=Number(j.summary?.total_paid_hours||0).toFixed(2);$('payroll').textContent='$'+Number(j.summary?.total_payroll||0).toFixed(2);$('rejected').textContent=Number(j.summary?.rejected_clock_outs||0);$('weeklyCard').classList.toggle('hide',mode!=='week');
      if(mode==='week'){
        const weekly=(j.weekly||[]).filter(e=>!q||e.name.toLowerCase().includes(q));
        $('weeklyRows').innerHTML=weekly.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.title||'')}</td><td><input class="wage" type="number" min="0" max="100000" step="0.01" value="${Number(e.wage).toFixed(2)}" data-id="${e.employee_id}"></td>${e.days.map(v=>`<td>${Number(v).toFixed(2)}</td>`).join('')}<td><b>${Number(e.total).toFixed(2)}</b></td><td><b>$${Number(e.earnings).toFixed(2)}</b></td></tr>`).join('')||'<tr><td colspan="12">No employees.</td></tr>';
        document.querySelectorAll('.wage').forEach(i=>i.onchange=async()=>{try{const person=managerPeople.find(p=>String(p.id)===String(i.dataset.id));await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:i.dataset.id,wage:Number(i.value),title:person?.title||'',email:person?.email||''})});await loadPeople();await mgrRender();}catch(e){alert(e.message);}});
      }
    }catch(e){$('employeeMsg').textContent='Connection error: '+e.message;}
  }
  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),title=$('newTitle').value.trim(),email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});['newName','newTitle','newEmail','newWage','newPin'].forEach(id=>$(id).value='');$('employeeMsg').textContent='Employee saved and PIN set.';await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}};
    $('saveSettings').onclick=async()=>{try{const j=await api('/api/settings',{method:'PATCH',body:JSON.stringify({clock_out_radius_miles:Number($('radiusSetting').value),project_completed_min_paid_hours:Number($('projectMinSetting').value),max_active_employees:Number($('maxEmployeesSetting').value)})});const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles;$('projectMinSetting').value=s.project_completed_min_paid_hours;$('maxEmployeesSetting').value=s.max_active_employees;$('settingsMsg').textContent='Settings saved.';}catch(e){$('settingsMsg').textContent=e.message;}};
    $('changeManagerPasswordBtn').onclick=async()=>{const currentPassword=$('currentManagerPassword').value,newPassword=$('newManagerPassword').value,confirmPassword=$('confirmManagerPassword').value;if(!currentPassword||!newPassword||!confirmPassword)return $('managerPasswordMsg').textContent='Complete all password fields.';if(newPassword!==confirmPassword)return $('managerPasswordMsg').textContent='New passwords do not match.';try{await api('/api/manager-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('managerPasswordMsg').textContent='Password changed. Please sign in again.';setTimeout(()=>location.reload(),700);}catch(e){$('managerPasswordMsg').textContent=e.message;}};
    $('logoutBtn').onclick=async()=>{try{await api('/api/manager-auth',{method:'DELETE'});}catch{}location.href='/?manager=1';};
    ['period','mdate','search'].forEach(id=>$(id).addEventListener('input',mgrRender));$('refresh').onclick=mgrRender;await loadPeople();await loadSettings();await mgrRender();setInterval(()=>{if(!$('managerApp').classList.contains('hide'))mgrRender();},30000);
  }
  async function initManager(){
    const resetToken=new URLSearchParams(location.search).get('reset');
    if(resetToken){$('managerLogin').classList.remove('hide');$('managerApp').classList.add('hide');$('managerLoginBtn').classList.add('hide');$('forgotManagerBtn').classList.add('hide');$('managerRecovery').classList.add('hide');$('managerResetBox').classList.remove('hide');$('managerResetBox').dataset.token=resetToken;}
    try{const sess=await api('/api/manager-auth');if(sess.authenticated&&!resetToken)return startManagerApp();}catch{}
    $('managerLogin').classList.remove('hide');$('managerApp').classList.add('hide');
    $('managerLoginBtn').onclick=async()=>{const username=$('managerUser').value.trim(),password=$('managerPass').value;try{$('loginError').textContent='';await api('/api/manager-auth',{method:'POST',body:JSON.stringify({username,password})});await startManagerApp();}catch(e){$('loginError').textContent=e.message;}};
    $('managerPass').addEventListener('keydown',e=>{if(e.key==='Enter')$('managerLoginBtn').click();});
    $('forgotManagerBtn').onclick=()=>{$('managerRecovery').classList.toggle('hide');$('managerRecoveryMsg').textContent='A secure reset link will be sent to the configured admin email.';};
    $('requestManagerResetBtn').onclick=async()=>{const username=$('recoveryManagerUsername').value.trim();if(!username)return $('managerRecoveryMsg').textContent='Enter the manager username.';try{const j=await api('/api/manager-password-reset',{method:'POST',body:JSON.stringify({username})});$('managerRecoveryMsg').textContent=j.message;}catch(e){$('managerRecoveryMsg').textContent=e.message;}};
    $('completeManagerResetBtn').onclick=async()=>{const a=$('resetManagerPassword').value,b=$('resetManagerPasswordConfirm').value;if(a!==b)return $('managerResetMsg').textContent='Passwords do not match.';try{await api('/api/manager-password-reset',{method:'PATCH',body:JSON.stringify({token:resetToken,newPassword:a})});$('managerResetMsg').textContent='Password reset successfully. You can now sign in.';setTimeout(()=>location.href='/?manager=1',900);}catch(e){$('managerResetMsg').textContent=e.message;}};
  }
  document.querySelectorAll('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{const input=$(btn.dataset.togglePassword);if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';btn.textContent=visible?'Show':'Hide';}));
  if(managerMode)initManager();else initEmployee();
})();
