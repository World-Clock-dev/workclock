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
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m] || m));
  const api = async (url, opt={}) => {
    const r = await fetch(url, { ...opt, headers:{'content-type':'application/json',...(opt.headers||{})}, cache:'no-store' });
    let j={}; try{j=await r.json();}catch{}
    if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;throw e;} return j;
  };
  const geo = () => new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('GPS is unavailable on this device/browser.'));
    navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),e=>reject(new Error(e.code===1?'Location permission denied. Please allow location access.':'Could not get your location.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  const stat = (message,type='info') => { const el=$('status'); if(el)el.innerHTML=`<div class="status ${type}">${esc(message)}</div>`; };

  let empCache=null, employeeIdentity=null;
  let projectMinimum=8;
  function showEmployeeLogin(){ employeeIdentity=null;empCache=null;$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent=''; }
  function showEmployeeApp(emp){ employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name;$('weekDate').value=$('weekDate').value||iso(new Date());loadEmployee(); }
  function sums(shifts,start){
    const actual=Array(7).fill(0),completed=Array(7).fill(false);
    for(const x of shifts||[]){const ci=new Date(x.clock_in),i=Math.floor((ds(ci)-ds(start))/86400000);if(i<0||i>=7)continue;actual[i]+=hours(x);if(x.clock_out&&String(x.clock_out_note||'').toLowerCase()==='project completed')completed[i]=true;}
    return actual.map((v,i)=>completed[i]&&v<projectMinimum?projectMinimum:v);
  }
  async function loadEmployee(){
    if(managerMode||!employeeIdentity)return;
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+7);
    try{empCache=await api(`/api/employee?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);employeeIdentity={id:empCache.employee.id,name:empCache.employee.name};projectMinimum=Number(empCache.settings?.project_completed_min_paid_hours??8);renderEmployee();}
    catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}
  }
  function renderEmployee(){
    if(managerMode||!employeeIdentity||!empCache)return;
    const p=empCache.employee,open=empCache.openShift;
    $('shift').classList.toggle('hide',!open);$('earlyNoteWrap').classList.toggle('hide',!open);$('in').disabled=!!open;$('out').disabled=!open;
    if(open){const ci=new Date(open.clock_in);$('clockedAt').textContent=ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('running').textContent=dur(Date.now()-ci.getTime());}
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+6);
    $('weekTitle').textContent=`Week: ${start.toLocaleDateString([],{month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
    const a=sums(empCache.shifts,start),rate=Number(p.hourly_wage||0),names=['MON','TUE','WED','THU','FRI','SAT','SUN'];let total=0;
    $('days').innerHTML=names.map((name,i)=>{const dt=new Date(start);dt.setDate(dt.getDate()+i);total+=a[i];return `<div class="day"><div><div class="dn">${name}</div><div class="dd">${dt.toLocaleDateString([],{month:'numeric',day:'numeric'})}</div></div><div><div class="dh">${a[i].toFixed(2)}</div><div class="dm">$${(a[i]*rate).toFixed(2)}</div></div></div>`;}).join('');
    $('weekTotal').textContent=total.toFixed(2);$('weekEarned').textContent='$'+(total*rate).toFixed(2);
    const now=new Date(),curStart=ws(now);if(start.getTime()===curStart.getTime()){const idx=Math.floor((ds(now)-ds(curStart))/86400000),today=a[idx]||0;$('hoursToday').textContent=today.toFixed(2);$('earnedToday').textContent='$'+(today*rate).toFixed(2);$('hoursWeek').textContent=total.toFixed(2);$('earnedWeek').textContent='$'+(total*rate).toFixed(2);}else{$('hoursToday').textContent='0.00';$('earnedToday').textContent='$0.00';$('hoursWeek').textContent=total.toFixed(2);$('earnedWeek').textContent='$'+(total*rate).toFixed(2);}
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
    $('in').onclick=async()=>{try{stat('Checking GPS…');const c=await geo();await api('/api/clock-in',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude})});stat('Clock In accepted. Your location was saved.','ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}};
    $('out').onclick=async()=>{try{stat('Checking GPS and location limit…');const c=await geo();const j=await api('/api/clock-out',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude,note:$('earlyNote').value})});stat(`Clock Out accepted. Distance from Clock In: ${Number(j.distance).toFixed(2)} miles.`,'ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(e.message,'bad');}};
    tick();setInterval(tick,1000);
  }

  let managerPeople=[];
  async function loadPeople(){const j=await api('/api/employees');managerPeople=j.employees||[];renderPeople();}
  function renderPeople(){
    if(!managerMode)return;
    $('approvedList').innerHTML=managerPeople.map(p=>`<div class="pill"><b>${esc(p.name)}</b><span>· $${Number(p.hourly_wage).toFixed(2)}/hr · ${p.email?esc(p.email)+' · ':''}${p.has_pin?'PIN set':'PIN needed'}</span><button data-pin="${p.id}">${p.has_pin?'Reset PIN':'Set PIN'}</button><button class="remove" data-remove="${p.id}">Remove</button></div>`).join('')||'<span class="small">No active employees yet.</span>';
    document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const pin=prompt('Enter a new 4-digit PIN:');if(pin===null)return;if(!/^\d{4}$/.test(pin))return alert('PIN must be exactly 4 digits.');try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:b.dataset.pin,pin})});$('employeeMsg').textContent='PIN updated. The employee must sign in again.';await loadPeople();}catch(e){$('employeeMsg').textContent=e.message;}});
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Deactivate this employee? Existing time records will remain available.'))return;try{await api(`/api/employees?id=${encodeURIComponent(b.dataset.remove)}`,{method:'DELETE'});await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}});
  }
  const loc=(a,b)=>a==null?'—':`<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${encodeURIComponent(a+','+b)}">View</a>`;
  async function loadSettings(){try{const j=await api('/api/settings');const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles??3;$('projectMinSetting').value=s.project_completed_min_paid_hours??8;$('maxEmployeesSetting').value=s.max_active_employees??100;}catch(e){$('settingsMsg').textContent=e.message;}}
  async function mgrRender(){
    if(!managerMode)return;
    try{
      const mode=$('period').value,d=$('mdate').value?new Date($('mdate').value+'T12:00:00'):new Date(),start=mode==='week'?ws(d):ds(d),end=new Date(start);end.setDate(end.getDate()+(mode==='week'?7:1));const inc=new Date(end);inc.setDate(inc.getDate()-1);
      $('range').textContent=mode==='week'?`Week: ${start.toLocaleDateString()} – ${inc.toLocaleDateString()}`:start.toLocaleDateString();
      const j=await api(`/api/manager?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`),q=$('search').value.trim().toLowerCase(),rows=(j.shifts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q));
      managerPeople=j.employees||managerPeople;let actualHours=0,actualPay=0;
      $('rows').innerHTML=rows.map(x=>{const z=hours(x),w=Number(x.hourly_wage||0),e=z*w,ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;actualHours+=z;actualPay+=e;return `<tr><td><b>${esc(x.name)}</b></td><td>${ci.toLocaleDateString()}</td><td>${ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${co?co.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Open'}</td><td>${z.toFixed(2)}</td><td>$${e.toFixed(2)}</td><td>${loc(x.clock_in_lat,x.clock_in_lng)}</td><td>${loc(x.clock_out_lat,x.clock_out_lng)}</td><td>${esc(x.clock_out_note||'—')}</td><td>${Number(x.rejected_count||0)}</td></tr>`;}).join('')||'<tr><td colspan="10">No records.</td></tr>';
      $('empCount').textContent=managerPeople.length;$('mHours').textContent=Number(j.summary?.total_paid_hours||0).toFixed(2);$('payroll').textContent='$'+Number(j.summary?.total_payroll||0).toFixed(2);$('rejected').textContent=Number(j.summary?.rejected_clock_outs||0);$('weeklyCard').classList.toggle('hide',mode!=='week');
      if(mode==='week'){
        const weekly=(j.weekly||[]).filter(e=>!q||e.name.toLowerCase().includes(q));
        $('weeklyRows').innerHTML=weekly.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td><input class="wage" type="number" min="0" max="100000" step="0.01" value="${Number(e.wage).toFixed(2)}" data-id="${e.employee_id}"></td>${e.days.map(v=>`<td>${Number(v).toFixed(2)}</td>`).join('')}<td><b>${Number(e.total).toFixed(2)}</b></td><td><b>$${Number(e.earnings).toFixed(2)}</b></td></tr>`).join('')||'<tr><td colspan="11">No employees.</td></tr>';
        document.querySelectorAll('.wage').forEach(i=>i.onchange=async()=>{try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:i.dataset.id,wage:Number(i.value)})});await loadPeople();await mgrRender();}catch(e){alert(e.message);}});
      }
    }catch(e){$('employeeMsg').textContent='Connection error: '+e.message;}
  }
  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,email,wage,pin})});$('newName').value='';$('newEmail').value='';$('newWage').value='';$('newPin').value='';$('employeeMsg').textContent='Employee saved and PIN set.';await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=e.message;}};
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
