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
  const displayMessage = value => { if (value && typeof value === 'object') return String(value.message || value.error || value.ruleAlert || 'Request failed'); return String(value ?? ''); };
  const stat = (message,type='info') => { const el=$('status'); if(el)el.innerHTML=`<div class="status ${type}">${esc(displayMessage(message))}</div>`; };
  const dayBounds = (start,count) => { const out=[]; for(let i=0;i<=count;i++){const d=new Date(start);d.setDate(d.getDate()+i);out.push(d.toISOString());} return out; };
  const qp = arr => encodeURIComponent(arr.join(','));
  const fmtDay = d => d.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'});
  const reasonNeedsReview = r => ['Project completed','Client request','Manager approval'].includes(String(r||''));

  let empCache=null, employeeIdentity=null, projectMinimum=8, employeeMap=null, employeeMarkers=[];
  function showEmployeeLogin(){employeeIdentity=null;empCache=null;$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent='';}
  function showEmployeeApp(emp){employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name||'—';$('employeeTitleDisplay').textContent=emp.title||'';$('employeeRateDisplay').textContent=Number(emp.hourly_wage||0).toFixed(2)==='0.00'?'$0.00/hr':`$${Number(emp.hourly_wage||0).toFixed(2)}/hr`;setEmpWeek($('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),false);loadEmployee();}
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
    $('employeeTitleDisplay').textContent=p.title||'';$('employeeRateDisplay').textContent=`$${Number(p.hourly_wage||0).toFixed(2)}/hr`;
    $('shift').classList.toggle('hide',!open);$('earlyNoteWrap').classList.toggle('hide',!open);$('in').disabled=!!open;$('out').disabled=!open;
    if(open){const ci=new Date(open.clock_in),elapsedHours=Math.max(0,(Date.now()-ci.getTime())/3600000);$('clockedAt').textContent=ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('running').textContent=dur(Date.now()-ci.getTime());const reasonEl=$('earlyNote');if(reasonEl){const placeholder=reasonEl.querySelector('option[value=""]');if(elapsedHours<8){reasonEl.required=true;if(placeholder){placeholder.hidden=false;placeholder.textContent='Select reason for leaving before 8 hours';}if(reasonEl.dataset.autoSet==='1'){reasonEl.value='';reasonEl.dataset.autoSet='0';}}else{reasonEl.required=false;if(!reasonEl.value){reasonEl.value='Ending shift';reasonEl.dataset.autoSet='1';}if(placeholder)placeholder.hidden=true;}}}
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+6);
    $('weekTitle').textContent=`Week: ${start.toLocaleDateString([],{month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
    const a=(empCache.summary?.days||Array(7).fill(0)),rate=Number(p.hourly_wage||0),names=['MON','TUE','WED','THU','FRI','SAT','SUN'];let total=0;
    $('days').innerHTML=names.map((name,i)=>{const dt=new Date(start);dt.setDate(dt.getDate()+i);const v=Number(a[i]||0);total+=v;return `<div class="day"><div><div class="dn">${name}</div><div class="dd">${dt.toLocaleDateString([],{month:'numeric',day:'numeric'})}</div></div><div><div class="dh">${v.toFixed(2)}</div><div class="dm">$${(v*rate).toFixed(2)}</div></div></div>`;}).join('');
    renderWeekFlags(start);
    $('weekTotal').textContent=total.toFixed(2);$('weekEarned').textContent='$'+(total*rate).toFixed(2);
    const now=new Date(),curStart=ws(now),idx=Math.floor((ds(now)-ds(curStart))/86400000),today=curStart.getTime()===start.getTime()?Number(a[idx]||0):0;
    $('hoursToday').textContent=today.toFixed(2);$('earnedToday').textContent='$'+(today*rate).toFixed(2);$('hoursWeek').textContent=total.toFixed(2);$('earnedWeek').textContent='$'+(total*rate).toFixed(2);
    renderEmployeeMap();
  }
  function flagList(list,empty){
    if(!list.length)return `<p class="muted small">${esc(empty)}</p>`;
    return `<ul class="flagList">${list.map(s=>{
      const bits=[],denied=Number(s.rejected_count||0);
      if(denied)bits.push(`${denied} denied clock-out attempt${denied>1?'s':''}`);
      if(s.clock_out_note)bits.push(`Reason: ${s.clock_out_note}`);
      const label=statusLabel(s.manager_review_status);
      if(label&&label!=='—')bits.push(label);
      return `<li><b>${esc(fmtDay(new Date(s.clock_in)))}</b><span>${esc(bits.join(' · ')||'No manager notes for this day.')}</span>${s.manager_review_note?`<span class="small">Manager note: ${esc(s.manager_review_note)}</span>`:''}</li>`;
    }).join('')}</ul>`;
  }
  function renderWeekFlags(weekStart){
    const wrap=$('weekFlags'),details=$('weekFlagDetails');
    if(!wrap||!details||!empCache)return;
    const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+7);
    const week=(empCache.shifts||[]).filter(s=>{const t=new Date(s.clock_in);return t>=weekStart&&t<weekEnd;});
    const deniedShifts=week.filter(s=>Number(s.rejected_count||0)>0);
    const denied=deniedShifts.reduce((a,s)=>a+Number(s.rejected_count||0),0);
    const full=week.filter(s=>s.manager_review_status==='approved_full');
    const actualApproved=week.filter(s=>s.manager_review_status==='approved_actual');
    const pending=week.filter(s=>s.manager_review_status==='pending');
    const plural=n=>n===1?'day':'days';
    wrap.innerHTML=[
      `<button class="flagTile${denied?' warn':''}" data-flag="denied" type="button"><span>CLOCK-OUT DENIED</span><strong>${denied}</strong><small>${denied===1?'time':'times'} this week</small></button>`,
      `<button class="flagTile${full.length?' good':''}" data-flag="full" type="button"><span>FULL DAY PAY APPROVED</span><strong>${full.length}</strong><small>${plural(full.length)}</small></button>`,
      `<button class="flagTile${actualApproved.length?' good':''}" data-flag="actual" type="button"><span>ACTUAL HOURS APPROVED</span><strong>${actualApproved.length}</strong><small>${plural(actualApproved.length)}</small></button>`,
      `<button class="flagTile${pending.length?' info':''}" data-flag="pending" type="button"><span>AWAITING MANAGER</span><strong>${pending.length}</strong><small>${plural(pending.length)}</small></button>`
    ].join('');
    const sets={
      denied:[deniedShifts,'No clock-out attempts were denied this week.'],
      full:[full,'No days were approved for full day pay this week.'],
      actual:[actualApproved,'No days were approved at actual hours this week.'],
      pending:[pending,'Nothing is waiting on your manager this week.']
    };
    let openFlag=null;
    wrap.querySelectorAll('[data-flag]').forEach(b=>b.onclick=()=>{
      const key=b.dataset.flag;
      if(openFlag===key){openFlag=null;details.classList.add('hide');wrap.querySelectorAll('[data-flag]').forEach(x=>x.classList.remove('open'));return;}
      openFlag=key;
      wrap.querySelectorAll('[data-flag]').forEach(x=>x.classList.toggle('open',x===b));
      const [list,empty]=sets[key];
      details.innerHTML=`<div class="flagHead">${esc(b.querySelector('span').textContent)}</div>${flagList(list,empty)}`;
      details.classList.remove('hide');
    });
    details.classList.add('hide');
  }
  async function loadEmployee(){
    if(managerMode||!employeeIdentity)return;
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),bounds=dayBounds(start,7),end=new Date(bounds[bounds.length-1]);
    try{empCache=await api(`/api/employee?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`);employeeIdentity=empCache.employee;projectMinimum=Number(empCache.settings?.project_completed_min_paid_hours??8);renderEmployee();}
    catch(e){if(e.status===401)showEmployeeLogin();else stat(displayMessage(e.payload||e.message),'bad');}
  }
  function tick(){if(managerMode)return;const d=new Date();$('clock').textContent=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('dateText').textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'});if(empCache?.openShift)renderEmployee();}

  function setEmpWeek(d,render=true){
    const start=ws(d);
    $('weekDate').value=iso(start);
    $('empWeekLabel').textContent=weekLabel(start);
    if(render)loadEmployee();
  }
  async function initEmployee(){
    try{const s=await api('/api/employee-auth');if(s.authenticated)showEmployeeApp(s.employee);else showEmployeeLogin();}catch{showEmployeeLogin();}
    $('employeeLoginBtn').onclick=async()=>{const name=$('employeeLoginName').value.trim(),pin=$('employeePin').value.trim();try{$('employeeLoginError').textContent='';const j=await api('/api/employee-auth',{method:'POST',body:JSON.stringify({name,pin})});$('employeePin').value='';showEmployeeApp(j.employee);}catch(e){$('employeeLoginError').textContent=displayMessage(e.payload||e.message);}};
    $('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')$('employeeLoginBtn').click();});
    $('forgotEmployeeBtn').onclick=()=>{$('employeeRecovery').classList.toggle('hide');$('employeeRecoveryMsg').textContent='Enter your approved name and we will notify the manager. Your PIN is never emailed.';};
    $('requestPinResetBtn').onclick=async()=>{const name=$('recoveryEmployeeName').value.trim();if(!name)return $('employeeRecoveryMsg').textContent='Enter your approved employee name.';try{const j=await api('/api/employee-pin-reset',{method:'POST',body:JSON.stringify({name})});$('employeeRecoveryMsg').textContent=j.message;}catch(e){$('employeeRecoveryMsg').textContent=displayMessage(e.payload||e.message);}};
    $('employeeLogoutBtn').onclick=async()=>{try{await api('/api/employee-auth',{method:'DELETE'});}catch{}showEmployeeLogin();};
    setEmpWeek(new Date(),false);
    createWeekPicker({btn:'empWeekBtn',input:'weekDate',cal:'empWeekCal',grid:'empCalGrid',month:'empCalMonth',prev:'empCalPrevMonth',next:'empCalNextMonth',today:'empCalToday',set:d=>setEmpWeek(d)});
    $('prev').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()-7);setEmpWeek(d);};
    $('next').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()+7);setEmpWeek(d);};
    $('in').onclick=async()=>{try{stat('Checking GPS…');const c=await geo();const j=await api('/api/clock-in',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude})});stat(j.ruleAlert||'Clock In accepted. Your location was saved.','ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(displayMessage(e.payload||e.message),'bad');}};
    $('out').onclick=async()=>{try{const open=empCache?.openShift;if(!open)return stat('You are not currently clocked in.','bad');const elapsedHours=hours(open);const reason=$('earlyNote').value;if(elapsedHours<8 && !reason){stat('Please select a reason for clocking out before 8 hours.','bad');$('earlyNote').focus();return;}stat('Checking GPS and location limit…');const c=await geo();const j=await api('/api/clock-out',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude,note:reason,message:$('clockOutMessage').value.trim()})});$('clockOutMessage').value='';stat(j.managerReview?'Clock Out accepted. The manager must review this exception.':`Clock Out accepted. Distance from Clock In: ${Number(j.distance).toFixed(2)} miles.`,'ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(displayMessage(e.payload||e.message),'bad');}};
    tick();setInterval(tick,1000);
  }

  let managerPeople=[];
  async function loadPeople(){const j=await api('/api/employees');managerPeople=j.employees||[];renderPeople();}
  function renderPeople(){
    if(!managerMode)return;
    const rank=p=>({active:0,vacation:1,terminated:2}[p.employment_status||(p.active?'active':'terminated')]??0);
    const listed=managerPeople.slice().sort((a,b)=>rank(a)-rank(b)||String(a.name).localeCompare(String(b.name)));
    $('approvedList').innerHTML=listed.map(p=>{
      const st=p.employment_status||(p.active?'active':'terminated');
      return `<div class="pill status-${st}"><div class="personMeta"><b>${esc(p.name)}</b> <span class="statusBadge ${st}">${esc(statusText(st))}</span><span>${esc(p.title||'No title')} · $${Number(p.hourly_wage).toFixed(2)}/hr · ${p.email?esc(p.email)+' · ':''}${p.has_pin?'PIN set':'PIN needed'}</span></div><input class="inlineTitle" data-title-id="${p.id}" value="${esc(p.title||'')}" maxlength="80" placeholder="Title"><select class="statusSelect" data-status-id="${p.id}"><option value="active"${st==='active'?' selected':''}>Active</option><option value="vacation"${st==='vacation'?' selected':''}>On vacation</option><option value="terminated"${st==='terminated'?' selected':''}>Terminated</option></select><button data-save-person="${p.id}">Save</button><button data-pin="${p.id}">${p.has_pin?'Reset PIN':'Set PIN'}</button></div>`;
    }).join('')||'<span class="small">No employees yet.</span>';
    document.querySelectorAll('[data-status-id]').forEach(sel=>sel.onchange=async()=>{
      const id=sel.dataset.statusId,status=sel.value;
      const who=(managerPeople.find(p=>String(p.id)===String(id))||{}).name||'this employee';
      if(status==='terminated'&&!confirm(`Mark ${who} as terminated?\n\nThey will no longer be able to sign in, but all of their shifts, hours and earnings stay on record and remain searchable in Employee Report.`)){
        sel.value=(managerPeople.find(p=>String(p.id)===String(id))||{}).employment_status||'active';return;
      }
      try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),status})});await loadPeople();await mgrRender();}
      catch(e){alert(e.message);await loadPeople();}
    });
    document.querySelectorAll('[data-save-person]').forEach(b=>b.onclick=async()=>{const p=managerPeople.find(x=>String(x.id)===String(b.dataset.savePerson)),title=document.querySelector(`[data-title-id="${b.dataset.savePerson}"]`)?.value||'';if(!p)return;try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:p.id,title,wage:Number(p.hourly_wage),email:p.email||''})});await loadPeople();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}});
    document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const pin=prompt('Enter a new 4-digit PIN:');if(pin===null)return;if(!/^\d{4}$/.test(pin))return alert('PIN must be exactly 4 digits.');try{await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:b.dataset.pin,pin})});$('employeeMsg').textContent='PIN updated. The employee must sign in again.';await loadPeople();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}});
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Deactivate this employee? Existing time records will remain available.'))return;try{await api(`/api/employees?id=${encodeURIComponent(b.dataset.remove)}`,{method:'DELETE'});await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}});
  }
  const loc=(a,b,label='View')=>a==null?'—':`<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${encodeURIComponent(a+','+b)}">${label}</a>`;
  const statusLabel=s=>({pending:'Pending manager review',approved_full:'Approved full hours',approved_actual:'Approved actual hours',approved_custom:'Approved custom hours',not_required:'—'}[s]||'—');
  const safeMapPair=(x)=>{if(x.clock_in_lat==null)return '—';const inUrl=`https://www.google.com/maps?q=${encodeURIComponent(`${x.clock_in_lat},${x.clock_in_lng}`)}`;if(x.clock_out_lat==null)return `<a target="_blank" rel="noopener noreferrer" href="${inUrl}">In</a>`;const outUrl=`https://www.google.com/maps?q=${encodeURIComponent(`${x.clock_out_lat},${x.clock_out_lng}`)}`;return `<a target="_blank" rel="noopener noreferrer" href="${inUrl}">In</a> / <a target="_blank" rel="noopener noreferrer" href="${outUrl}">Out</a>`;};
  async function loadSettings(){try{const j=await api('/api/settings');const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles??3;$('projectMinSetting').value=s.project_completed_min_paid_hours??8;$('maxEmployeesSetting').value=s.max_active_employees??100;$('retentionSetting').value=s.data_retention_months??6;}catch(e){$('settingsMsg').textContent=e.message;}}
  function localInput(d){const t=new Date(d);if(!Number.isFinite(t.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;}
  function closeCustomReview(){const m=$('customReview');if(m)m.classList.add('hide');}
  function openCustomReview(id,info){
    const m=$('customReview');if(!m)return;
    const ci=new Date(info.in),co=info.out?new Date(info.out):null;
    const actual=Number(info.actual||0),spans=co?iso(ci)!==iso(co):false;
    // A shift left running over a weekend is the case this exists for: default the
    // paid hours to a normal day and pull the clock-out back to match, so the hours
    // land on the day actually worked instead of being spread across every day.
    const standardDay=Number(info.min)>0?Number(info.min):8;
    const suggested=info.paid?Number(info.paid):(spans?standardDay:actual);
    const suggestedOut=new Date(ci.getTime()+suggested*3600000);
    $('customReviewWho').textContent=`${info.name} — ${info.when}`;
    $('customReviewActual').textContent=`${actual.toFixed(2)} h`;
    $('customReviewTimes').textContent=info.times||'—';
    $('customReviewSpan').classList.toggle('hide',!spans);
    $('customHours').value=suggested.toFixed(2);
    $('customClockOut').value=localInput(spans?suggestedOut:(co||suggestedOut));
    $('customClockOut').max=localInput(new Date(Date.now()+5*60000));
    $('customClockOut').min=localInput(new Date(ci.getTime()+60000));
    $('customNote').value='';
    $('customReviewMsg').textContent='';
    m.dataset.shiftId=id;
    m.dataset.originalOut=co?localInput(co):'';
    m.classList.remove('hide');
    $('customHours').focus();
  }
  async function saveCustomReview(){
    const m=$('customReview'),id=m.dataset.shiftId;
    const hours=Number($('customHours').value);
    if(!Number.isFinite(hours)||hours<0||hours>24){$('customReviewMsg').textContent='Paid hours must be between 0 and 24.';return;}
    const raw=$('customClockOut').value;
    let clockOut=null;
    if(raw&&raw!==m.dataset.originalOut){
      const d=new Date(raw);
      if(!Number.isFinite(d.getTime())){$('customReviewMsg').textContent='Enter a valid corrected clock-out.';return;}
      clockOut=d.toISOString();
    }
    $('customReviewMsg').textContent='Saving…';
    try{
      await api('/api/manager-shift',{method:'PATCH',body:JSON.stringify({shiftId:id,decision:'approve_custom',paidHours:hours,clockOut,note:$('customNote').value.trim()})});
      closeCustomReview();
      await mgrRender();
    }catch(e){$('customReviewMsg').textContent=e.message;}
  }
  async function reviewShift(id,decision,info){
    if(info&&info.name){
      const willPay=decision==='approve_full'?info.full:info.actual;
      const summary=[`Employee: ${info.name}`,`Day: ${info.when}`,`Clock in / out: ${info.times}`,`Actual hours worked: ${info.actual} h`,'',decision==='approve_full'?`Approve FULL DAY pay — ${willPay} h will be paid.`:`Approve ACTUAL hours — ${willPay} h will be paid.`,'','Continue?'].join('\n');
      if(!confirm(summary))return;
    }
    const note=prompt('Manager note (optional):');if(note===null)return;
    try{await api('/api/manager-shift',{method:'PATCH',body:JSON.stringify({shiftId:id,decision,note})});await mgrRender();}catch(e){alert(e.message);}
  }
  function localDateTimeValue(d=new Date()){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16);}
  function populateForceShifts(shifts){
    const select=$('forceShift');if(!select)return;
    const open=(shifts||[]).filter(x=>!x.clock_out);
    select.innerHTML=open.map(x=>`<option value="${x.id}">${esc(x.name)} — ${new Date(x.clock_in).toLocaleString()}</option>`).join('')||'<option value="">No open shifts</option>';
    if(open.length)$('forceClockOutAt').value=localDateTimeValue(new Date());
  }
  async function forceClockOut(){
    const shiftId=$('forceShift').value,clockOutAt=$('forceClockOutAt').value,payMode=$('forcePayMode').value,paidHours=Number($('forcePaidHours').value||0),message=$('forceMessage').value.trim();
    if(!shiftId)return $('forceMsg').textContent='Select an open employee shift.';
    if(!clockOutAt)return $('forceMsg').textContent='Select the manager clock-out date and time.';
    if(payMode==='custom'&&(!Number.isFinite(paidHours)||paidHours<0||paidHours>24))return $('forceMsg').textContent='Custom paid hours must be between 0 and 24.';
    try{const j=await api('/api/manager-shift',{method:'POST',body:JSON.stringify({action:'force_clock_out',shiftId,clockOutAt:new Date(clockOutAt).toISOString(),payMode,paidHours,message})});$('forceMsg').textContent=`Clocked out. Actual: ${Number(j.actualHours).toFixed(2)}h; paid: ${Number(j.paidHours).toFixed(2)}h.`;$('forceMessage').value='';await mgrRender();}catch(e){$('forceMsg').textContent=e.message;}
  }
  function createWeekPicker(o){
    let calMonth=null;
    const close=()=>{const c=$(o.cal);if(!c)return;c.classList.add('hide');$(o.btn).setAttribute('aria-expanded','false');};
    const build=()=>{
      const grid=$(o.grid);if(!grid)return;
      const sel=ws($(o.input).value?new Date($(o.input).value+'T12:00:00'):new Date());
      const base=calMonth||new Date(sel.getFullYear(),sel.getMonth(),1);
      calMonth=new Date(base.getFullYear(),base.getMonth(),1);
      $(o.month).textContent=calMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});
      const first=ws(new Date(calMonth)),selKey=iso(sel),today=iso(new Date());
      let html='';
      for(let i=0;i<42;i++){
        const d=new Date(first);d.setDate(first.getDate()+i);
        const wk=iso(ws(d)),cls=['weekCalDay'];
        if(d.getMonth()!==calMonth.getMonth())cls.push('out');
        if(wk===selKey)cls.push('inWeek');
        if(iso(d)===today)cls.push('today');
        html+=`<button type="button" class="${cls.join(' ')}" data-week="${wk}" data-day="${iso(d)}">${d.getDate()}</button>`;
      }
      grid.innerHTML=html;
      grid.querySelectorAll('[data-week]').forEach(b=>{
        b.onclick=e=>{e.stopPropagation();o.set(new Date(b.dataset.week+'T12:00:00'));close();};
        b.onmouseenter=()=>grid.querySelectorAll(`[data-week="${b.dataset.week}"]`).forEach(x=>x.classList.add('hoverWeek'));
        b.onmouseleave=()=>grid.querySelectorAll('.hoverWeek').forEach(x=>x.classList.remove('hoverWeek'));
      });
    };
    const open=()=>{calMonth=null;build();$(o.cal).classList.remove('hide');$(o.btn).setAttribute('aria-expanded','true');};
    $(o.btn).onclick=e=>{e.stopPropagation();$(o.cal).classList.contains('hide')?open():close();};
    $(o.prev).onclick=e=>{e.stopPropagation();calMonth.setMonth(calMonth.getMonth()-1);build();};
    $(o.next).onclick=e=>{e.stopPropagation();calMonth.setMonth(calMonth.getMonth()+1);build();};
    if(o.today)$(o.today).onclick=e=>{e.stopPropagation();o.set(new Date());close();};
    $(o.cal).onclick=e=>e.stopPropagation();
    document.addEventListener('click',close);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    return {close};
  }
  function weekLabel(start){
    const end=new Date(start);end.setDate(end.getDate()+6);
    const md={month:'short',day:'numeric'};
    if(start.getFullYear()!==end.getFullYear())return `${start.toLocaleDateString(undefined,{...md,year:'numeric'})} – ${end.toLocaleDateString(undefined,{...md,year:'numeric'})}`;
    const right=start.getMonth()===end.getMonth()?end.getDate():end.toLocaleDateString(undefined,md);
    return `${start.toLocaleDateString(undefined,md)} – ${right}, ${end.getFullYear()}`;
  }
  let calMonth=null;
  function setWeek(d,render=true){const start=ws(d);$('weeklyWeekDate').value=iso(start);$('weeklyWeekLabel').textContent=weekLabel(start);if(render)mgrRender();}
  let shiftCalMonth=null;
  function setShiftDay(key,render=true){
    $('shiftDetailsDate').value=key||'';
    $('shiftDayLabel').textContent=key?new Date(key+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'All days this week';
    if(render)mgrRender();
  }
  function buildShiftCal(){
    const grid=$('shiftCalGrid');if(!grid)return;
    const sel=$('shiftDetailsDate').value;
    const anchor=sel?new Date(sel+'T12:00:00'):selectedWeekStart();
    const base=shiftCalMonth||new Date(anchor.getFullYear(),anchor.getMonth(),1);
    shiftCalMonth=new Date(base.getFullYear(),base.getMonth(),1);
    $('shiftCalMonth').textContent=shiftCalMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const first=ws(new Date(shiftCalMonth)),today=iso(new Date()),weekKey=iso(selectedWeekStart());
    let html='';
    for(let i=0;i<42;i++){
      const d=new Date(first);d.setDate(first.getDate()+i);
      const key=iso(d),cls=['weekCalDay'];
      if(d.getMonth()!==shiftCalMonth.getMonth())cls.push('out');
      if(key===sel)cls.push('inWeek');
      if(iso(ws(d))===weekKey)cls.push('thisWeek');
      if(key===today)cls.push('today');
      html+=`<button type="button" class="${cls.join(' ')}" data-day="${key}">${d.getDate()}</button>`;
    }
    grid.innerHTML=html;
    grid.querySelectorAll('[data-day]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      const key=b.dataset.day;
      // Picking a day outside the current week moves the week to match.
      if(iso(ws(new Date(key+'T12:00:00')))!==iso(selectedWeekStart())){setWeek(new Date(key+'T12:00:00'),false);}
      setShiftDay(key);closeShiftCal();
    });
  }
  function openShiftCal(){shiftCalMonth=null;buildShiftCal();$('shiftDayCal').classList.remove('hide');$('shiftDayBtn').setAttribute('aria-expanded','true');}
  function closeShiftCal(){const c=$('shiftDayCal');if(!c)return;c.classList.add('hide');$('shiftDayBtn').setAttribute('aria-expanded','false');}
  function initShiftCal(){
    $('shiftDayBtn').onclick=e=>{e.stopPropagation();$('shiftDayCal').classList.contains('hide')?openShiftCal():closeShiftCal();};
    $('shiftCalPrevMonth').onclick=e=>{e.stopPropagation();shiftCalMonth.setMonth(shiftCalMonth.getMonth()-1);buildShiftCal();};
    $('shiftCalNextMonth').onclick=e=>{e.stopPropagation();shiftCalMonth.setMonth(shiftCalMonth.getMonth()+1);buildShiftCal();};
    $('shiftCalAll').onclick=e=>{e.stopPropagation();setShiftDay('');closeShiftCal();};
    $('shiftDayCal').onclick=e=>e.stopPropagation();
    document.addEventListener('click',closeShiftCal);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeShiftCal();});
  }
  function initWeekCal(){
    createWeekPicker({btn:'weeklyWeekBtn',input:'weeklyWeekDate',cal:'weeklyWeekCal',grid:'weekCalGrid',month:'weekCalMonth',prev:'weekCalPrevMonth',next:'weekCalNextMonth',today:'weekCalToday',set:d=>setWeek(d)});
  }
  function selectedWeekStart(){const v=$('weeklyWeekDate')?.value;return ws(v?new Date(v+'T12:00:00'):new Date());}
  async function loadWeeklyPaidHours(payload){
    if(!managerMode)return;
    const start=selectedWeekStart(),bounds=dayBounds(start,7),end=new Date(bounds[bounds.length-1]);
    const j=payload||await api(`/api/manager?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`);
    const q=$('search').value.trim().toLowerCase();
    const weekly=(j.weekly||[]).filter(e=>{
      if(q&&!String(e.name).toLowerCase().includes(q))return false;
      // Terminated staff stay visible for weeks they worked, and drop out of the rest.
      if((e.employment_status||'active')==='terminated'&&Number(e.total||0)===0)return false;
      return true;
    });
    $('weeklyRangeText').textContent=`Week: ${start.toLocaleDateString()} – ${new Date(bounds[6]).toLocaleDateString()}`;
    $('weeklyRows').innerHTML=weekly.map(e=>`<tr><td class="stickyCol"><b>${esc(e.name)}</b></td><td class="totalCol"><b>${Number(e.total).toFixed(2)}</b></td><td class="totalCol"><b>$${Number(e.earnings).toFixed(2)}</b></td><td>${esc(e.title||'')}</td><td><input class="wage" type="number" min="0" max="100000" step="0.01" value="${Number(e.wage).toFixed(2)}" data-id="${e.employee_id}"></td>${e.days.map(v=>`<td>${Number(v).toFixed(2)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="12">No employees.</td></tr>';
    document.querySelectorAll('.wage').forEach(i=>i.onchange=async()=>{try{const person=managerPeople.find(p=>String(p.id)===String(i.dataset.id));await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:i.dataset.id,wage:Number(i.value),title:person?.title||'',email:person?.email||''})});await loadPeople();await loadWeeklyPaidHours();}catch(e){alert(e.message);}});
  }
  const statusText=s=>({active:'Active',vacation:'On vacation',terminated:'Terminated'}[s]||'Active');
  function paidFor(x,minimum){
    const actual=hours(x),min=Number(minimum??8);
    if(x.manager_custom_paid_hours!=null&&Number.isFinite(Number(x.manager_custom_paid_hours)))return Math.max(0,Number(x.manager_custom_paid_hours));
    if(x.manager_review_status==='approved_actual')return actual;
    if(x.manager_review_status==='approved_full')return Math.max(actual,min);
    if(reasonNeedsReview(x.clock_out_note))return Math.max(actual,min);
    if(x.clock_out_note==='Ending shift'&&actual>=7.75)return Math.max(actual,min);
    if(x.manager_force_paid_hours!=null&&Number.isFinite(Number(x.manager_force_paid_hours)))return Number(x.manager_force_paid_hours);
    return actual;
  }
  function fillReportEmployees(){
    const dl=$('reportEmployees');if(!dl)return;
    dl.innerHTML=(managerPeople||[]).map(e=>`<option value="${esc(e.name)}"></option>`).join('');
  }
  async function runReport(){
    const typed=$('reportSearch').value.trim().toLowerCase();
    if(!typed){$('reportMsg').textContent='Type an employee name first.';$('reportResult').classList.add('hide');return;}
    const matches=(managerPeople||[]).filter(e=>String(e.name).toLowerCase().includes(typed));
    if(!matches.length){$('reportMsg').textContent='No employee matches that name.';$('reportResult').classList.add('hide');return;}
    if(matches.length>1&&!matches.some(e=>String(e.name).toLowerCase()===typed)){
      $('reportMsg').textContent=`Several employees match: ${matches.map(e=>e.name).join(', ')}. Type the full name.`;
      $('reportResult').classList.add('hide');return;
    }
    const emp=matches.find(e=>String(e.name).toLowerCase()===typed)||matches[0];
    const months=Number($('reportPeriod').value||3);
    const end=new Date();end.setHours(23,59,59,999);
    const start=new Date();start.setMonth(start.getMonth()-months);start.setHours(0,0,0,0);
    $('reportMsg').textContent='Loading…';
    try{
      const j=await api(`/api/manager?view=report&employeeId=${emp.id}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      renderReport(j,emp,start,end,months);
    }catch(e){$('reportMsg').textContent=e.message;$('reportResult').classList.add('hide');}
  }
  function renderReport(j,emp,start,end,months){
    const minimum=Number(j.settings?.project_completed_min_paid_hours??8);
    const wage=Number(j.employee?.hourly_wage??emp.hourly_wage??0);
    const shifts=(j.shifts||[]).filter(x=>{const t=new Date(x.clock_in);return t>=start&&t<=end;});
    // Group by the local calendar day the shift started on.
    const days={};
    for(const x of shifts){
      const k=iso(new Date(x.clock_in));
      (days[k]=days[k]||[]).push(x);
    }
    const dayKeys=Object.keys(days).sort();
    let totalPaid=0,totalActual=0,denied=0,pending=0,fullDays=0,customDays=0,longest=0,longestDay='';
    const monthly={};
    for(const k of dayKeys){
      const list=days[k];
      const paid=list.reduce((a,x)=>a+paidFor(x,minimum),0);
      const actual=list.reduce((a,x)=>a+hours(x),0);
      totalPaid+=paid;totalActual+=actual;
      denied+=list.reduce((a,x)=>a+Number(x.rejected_count||0),0);
      pending+=list.filter(x=>x.manager_review_status==='pending').length;
      fullDays+=list.some(x=>x.manager_review_status==='approved_full')?1:0;
      customDays+=list.some(x=>x.manager_review_status==='approved_custom')?1:0;
      if(paid>longest){longest=paid;longestDay=k;}
      const mk=k.slice(0,7);
      const m=monthly[mk]=monthly[mk]||{days:0,paid:0,actual:0};
      m.days++;m.paid+=paid;m.actual+=actual;
    }
    const worked=dayKeys.length;
    const avg=worked?totalPaid/worked:0;
    const tile=(label,value,sub)=>`<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
    $('reportStats').innerHTML=[
      tile('DAYS WORKED',String(worked),`over ${months} month${months>1?'s':''}`),
      tile('PAID HOURS',totalPaid.toFixed(2),''),
      tile('ACTUAL HOURS',totalActual.toFixed(2),''),
      tile('EARNINGS','$'+(totalPaid*wage).toFixed(2),`at $${wage.toFixed(2)}/h`),
      tile('AVG PER DAY',avg.toFixed(2)+' h',''),
      tile('LONGEST DAY',longest?longest.toFixed(2)+' h':'—',longestDay?new Date(longestDay+'T12:00:00').toLocaleDateString():''),
      tile('DENIED CLOCK-OUTS',String(denied),''),
      tile('AWAITING REVIEW',String(pending),`${fullDays} full-day, ${customDays} custom`)
    ].join('');
    $('reportMonths').innerHTML=Object.keys(monthly).sort().reverse().map(mk=>{
      const m=monthly[mk],label=new Date(mk+'-01T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'});
      return `<tr><td><b>${esc(label)}</b></td><td>${m.days}</td><td>${m.paid.toFixed(2)}</td><td>${m.actual.toFixed(2)}</td><td>$${(m.paid*wage).toFixed(2)}</td></tr>`;
    }).join('')||'<tr><td colspan="5">No months with recorded work.</td></tr>';
    $('reportDays').innerHTML=dayKeys.slice().reverse().map(k=>{
      const list=days[k].slice().sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
      const paid=list.reduce((a,x)=>a+paidFor(x,minimum),0),actual=list.reduce((a,x)=>a+hours(x),0);
      const hm=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const last=list[list.length-1];
      const notes=[...new Set(list.map(x=>x.clock_out_note).filter(Boolean))].join(', ');
      const flags=[list.some(x=>x.manager_review_status==='pending')?'<span class="dgTag warn">review</span>':'',
                   list.reduce((a,x)=>a+Number(x.rejected_count||0),0)?'<span class="dgTag warn">denied</span>':''].join('');
      return `<tr><td><b>${esc(new Date(k+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}))}</b></td>
        <td>${list.length}</td><td>${hm(list[0].clock_in)}</td><td>${last.clock_out?hm(last.clock_out):'Open'}</td>
        <td>${actual.toFixed(2)}</td><td><b>${paid.toFixed(2)}</b></td><td>$${(paid*wage).toFixed(2)}</td>
        <td>${esc(notes||'—')} ${flags}</td></tr>`;
    }).join('')||'<tr><td colspan="8">No working days in this period.</td></tr>';
    $('reportResult').dataset.employeeId=String(emp.id);
    $('reportResult').classList.remove('hide');
    $('reportMsg').textContent=`${emp.name}${emp.title?' — '+emp.title:''}: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`
      +(j.truncated?' Showing the most recent records only; narrow the period for a complete view.':'');
  }
  async function mgrRender(){
    if(!managerMode)return;
    try{
      const start=selectedWeekStart(),bounds=dayBounds(start,7),end=new Date(bounds[bounds.length-1]),weekEnd=new Date(bounds[6]);
      $('mdate').value=iso(start);
      $('range').textContent=`Week: ${start.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}`;
      const dayFilter=$('shiftDetailsDate');
      if(dayFilter.value&&(dayFilter.value<iso(start)||dayFilter.value>iso(weekEnd)))dayFilter.value='';
      $('shiftDayLabel').textContent=dayFilter.value?new Date(dayFilter.value+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'All days this week';
      $('shiftDetailsRangeText').textContent=`Showing shifts for the week of ${start.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}.`;
      const j=await api(`/api/manager?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`),q=$('search').value.trim().toLowerCase(),shiftDate=dayFilter.value,shiftQ=$('shiftDetailsSearch').value.trim().toLowerCase(),rows=(j.shifts||[]).filter(x=>{const nameOk=!shiftQ||String(x.name).toLowerCase().includes(shiftQ);const dateOk=!shiftDate||iso(new Date(x.clock_in))===shiftDate;return nameOk&&dateOk;});
      managerPeople=j.employees||managerPeople;populateForceShifts(j.shifts||[]);fillReportEmployees();
      const focusForce=id=>{
        const sh=(j.shifts||[]).find(x=>String(x.id)===String(id));if(!sh)return;
        const body=$('forceBody');
        if(body&&body.classList.contains('hide')){body.classList.remove('hide');$('toggleForce').textContent='Minimize';$('toggleForce').setAttribute('aria-expanded','true');}
        $('forceShift').value=String(sh.id);
        $('forceClockOutAt').value=localDateTimeValue(new Date());
        window.scrollTo({top:$('forceShift').getBoundingClientRect().top+window.scrollY-100,behavior:'smooth'});
      };
      const minimum=Number(j.settings?.project_completed_min_paid_hours??8);
      const workedThisWeek=new Set((j.shifts||[]).map(x=>String(x.employee_id)));
      const people=(j.employees||[]).filter(e=>{
        if(shiftQ&&!String(e.name).toLowerCase().includes(shiftQ))return false;
        if((e.employment_status||'active')==='terminated'&&!workedThisWeek.has(String(e.id)))return false;
        return true;
      });
      const dayKeys=bounds.slice(0,7).map(b=>iso(new Date(b)));
      dayKeys.forEach((k,i)=>{const th=$(['dgMon','dgTue','dgWed','dgThu','dgFri','dgSat','dgSun'][i]);
        if(th){const d=new Date(k+'T12:00:00');th.innerHTML=`${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}<span class="dgDate">${d.getMonth()+1}/${d.getDate()}</span>`;
          th.classList.toggle('dgPicked',shiftDate===k);}});
      // Bucket each shift onto the local day it started, so an employee with three
      // clock-ins on Tuesday shows one Tuesday cell instead of three separate rows.
      const byEmpDay={};
      for(const x of (j.shifts||[])){
        const k=iso(new Date(x.clock_in));
        if(!dayKeys.includes(k))continue;
        (byEmpDay[x.employee_id]=byEmpDay[x.employee_id]||{});
        (byEmpDay[x.employee_id][k]=byEmpDay[x.employee_id][k]||[]).push(x);
      }
      $('rows').innerHTML=people.map(emp=>{
        const perDay=byEmpDay[emp.id]||{};
        let weekPaid=0;
        const cells=dayKeys.map(k=>{
          const list=(perDay[k]||[]).slice().sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
          if(!list.length)return `<td class="dgCell empty${shiftDate===k?' dgPicked':''}"><span class="dgDash">–</span></td>`;
          const paid=list.reduce((a,x)=>a+paidFor(x,minimum),0);weekPaid+=paid;
          const open=list.some(x=>!x.clock_out),pend=list.some(x=>x.manager_review_status==='pending');
          const flags=[list.length>1?`<span class="dgTag">${list.length}×</span>`:'',pend?'<span class="dgTag warn">review</span>':'',open?'<span class="dgTag live">open</span>':''].join('');
          return `<td class="dgCell${shiftDate===k?' dgPicked':''}"><button class="dgBtn${pend?' pend':''}" data-emp="${emp.id}" data-day="${k}" type="button"><b>${paid.toFixed(2)}</b>${flags}</button></td>`;
        }).join('');
        const est=emp.employment_status||'active';
        const badge=est!=='active'?`<span class="statusBadge ${est}">${esc(statusText(est))}</span>`:'';
        return `<tr class="dgRow" data-emp="${emp.id}"><td class="stickyCol"><b>${esc(emp.name)}</b>${badge}<div class="small">${esc(emp.title||'')}</div></td>${cells}<td class="totalCol"><b>${weekPaid.toFixed(2)}</b></td></tr>`
             + `<tr class="dgDetailRow hide" data-detail="${emp.id}"><td colspan="9"><div class="dgDetail"></div></td></tr>`;
      }).join('')||'<tr><td colspan="9">No employees match.</td></tr>';

      function renderDayDetail(empId,dayKey){
        const emp=(j.employees||[]).find(e=>String(e.id)===String(empId));
        const list=((byEmpDay[empId]||{})[dayKey]||[]).slice().sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
        const head=`<div class="dgDetailHead"><b>${esc(emp?emp.name:'')}</b> — ${esc(fmtDay(new Date(dayKey+'T12:00:00')))}<button class="mini secondary dgClose" type="button">Close</button></div>`;
        if(!list.length)return head+'<p class="muted small">No clock-ins recorded for this day.</p>';
        const cards=list.map((x,idx)=>{
          const actual=hours(x),paid=paidFor(x,minimum),earned=paid*Number(x.hourly_wage||0);
          const ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;
          const hm=t=>t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          const fullPay=Math.max(actual,minimum);
          const sameDay=co?iso(ci)===iso(co):true;
          const stamp=t=>sameDay?hm(t):`${t.toLocaleDateString([],{month:'short',day:'numeric'})} ${hm(t)}`;
          const times=co?`${stamp(ci)} – ${stamp(co)}`:`${hm(ci)} – still open`;
          const meta=`data-name="${esc(x.name)}" data-actual="${actual.toFixed(2)}" data-full="${fullPay.toFixed(2)}" data-when="${esc(fmtDay(ci))}" data-times="${esc(times)}" data-in="${esc(x.clock_in)}" data-out="${esc(x.clock_out||'')}" data-paid="${x.manager_custom_paid_hours!=null?Number(x.manager_custom_paid_hours).toFixed(2):''}" data-min="${minimum}"`;
          const spansDays=co?iso(ci)!==iso(co):false;
          const corrected=x.manager_original_clock_out?`<div class="small muted">Clock-out corrected by manager (was ${esc(new Date(x.manager_original_clock_out).toLocaleString())})</div>`:'';
          const customNote=x.manager_custom_paid_hours!=null?`<div class="small"><b>${Number(x.manager_custom_paid_hours).toFixed(2)} h</b> custom paid</div>`:'';
          const btns=x.manager_review_status==='pending'
            ?`<div class="reviewBtns"><button class="mini primary" data-review-full="${x.id}" ${meta}>Approve full ${fullPay.toFixed(2)}h</button><button class="mini secondary" data-review-actual="${x.id}" ${meta}>Approve actual ${actual.toFixed(2)}h</button><button class="mini secondary" data-review-custom="${x.id}" ${meta}>Custom hours…</button></div>`
            :(x.clock_out?`<div class="reviewBtns"><button class="mini secondary" data-review-custom="${x.id}" ${meta}>Adjust hours</button></div>`:'');
          const action=x.clock_out?'':`<div class="reviewBtns"><button class="mini danger" data-force="${x.id}">Force clock out</button></div>`;
          return `<div class="dgShift"><div class="dgShiftTop"><span class="dgSeq">#${idx+1}</span><b>${esc(times)}</b>${x.manager_review_status==='pending'?'<span class="dgTag warn">needs review</span>':''}</div>
            <div class="dgFacts"><div><span>Actual</span><b>${actual.toFixed(2)} h</b></div><div><span>Paid</span><b>${paid.toFixed(2)} h</b></div><div><span>Earned</span><b>$${earned.toFixed(2)}</b></div><div><span>Status</span><b>${esc(statusLabel(x.manager_review_status))}</b></div></div>
            <div class="small"><b>${esc(x.clock_out_note||'—')}</b>${x.clock_out_message?` — ${esc(x.clock_out_message)}`:''}</div>
            ${customNote}${corrected}${spansDays?'<div class="spanWarn">Spans more than one day — check for a missed clock-out.</div>':''}
            <div class="small">${safeMapPair(x)}</div>${btns}${action}</div>`;
        }).join('');
        const totalPaid=list.reduce((a,x)=>a+paidFor(x,minimum),0);
        const totalActual=list.reduce((a,x)=>a+hours(x),0);
        return head+`<div class="dgDayTotals"><span>${list.length} clock-in${list.length>1?'s':''}</span><span>Actual <b>${totalActual.toFixed(2)} h</b></span><span>Paid <b>${totalPaid.toFixed(2)} h</b></span></div>`+cards;
      }
      function wireDetailButtons(){
        document.querySelectorAll('[data-review-full]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewFull,'approve_full',b.dataset));
        document.querySelectorAll('[data-review-actual]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewActual,'approve_actual',b.dataset));
        document.querySelectorAll('[data-review-custom]').forEach(b=>b.onclick=()=>openCustomReview(b.dataset.reviewCustom,b.dataset));
        document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>focusForce(b.dataset.force));
        document.querySelectorAll('.dgClose').forEach(b=>b.onclick=()=>{const r=b.closest('.dgDetailRow');r.classList.add('hide');document.querySelectorAll('.dgBtn.open').forEach(x=>x.classList.remove('open'));});
      }
      function openDay(empId,dayKey){
        const row=document.querySelector(`[data-detail="${empId}"]`);if(!row)return;
        const holder=row.querySelector('.dgDetail');
        const already=!row.classList.contains('hide')&&row.dataset.day===dayKey;
        document.querySelectorAll('.dgDetailRow').forEach(r=>r.classList.add('hide'));
        document.querySelectorAll('.dgBtn.open').forEach(x=>x.classList.remove('open'));
        if(already)return;
        holder.innerHTML=renderDayDetail(empId,dayKey);
        row.dataset.day=dayKey;row.classList.remove('hide');
        const btn=document.querySelector(`.dgBtn[data-emp="${empId}"][data-day="${dayKey}"]`);
        if(btn)btn.classList.add('open');
        wireDetailButtons();
      }
      document.querySelectorAll('.dgBtn').forEach(b=>b.onclick=()=>openDay(b.dataset.emp,b.dataset.day));
      // A day picked in the calendar opens that day for the first employee who worked it.
      if(shiftDate){
        const first=people.find(e=>((byEmpDay[e.id]||{})[shiftDate]||[]).length);
        if(first)openDay(String(first.id),shiftDate);
      }
      document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>focusForce(b.dataset.force));

      $('rejectedRows').innerHTML=(j.rejectedAttempts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q)).map(x=>{const t=new Date(x.created_at);return `<tr><td><b>${esc(x.name)}</b><div class="small">${esc(x.title||'')}</div></td><td>${fmtDay(t)}</td><td>${t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(x.reason)}</td><td>${esc(x.note||'—')}</td><td>${Number(x.distance_miles).toFixed(2)} mi</td><td>${loc(x.lat,x.lng,'View location')}</td></tr>`;}).join('')||'<tr><td colspan="7">No rejected clock-out attempts in this period.</td></tr>';
      $('empCount').textContent=managerPeople.length;$('mHours').textContent=Number(j.summary?.total_paid_hours||0).toFixed(2);$('payroll').textContent='$'+Number(j.summary?.total_payroll||0).toFixed(2);$('rejected').textContent=Number(j.summary?.rejected_clock_outs||0);$('liveClockIns').textContent=Number(j.summary?.live_clock_ins||0);$('pendingApprovals').textContent=Number(j.summary?.pending_approvals||0);
      await loadWeeklyPaidHours(j);
    }catch(e){$('employeeMsg').textContent='Connection error: '+e.message;}
  }
  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),title=$('newTitle').value.trim(),email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});['newName','newTitle','newEmail','newWage','newPin'].forEach(id=>$(id).value='');$('employeeMsg').textContent='Employee saved and PIN set.';await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}};
    $('saveSettings').onclick=async()=>{try{const j=await api('/api/settings',{method:'PATCH',body:JSON.stringify({clock_out_radius_miles:Number($('radiusSetting').value),project_completed_min_paid_hours:Number($('projectMinSetting').value),max_active_employees:Number($('maxEmployeesSetting').value),data_retention_months:Number($('retentionSetting').value)})});const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles;$('projectMinSetting').value=s.project_completed_min_paid_hours;$('maxEmployeesSetting').value=s.max_active_employees;$('retentionSetting').value=s.data_retention_months;$('settingsMsg').textContent='Settings saved.';}catch(e){$('settingsMsg').textContent=e.message;}};
    $('changeManagerPasswordBtn').onclick=async()=>{const currentPassword=$('currentManagerPassword').value,newPassword=$('newManagerPassword').value,confirmPassword=$('confirmManagerPassword').value;if(!currentPassword||!newPassword||!confirmPassword)return $('managerPasswordMsg').textContent='Complete all password fields.';if(newPassword!==confirmPassword)return $('managerPasswordMsg').textContent='New passwords do not match.';try{await api('/api/manager-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('managerPasswordMsg').textContent='Password changed. Please sign in again.';setTimeout(()=>location.reload(),700);}catch(e){$('managerPasswordMsg').textContent=e.message;}};
    $('logoutBtn').onclick=async()=>{try{await api('/api/manager-auth',{method:'DELETE'});}catch{}location.href='/?manager=1';};
    $('forcePayMode').onchange=()=> $('forceCustomWrap').classList.toggle('hide',$('forcePayMode').value!=='custom');
    $('forceClockOutBtn').onclick=forceClockOut;
    setWeek(new Date(),false);
    initWeekCal();
    initShiftCal();
    const collapse=(btn,body)=>{const b=$(body);if(!b||!$(btn))return;$(btn).onclick=()=>{const hidden=b.classList.toggle('hide');$(btn).textContent=hidden?'Show':'Minimize';$(btn).setAttribute('aria-expanded',String(!hidden));};};
    collapse('toggleForce','forceBody');
    collapse('toggleAddEmployee','addEmployeeBody');
    collapse('toggleSettings','settingsBody');
    collapse('toggleManagerPassword','managerPasswordBody');
    collapse('toggleReport','reportBody');
    collapse('toggleReportDays','reportDaysWrap');
    $('toggleReportDays').onclick=()=>{const b=$('reportDaysWrap');const hidden=b.classList.toggle('hide');$('toggleReportDays').textContent=hidden?'Show days':'Hide days';};
    $('runReport').onclick=runReport;
    $('reportPeriod').onchange=()=>{if($('reportResult').dataset.employeeId)runReport();};
    const shiftWeek=step=>{const d=new Date($('weeklyWeekDate').value+'T12:00:00');d.setDate(d.getDate()+step);setWeek(d);};
    $('weeklyPrev').onclick=()=>shiftWeek(-7);
    $('weeklyNext').onclick=()=>shiftWeek(7);
    $('toggleShiftDetails').onclick=()=>{const b=$('shiftDetailsBody');const hidden=b.classList.toggle('hide');$('toggleShiftDetails').textContent=hidden?'Show':'Minimize';};
    $('toggleRetention').onclick=()=>{const b=$('retentionBody');const hidden=b.classList.toggle('hide');$('toggleRetention').textContent=hidden?'Show':'Minimize';$('toggleRetention').setAttribute('aria-expanded',String(!hidden));};
    $('customCancel').onclick=closeCustomReview;
    $('customSave').onclick=saveCustomReview;
    $('customReview').onclick=e=>{if(e.target===$('customReview'))closeCustomReview();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCustomReview();});
    $('previewRetention').onclick=async()=>{
      $('retentionMsg').textContent='Checking…';
      try{const j=await api('/api/retention');const p=j.pending||{};
        const oldest=p.oldest_shift?new Date(p.oldest_shift).toLocaleDateString():'none on record';
        $('retentionMsg').textContent=`Keeping ${j.retentionMonths} months (back to ${new Date(j.cutoff).toLocaleDateString()}). Oldest shift on record: ${oldest}. A cleanup now would remove ${p.shifts} shift(s), ${p.audit_logs} audit record(s), ${p.auth_attempts} login attempt(s), and ${p.pin_reset_requests} PIN reset request(s). Nothing has been deleted.`;
      }catch(e){$('retentionMsg').textContent=e.message;}
    };
    $('runRetention').onclick=async()=>{
      let pending=null;
      try{const j=await api('/api/retention');pending=j.pending||{};
        if(!confirm(`Permanently delete data older than ${j.retentionMonths} months (before ${new Date(j.cutoff).toLocaleDateString()})?\n\nThis removes ${pending.shifts} shift(s) and their rejected-attempt history.\n\nThis cannot be undone.`))return;
      }catch(e){$('retentionMsg').textContent=e.message;return;}
      $('retentionMsg').textContent='Running cleanup…';
      try{const j=await api('/api/retention',{method:'POST',body:JSON.stringify({})});const d=j.deleted||{};
        $('retentionMsg').textContent=`Cleanup complete. Removed ${d.shifts} shift(s), ${d.audit_logs} audit record(s), ${d.auth_attempts} login attempt(s), ${d.pin_reset_requests} PIN reset request(s). Data before ${new Date(j.cutoff).toLocaleDateString()} is gone.`;
        await mgrRender();
      }catch(e){$('retentionMsg').textContent=e.message;}
    };
    $('toggleEmployees').onclick=()=>{const b=$('employeesBody');const hidden=b.classList.toggle('hide');$('toggleEmployees').textContent=hidden?'Show':'Minimize';$('toggleEmployees').setAttribute('aria-expanded',String(!hidden));};
    $('toggleRejected').onclick=()=>{const b=$('rejectedBody');const hidden=b.classList.toggle('hide');$('toggleRejected').textContent=hidden?'Show':'Minimize';};
    ['period','mdate','search','shiftDetailsDate','shiftDetailsSearch'].forEach(id=>$(id).addEventListener('input',mgrRender));$('clearShiftDetailsFilters').onclick=()=>{$('shiftDetailsDate').value='';$('shiftDetailsSearch').value='';mgrRender();};$('refresh').onclick=mgrRender;await loadPeople();await loadSettings();await mgrRender();setInterval(()=>{if(!$('managerApp').classList.contains('hide'))mgrRender();},30000);
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
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-toggle-password]');if(!btn)return;const input=$(btn.dataset.togglePassword);if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';btn.textContent=visible?'Show':'Hide';btn.setAttribute('aria-label',visible?'Show password':'Hide password');});
  if(managerMode)initManager();else initEmployee();
})();
