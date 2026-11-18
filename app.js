(() => {
  const $ = id => document.getElementById(id);
  const managerMode = new URLSearchParams(location.search).get('manager') === '1';
  $('employeeSection').classList.toggle('hide', managerMode);
  $('managerSection').classList.toggle('hide', !managerMode);
  // The manager portal has its own orange / black / white theme.
  if(managerMode)document.body.classList.add('mgr');

  const ds = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ws = d => { const x = ds(d), w = x.getDay(); x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w)); return x; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dur = ms => { let s=Math.floor(Math.max(0,ms)/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);s%=60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const hours = x => Math.max(0, (new Date(x.clock_out || Date.now()) - new Date(x.clock_in)) / 3600000);
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#92;'}[m] || m));
  /* ------------------------------------------------------------------
     Employee-portal language support (English / Spanish).
     The manager portal is always English, so `lang` is pinned to 'en'
     whenever managerMode is true. Shared helpers (fmtDay, weekLabel,
     statusLabel) therefore keep producing English for the manager.

     IMPORTANT: clock-out reasons are stored in the database and drive
     the payroll rules in api/_time.js, so only their DISPLAYED text is
     translated. Their option values stay English.
  ------------------------------------------------------------------ */
  const STR = {
    brandSub:['Employee Time Clock','Reloj de Asistencia'],
    langLabel:['Español','English'],
    langTitle:['Ver este portal en español','View this portal in English'],
    signInTitle:['Employee Sign In','Inicio de sesión del empleado'],
    signInHelp:['Use your approved name and private 4-digit PIN.','Use su nombre aprobado y su PIN privado de 4 dígitos.'],
    empName:['Employee Name','Nombre del empleado'],
    fullName:['Full name','Nombre completo'],
    pin4:['4-Digit PIN','PIN de 4 dígitos'],
    show:['Show','Mostrar'],
    hide:['Hide','Ocultar'],
    signIn:['Sign In','Iniciar sesión'],
    forgotPin:['Forgot your PIN?','¿Olvidó su PIN?'],
    emailReset:['Email Manager a Reset Request','Enviar solicitud al gerente'],
    signedInAs:['SIGNED IN AS','SESIÓN INICIADA COMO'],
    signOut:['Sign Out','Cerrar sesión'],
    clockIn:['Clock In','Registrar entrada'],
    clockOut:['Clock Out','Registrar salida'],
    reasonLabel:['Clock Out Reason','Motivo de salida'],
    reasonPick:['Select reason for leaving before 8 hours','Seleccione el motivo para salir antes de las 8 horas'],
    rEnding:['Ending shift','Fin del turno'],
    rPersonal:['Personal reason','Motivo personal'],
    rDoctor:['Doctor appointment','Cita médica'],
    rEmergency:['Emergency','Emergencia'],
    rProject:['Project completed','Proyecto terminado'],
    rClient:['Client request','Solicitud del cliente'],
    rManager:['Manager approval','Aprobación del gerente'],
    optMsg:['Optional message','Mensaje opcional'],
    optMsgPh:['Add a short explanation (optional)','Agregue una breve explicación (opcional)'],
    reviewNote:['Project completed, Client request, and Manager approval are sent for manager review. Personal reason is paid from actual working time.','Proyecto terminado, Solicitud del cliente y Aprobación del gerente se envían para revisión del gerente. El motivo personal se paga según el tiempo realmente trabajado.'],
    inTime:['CLOCK IN TIME','HORA DE ENTRADA'],
    runTime:['RUNNING TIME','TIEMPO TRANSCURRIDO'],
    currentlyIn:['Currently clocked in','Entrada registrada actualmente'],
    locations:['Clock In / Clock Out Locations','Ubicaciones de entrada y salida'],
    hoursToday:['PAID HOURS TODAY','HORAS PAGADAS HOY'],
    hoursWeek:['PAID HOURS THIS WEEK','HORAS PAGADAS ESTA SEMANA'],
    weeklySummary:['Weekly Summary','Resumen semanal'],
    currentWeek:['Current week','Semana actual'],
    selectWeek:['Select week','Seleccionar semana'],
    thisWeek:['This week','Esta semana'],
    weekTotal:['WEEK TOTAL','TOTAL DE LA SEMANA'],
    weekEarned:['WEEK EARNED','GANADO EN LA SEMANA'],
    footer:['Your time, earnings, and location records are private to your login.','Sus registros de tiempo, ganancias y ubicación son privados de su cuenta.'],
    fDenied:['CLOCK-OUT DENIED','SALIDAS RECHAZADAS'],
    fFull:['FULL DAY PAY APPROVED','DÍA COMPLETO APROBADO'],
    fActual:['ACTUAL HOURS APPROVED','HORAS REALES APROBADAS'],
    fPending:['AWAITING MANAGER','PENDIENTE DEL GERENTE'],
    timeOnce:['time this week','vez esta semana'],
    timeMany:['times this week','veces esta semana'],
    dayOne:['day','día'],
    dayMany:['days','días'],
    noDenied:['No clock-out attempts were denied this week.','No se rechazó ninguna salida esta semana.'],
    noFull:['No days were approved for full day pay this week.','Ningún día fue aprobado con pago de día completo esta semana.'],
    noActual:['No days were approved at actual hours this week.','Ningún día fue aprobado por horas reales esta semana.'],
    noPending:['Nothing is waiting on your manager this week.','No hay nada pendiente del gerente esta semana.'],
    attemptOne:['denied clock-out attempt','intento de salida rechazado'],
    attemptMany:['denied clock-out attempts','intentos de salida rechazados'],
    reasonPrefix:['Reason','Motivo'],
    mgrNote:['Manager note','Nota del gerente'],
    noNotes:['No manager notes for this day.','No hay notas del gerente para este día.'],
    stPending:['Pending manager review','Pendiente de revisión del gerente'],
    stFull:['Approved full hours','Horas completas aprobadas'],
    stActual:['Approved actual hours','Horas reales aprobadas'],
    stCustom:['Approved custom hours','Horas personalizadas aprobadas'],
    weekOf:['Week','Semana'],
    gpsChecking:['Checking GPS…','Verificando GPS…'],
    gpsLimit:['Checking GPS and location limit…','Verificando GPS y límite de ubicación…'],
    inOk:['Clock In accepted. Your location was saved.','Entrada aceptada. Su ubicación fue guardada.'],
    notClockedIn:['You are not currently clocked in.','Actualmente no tiene una entrada registrada.'],
    pickReason:['Please select a reason for clocking out before 8 hours.','Seleccione un motivo para salir antes de las 8 horas.'],
    outReview:['Clock Out accepted. The manager must review this exception.','Salida aceptada. El gerente debe revisar esta excepción.'],
    outOk:['Clock Out accepted. Distance from Clock In: {d} miles.','Salida aceptada. Distancia desde la entrada: {d} millas.'],
    recoveryHelp:['Enter your approved name and we will notify the manager. Your PIN is never emailed.','Escriba su nombre aprobado y notificaremos al gerente. Su PIN nunca se envía por correo.'],
    recoveryNeedName:['Enter your approved employee name.','Escriba su nombre de empleado aprobado.'],
    geoUnavailable:['GPS is unavailable on this device/browser.','El GPS no está disponible en este dispositivo o navegador.'],
    geoDenied:['Location permission denied. Please allow location access.','Permiso de ubicación denegado. Por favor, permita el acceso a su ubicación.'],
    geoFailed:['Could not get your location.','No se pudo obtener su ubicación.'],
    requestFailed:['Request failed','La solicitud falló'],
    tabTitle:['WorkClock — Employee Portal','WorkClock — Portal del Empleado'],
    erTitle:['My Report','Mi Reporte'],
    erHelp:['Pick a start and end date, or use a quick range, to see your working days, hours and earnings.','Elija una fecha de inicio y una de fin, o use un rango rápido, para ver sus días trabajados, horas y ganancias.'],
    erShow:['Show','Mostrar'],
    erHide:['Minimize','Minimizar'],
    er3:['Last 3 months','Últimos 3 meses'],
    er6:['Last 6 months','Últimos 6 meses'],
    er12:['Last 12 months','Últimos 12 meses'],
    erFrom:['From','Desde'],
    erTo:['To','Hasta'],
    erView:['View report','Ver reporte'],
    erMonths:['Month by month','Mes a mes'],
    erMonth:['Month','Mes'],
    erDaysWorked:['Days worked','Días trabajados'],
    erPaid:['Paid hours','Horas pagadas'],
    erActual:['Actual hours','Horas reales'],
    erEarnings:['Earnings','Ganancias'],
    erEveryDay:['Every working day','Cada día trabajado'],
    erShowDays:['Show days','Mostrar días'],
    erHideDays:['Hide days','Ocultar días'],
    erDay:['Day','Día'],
    erClockIns:['Clock-ins','Entradas'],
    erFirstIn:['First in','Primera entrada'],
    erLastOut:['Last out','Última salida'],
    erEarned:['Earned','Ganado'],
    erNotes:['Notes','Notas'],
    erPickBoth:['Choose both a start and an end date.','Elija una fecha de inicio y una de fin.'],
    erOrder:['The end date must be after the start date.','La fecha de fin debe ser posterior a la de inicio.'],
    erTooLong:['That range is too long. Choose 14 months or less.','Ese rango es demasiado largo. Elija 14 meses o menos.'],
    erLoading:['Loading…','Cargando…'],
    erNoDays:['No working days in this range.','No hay días trabajados en este rango.'],
    erNoMonths:['No months with recorded work.','No hay meses con trabajo registrado.'],
    erRangeShown:['Showing {a} to {b}.','Mostrando del {a} al {b}.'],
    erTDays:['DAYS WORKED','DÍAS TRABAJADOS'],
    erTPaid:['PAID HOURS','HORAS PAGADAS'],
    erTActual:['ACTUAL HOURS','HORAS REALES'],
    erTEarn:['EARNINGS','GANANCIAS'],
    erTAvg:['AVG PER DAY','PROMEDIO POR DÍA'],
    erTLongest:['LONGEST DAY','DÍA MÁS LARGO'],
    erAtRate:['at ${r}/h','a ${r}/h']
  };
  const DOWS = {en:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],es:['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']};
  const DAYNAMES = {en:['MON','TUE','WED','THU','FRI','SAT','SUN'],es:['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']};

  /* Server replies are English. Map the ones an employee can see, so a
     rejected clock-out or a locked PIN reads in their language too. */
  const SERVER_ES = {
    'A valid GPS location is required.':'Se requiere una ubicación GPS válida.',
    'Already clocked-in.':'Ya tiene una entrada registrada.',
    'Already clocked out.':'Ya registró su salida.',
    'You do not have an active Clock In.':'No tiene una entrada activa.',
    'Please select a valid Clock Out reason.':'Seleccione un motivo de salida válido.',
    'Please select a reason for clocking out before 8 hours.':'Seleccione un motivo para salir antes de las 8 horas.',
    'Enter your approved name and 4-digit PIN.':'Escriba su nombre aprobado y su PIN de 4 dígitos.',
    'Incorrect employee name or PIN.':'Nombre de empleado o PIN incorrecto.',
    'Too many login attempts from this connection. Try again later.':'Demasiados intentos de inicio de sesión desde esta conexión. Inténtelo más tarde.',
    'Too many incorrect PIN attempts. Try again in 10 minutes or contact your manager.':'Demasiados intentos de PIN incorrectos. Inténtelo en 10 minutos o comuníquese con su gerente.',
    'Too many incorrect PIN attempts. Login locked for 10 minutes.':'Demasiados intentos de PIN incorrectos. Acceso bloqueado por 10 minutos.',
    'Enter your approved employee name.':'Escriba su nombre de empleado aprobado.',
    'Too many PIN reset requests from this connection. Try again later.':'Demasiadas solicitudes de restablecimiento desde esta conexión. Inténtelo más tarde.',
    'If that employee is active, the manager has been notified. Please wait for your manager to reset your PIN.':'Si ese empleado está activo, se notificó al gerente. Espere a que su gerente restablezca su PIN.',
    'Employee login required.':'Debe iniciar sesión.',
    'Method not allowed':'Método no permitido',
    'Server error':'Error del servidor',
    'Request failed':'La solicitud falló',
    'Cross-site request blocked.':'Solicitud entre sitios bloqueada.',
    'Your clock-out was not recorded because you were outside the allowed location radius. Your manager has been notified.':'Su salida no se registró porque estaba fuera del radio de ubicación permitido. Se notificó a su gerente.',
    'Notice: a previous clock-out attempt did not follow the location rule. Your manager has been notified.':'Aviso: un intento de salida anterior no cumplió con la regla de ubicación. Se notificó a su gerente.'
  };
  function serverText(msg){
    const text=String(msg??'');
    if(lang!=='es'||!text)return text;
    if(SERVER_ES[text])return SERVER_ES[text];
    let o=text.match(/^CLOCK OUT OUTSIDE ALLOWED AREA — you are ([\d.]+) miles from Clock In \(allowed ([\d.]+) miles\)\. Your time has stopped and your manager will review this shift\.$/);
    if(o)return `SALIDA FUERA DEL ÁREA PERMITIDA — está a ${o[1]} millas del lugar de entrada (permitido ${o[2]} millas). Su tiempo se detuvo y su gerente revisará este turno.`;
    let m=text.match(/^CLOCK OUT REJECTED — you are ([\d.]+) miles from Clock In\. You must be within ([\d.]+) miles\.$/);
    if(m)return `SALIDA RECHAZADA — está a ${m[1]} millas del lugar de entrada. Debe estar dentro de ${m[2]} millas.`;
    m=text.match(/^Clock Out message must be (\d+) characters or fewer\.$/);
    if(m)return `El mensaje de salida debe tener ${m[1]} caracteres o menos.`;
    return text;
  }

  let lang = 'en';
  const t = (key,vars) => {
    const row=STR[key];
    let out=row?(lang==='es'?row[1]:row[0]):key;
    if(vars)for(const k in vars)out=out.split('{'+k+'}').join(vars[k]);
    return out;
  };
  const locale = () => lang==='es'?'es':[];
  const t2 = (k,v) => t(k,v);

  function applyLanguage(next){
    lang = next==='es' ? 'es' : 'en';
    try{localStorage.setItem('wc_lang',lang);}catch{}
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
    document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=t(el.dataset.i18nPh);});
    document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAria));});
    // Reason options: translate the label, never the stored value.
    document.querySelectorAll('#earlyNote option[data-i18n-opt]').forEach(el=>{el.textContent=t(el.dataset.i18nOpt);});
    document.querySelectorAll('#empWeekCal .weekCalDows span').forEach((el,i)=>{el.textContent=DOWS[lang][i];});
    const eye=document.querySelector('[data-toggle-password="employeePin"]');
    if(eye)eye.textContent=$('employeePin')?.type==='text'?t('hide'):t('show');
    const btn=$('langToggle');
    if(btn){btn.textContent=t('langLabel');btn.title=t('langTitle');btn.setAttribute('aria-label',t('langTitle'));}
    if(!managerMode)document.title=t('tabTitle');
    // Re-run the report so its dates, month names and reasons follow the language.
    if($('erResult')?.dataset.loaded)runEmployeeReport();
    if(employeeIdentity&&empCache)renderEmployee();
    else{
      const lbl=$('empWeekLabel');
      if(lbl&&$('weekDate')?.value)lbl.textContent=weekLabel(ws(new Date($('weekDate').value+'T12:00:00')));
    }
    tick();
  }
  function initLanguage(){
    let saved='en';
    try{saved=localStorage.getItem('wc_lang')||'en';}catch{}
    const btn=$('langToggle');
    if(btn)btn.onclick=()=>applyLanguage(lang==='es'?'en':'es');
    applyLanguage(saved);
  }

  const api = async (url, opt={}) => {
    const headers = {...(opt.headers||{})};
    if (opt.body !== undefined) headers['content-type']='application/json';
    const r = await fetch(url, {...opt,headers,cache:'no-store'});
    let j={}; try{j=await r.json();}catch{}
    if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;e.payload=j;throw e;} return j;
  };
  const geo = () => new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error(t('geoUnavailable')));
    navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),e=>reject(new Error(e.code===1?t('geoDenied'):t('geoFailed'))),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  const displayMessage = value => { if (value && typeof value === 'object') return serverText(String(value.message || value.error || value.ruleAlert || t('requestFailed'))); return serverText(String(value ?? '')); };
  const stat = (message,type='info') => { const el=$('status'); if(el)el.innerHTML=`<div class="status ${type}">${esc(displayMessage(message))}</div>`; };
  /* ---- UI helpers: in-app pop-up messages and count-up numbers ---- */
  const calmMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const toast = (message,type='ok') => {
    let box=document.getElementById('toastBox');
    if(!box){box=document.createElement('div');box.id='toastBox';box.setAttribute('aria-live','polite');document.body.appendChild(box);}
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=String(message||'');
    box.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('in'));
    setTimeout(()=>{el.classList.remove('in');el.classList.add('out');setTimeout(()=>el.remove(),350);},type==='bad'?5200:3200);
  };
  // Sets a number on screen; when the value changes it counts up/down to it.
  // Re-rendering with the same value does nothing, so the 1-second tick is safe.
  const animNum = (el,value,fmt=v=>v.toFixed(2)) => {
    if(!el)return;
    const target=Number(value)||0,prev=el.dataset.num===undefined?null:Number(el.dataset.num);
    if(prev===target&&el.textContent)return;
    el.dataset.num=String(target);
    if(el._anim)cancelAnimationFrame(el._anim);
    const from=prev===null?0:prev;
    if(calmMotion()||Math.abs(target-from)<0.005){el.textContent=fmt(target);return;}
    const t0=performance.now(),ms=650;
    const step=now=>{const p=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-p,3);el.textContent=fmt(from+(target-from)*e);if(p<1)el._anim=requestAnimationFrame(step);};
    el._anim=requestAnimationFrame(step);
  };
  const money = v => '$'+v.toFixed(2);
  const dayBounds = (start,count) => { const out=[]; for(let i=0;i<=count;i++){const d=new Date(start);d.setDate(d.getDate()+i);out.push(d.toISOString());} return out; };
  const qp = arr => encodeURIComponent(arr.join(','));
  const fmtDay = d => d.toLocaleDateString(locale(), {weekday:'long',month:'short',day:'numeric'});
  const reasonNeedsReview = r => ['Project completed','Client request','Manager approval'].includes(String(r||''));

  let empCache=null, employeeIdentity=null, projectMinimum=8, employeeMap=null, employeeMarkers=[];
  function showEmployeeLogin(){employeeIdentity=null;empCache=null;$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent='';}
  function showEmployeeApp(emp){employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name||'—';$('employeeTitleDisplay').textContent=emp.title||'';$('employeeRateDisplay').textContent=Number(emp.hourly_wage||0).toFixed(2)==='0.00'?'$0.00/hr':`$${Number(emp.hourly_wage||0).toFixed(2)}/hr`;setEmpWeek($('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),false);loadEmployee();}
  // Fills the ring on the live shift card toward a full 8-hour day.
  function updateShiftRing(h){
    const ring=$('shiftRingBar'),label=$('shiftRingPct');if(!ring)return;
    const goal=projectMinimum>0?projectMinimum:8,p=Math.max(0,Math.min(1,h/goal)),C=2*Math.PI*26;
    ring.style.strokeDasharray=`${C}`;ring.style.strokeDashoffset=`${C*(1-p)}`;
    ring.classList.toggle('done',p>=1);
    if(label)label.textContent=`${Math.floor(p*100)}%`;
  }
  function ensureEmployeeMap(){
    if(!employeeMap && !window.L){const m=$('employeeMap');if(m&&document.readyState==='complete')m.classList.add('mapFail');return;}
    if(employeeMap) return;
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
    if(open){const ci=new Date(open.clock_in),elapsedHours=Math.max(0,(Date.now()-ci.getTime())/3600000);$('clockedAt').textContent=ci.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('running').textContent=dur(Date.now()-ci.getTime());updateShiftRing(elapsedHours);const reasonEl=$('earlyNote');if(reasonEl){const placeholder=reasonEl.querySelector('option[value=""]');if(elapsedHours<8){reasonEl.required=true;if(placeholder){placeholder.hidden=false;placeholder.textContent=t('reasonPick');}if(reasonEl.dataset.autoSet==='1'){reasonEl.value='';reasonEl.dataset.autoSet='0';}}else{reasonEl.required=false;if(!reasonEl.value){reasonEl.value='Ending shift';reasonEl.dataset.autoSet='1';}if(placeholder)placeholder.hidden=true;}}}
    const selected=$('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),start=ws(selected),end=new Date(start);end.setDate(end.getDate()+6);
    $('weekTitle').textContent=`${t('weekOf')}: ${start.toLocaleDateString(locale(),{month:'short',day:'numeric'})} – ${end.toLocaleDateString(locale(),{month:'short',day:'numeric',year:'numeric'})}`;
    const a=(empCache.summary?.days||Array(7).fill(0)),rate=Number(p.hourly_wage||0),names=DAYNAMES[lang]||DAYNAMES.en;let total=0;
    // Compact one-line-per-day list: today highlighted, empty days faded,
    // and a small bar showing how close each day came to a full 8 hours.
    const todayKey=iso(new Date()),full=Math.max(8,...a.map(Number));
    const daysHtml=names.map((name,i)=>{const dt=new Date(start);dt.setDate(dt.getDate()+i);const v=Number(a[i]||0);total+=v;
      const cls=['day'];if(v<=0.0001)cls.push('zero');if(iso(dt)===todayKey)cls.push('today');
      const pct=Math.min(100,Math.round(v/full*100));
      return `<div class="${cls.join(' ')}"><div class="dLabel"><div class="dn">${name}</div><div class="dd">${dt.toLocaleDateString(locale(),{month:'short',day:'numeric'})}</div></div><div class="dBar"><i style="width:${pct}%"></i></div><div class="dVals"><div class="dh">${v>0.0001?v.toFixed(2):'–'}</div><div class="dm">${v>0.0001?'$'+(v*rate).toFixed(2):''}</div></div></div>`;}).join('');
    if($('days').dataset.html!==daysHtml){$('days').innerHTML=daysHtml;$('days').dataset.html=daysHtml;}
    renderWeekFlags(start);
    animNum($('weekTotal'),total);animNum($('weekEarned'),total*rate,money);
    const now=new Date(),curStart=ws(now),idx=Math.floor((ds(now)-ds(curStart))/86400000),today=curStart.getTime()===start.getTime()?Number(a[idx]||0):0;
    animNum($('hoursToday'),today);animNum($('earnedToday'),today*rate,money);animNum($('hoursWeek'),total);animNum($('earnedWeek'),total*rate,money);
    renderEmployeeMap();
  }
  function flagList(list,empty){
    if(!list.length)return `<p class="muted small">${esc(empty)}</p>`;
    return `<ul class="flagList">${list.map(s=>{
      const bits=[],denied=Number(s.rejected_count||0);
      if(denied)bits.push(`${denied} ${denied>1?t('attemptMany'):t('attemptOne')}`);
      if(s.clock_out_note)bits.push(`${t('reasonPrefix')}: ${reasonText(s.clock_out_note)}`);
      const label=statusLabel(s.manager_review_status);
      if(label&&label!=='—')bits.push(label);
      return `<li><b>${esc(fmtDay(new Date(s.clock_in)))}</b><span>${esc(bits.join(' · ')||t('noNotes'))}</span>${s.manager_review_note?`<span class="small">${t('mgrNote')}: ${esc(s.manager_review_note)}</span>`:''}</li>`;
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
    const plural=n=>n===1?t('dayOne'):t('dayMany');
    const flagsHtml=[
      `<button class="flagTile${denied?' warn':''}" data-flag="denied" type="button"><span>${t('fDenied')}</span><strong>${denied}</strong><small>${denied===1?t('timeOnce'):t('timeMany')}</small></button>`,
      `<button class="flagTile${full.length?' good':''}" data-flag="full" type="button"><span>${t('fFull')}</span><strong>${full.length}</strong><small>${plural(full.length)}</small></button>`,
      `<button class="flagTile${actualApproved.length?' good':''}" data-flag="actual" type="button"><span>${t('fActual')}</span><strong>${actualApproved.length}</strong><small>${plural(actualApproved.length)}</small></button>`,
      `<button class="flagTile${pending.length?' info':''}" data-flag="pending" type="button"><span>${t('fPending')}</span><strong>${pending.length}</strong><small>${plural(pending.length)}</small></button>`
    ].join('');
    // The clock ticks every second while clocked in; only rebuild when something
    // actually changed, so an opened flag list does not snap shut.
    const flagsKey=iso(weekStart)+'|'+lang+'|'+flagsHtml;
    if(wrap.dataset.key===flagsKey)return;
    wrap.dataset.key=flagsKey;wrap.innerHTML=flagsHtml;
    const sets={
      denied:[deniedShifts,t('noDenied')],
      full:[full,t('noFull')],
      actual:[actualApproved,t('noActual')],
      pending:[pending,t('noPending')]
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
  function tick(){if(managerMode)return;const d=new Date();$('clock').textContent=d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});$('dateText').textContent=d.toLocaleDateString(locale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'});if(empCache?.openShift)renderEmployee();}

  function setEmpWeek(d,render=true){
    const start=ws(d);
    $('weekDate').value=iso(start);
    $('empWeekLabel').textContent=weekLabel(start);
    if(render)loadEmployee();
  }
  function erSetRange(months){
    const end=new Date();
    const start=new Date();start.setMonth(start.getMonth()-months);
    $('erTo').value=iso(end);$('erFrom').value=iso(start);
  }
  async function runEmployeeReport(){
    const f=$('erFrom').value,t=$('erTo').value;
    if(!f||!t){$('erMsg').textContent=t2('erPickBoth');$('erResult').classList.add('hide');return;}
    const start=new Date(f+'T00:00:00'),end=new Date(t+'T23:59:59.999');
    if(!(end>start)){$('erMsg').textContent=t2('erOrder');$('erResult').classList.add('hide');return;}
    if((end-start)>430*86400000){$('erMsg').textContent=t2('erTooLong');$('erResult').classList.add('hide');return;}
    $('erMsg').textContent=t2('erLoading');
    try{
      const j=await api(`/api/employee?view=report&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      renderEmployeeReport(j,start,end);
    }catch(e){
      if(e.status===401)return showEmployeeLogin();
      $('erMsg').textContent=displayMessage(e.payload||e.message);$('erResult').classList.add('hide');
    }
  }
  function renderEmployeeReport(j,start,end){
    const minimum=Number(j.settings?.project_completed_min_paid_hours??8);
    const wage=Number(j.employee?.hourly_wage??0);
    const shifts=(j.shifts||[]).filter(x=>{const d=new Date(x.clock_in);return d>=start&&d<=end;});
    const days={};
    for(const x of shifts){const k=iso(new Date(x.clock_in));(days[k]=days[k]||[]).push(x);}
    const keys=Object.keys(days).sort();
    let totalPaid=0,totalActual=0,longest=0,longestDay='';
    const monthly={};
    for(const k of keys){
      const list=days[k];
      const paid=list.reduce((a,x)=>a+paidFor(x,minimum),0);
      const actual=list.reduce((a,x)=>a+hours(x),0);
      totalPaid+=paid;totalActual+=actual;
      if(paid>longest){longest=paid;longestDay=k;}
      const mk=k.slice(0,7),m=monthly[mk]=monthly[mk]||{days:0,paid:0,actual:0};
      m.days++;m.paid+=paid;m.actual+=actual;
    }
    const worked=keys.length,avg=worked?totalPaid/worked:0;
    const tile=(label,value,sub)=>`<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
    $('erStats').innerHTML=[
      tile(t2('erTDays'),String(worked),''),
      tile(t2('erTPaid'),totalPaid.toFixed(2),''),
      tile(t2('erTActual'),totalActual.toFixed(2),''),
      tile(t2('erTEarn'),'$'+(totalPaid*wage).toFixed(2),t2('erAtRate',{r:wage.toFixed(2)})),
      tile(t2('erTAvg'),avg.toFixed(2)+' h',''),
      tile(t2('erTLongest'),longest?longest.toFixed(2)+' h':'—',longestDay?new Date(longestDay+'T12:00:00').toLocaleDateString(locale()):'')
    ].join('');
    $('erMonthRows').innerHTML=Object.keys(monthly).sort().reverse().map(mk=>{
      const m=monthly[mk],label=new Date(mk+'-01T12:00:00').toLocaleDateString(locale(),{month:'long',year:'numeric'});
      return `<tr><td><b>${esc(label)}</b></td><td>${m.days}</td><td>${m.paid.toFixed(2)}</td><td>${m.actual.toFixed(2)}</td><td>$${(m.paid*wage).toFixed(2)}</td></tr>`;
    }).join('')||`<tr><td colspan="5">${esc(t2('erNoMonths'))}</td></tr>`;
    $('erDayRows').innerHTML=keys.slice().reverse().map(k=>{
      const list=days[k].slice().sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
      const paid=list.reduce((a,x)=>a+paidFor(x,minimum),0),actual=list.reduce((a,x)=>a+hours(x),0);
      const hm=v=>new Date(v).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
      const last=list[list.length-1];
      const notes=[...new Set(list.map(x=>reasonText(x.clock_out_note)).filter(Boolean))].join(', ');
      return `<tr><td><b>${esc(new Date(k+'T12:00:00').toLocaleDateString(locale(),{weekday:'short',month:'short',day:'numeric'}))}</b></td>
        <td>${list.length}</td><td>${hm(list[0].clock_in)}</td><td>${last.clock_out?hm(last.clock_out):'—'}</td>
        <td>${actual.toFixed(2)}</td><td><b>${paid.toFixed(2)}</b></td><td>$${(paid*wage).toFixed(2)}</td>
        <td>${esc(notes||'—')}</td></tr>`;
    }).join('')||`<tr><td colspan="8">${esc(t2('erNoDays'))}</td></tr>`;
    $('erResult').dataset.loaded='1';
    $('erResult').classList.remove('hide');
    $('erMsg').textContent=t2('erRangeShown',{a:start.toLocaleDateString(locale()),b:end.toLocaleDateString(locale())})
      +(j.truncated?' '+'Showing the most recent records only.':'');
  }
  function initEmployeeReport(){
    if(!$('erRun'))return;
    erSetRange(3);
    $('erToggle').onclick=()=>{
      const b=$('erBody'),hidden=b.classList.toggle('hide');
      $('erToggle').textContent=hidden?t2('erShow'):t2('erHide');
      $('erToggle').dataset.i18n=hidden?'erShow':'erHide';
      $('erToggle').setAttribute('aria-expanded',String(!hidden));
      if(!hidden&&!$('erResult').dataset.loaded)runEmployeeReport();
    };
    $('erToggleDays').onclick=()=>{
      const b=$('erDaysWrap'),hidden=b.classList.toggle('hide');
      $('erToggleDays').textContent=hidden?t2('erShowDays'):t2('erHideDays');
      $('erToggleDays').dataset.i18n=hidden?'erShowDays':'erHideDays';
    };
    document.querySelectorAll('[data-er-preset]').forEach(b=>b.onclick=()=>{
      erSetRange(Number(b.dataset.erPreset));
      document.querySelectorAll('[data-er-preset]').forEach(x=>x.classList.toggle('on',x===b));
      runEmployeeReport();
    });
    ['erFrom','erTo'].forEach(id=>$(id).onchange=()=>{
      document.querySelectorAll('[data-er-preset]').forEach(x=>x.classList.remove('on'));
      if($('erResult').dataset.loaded)runEmployeeReport();
    });
    $('erRun').onclick=runEmployeeReport;
  }
  async function initEmployee(){
    initLanguage();
    initEmployeeReport();
    try{const s=await api('/api/employee-auth');if(s.authenticated)showEmployeeApp(s.employee);else showEmployeeLogin();}catch{showEmployeeLogin();}
    $('employeeLoginBtn').onclick=async()=>{const name=$('employeeLoginName').value.trim(),pin=$('employeePin').value.trim();try{$('employeeLoginError').textContent='';const j=await api('/api/employee-auth',{method:'POST',body:JSON.stringify({name,pin})});$('employeePin').value='';showEmployeeApp(j.employee);}catch(e){$('employeeLoginError').textContent=displayMessage(e.payload||e.message);}};
    $('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')$('employeeLoginBtn').click();});
    $('forgotEmployeeBtn').onclick=()=>{$('employeeRecovery').classList.toggle('hide');$('employeeRecoveryMsg').textContent=t('recoveryHelp');};
    $('requestPinResetBtn').onclick=async()=>{const name=$('recoveryEmployeeName').value.trim();if(!name)return $('employeeRecoveryMsg').textContent=t('recoveryNeedName');try{const j=await api('/api/employee-pin-reset',{method:'POST',body:JSON.stringify({name})});$('employeeRecoveryMsg').textContent=j.message;}catch(e){$('employeeRecoveryMsg').textContent=displayMessage(e.payload||e.message);}};
    $('employeeLogoutBtn').onclick=async()=>{try{await api('/api/employee-auth',{method:'DELETE'});}catch{}showEmployeeLogin();};
    setEmpWeek(new Date(),false);
    createWeekPicker({btn:'empWeekBtn',input:'weekDate',cal:'empWeekCal',grid:'empCalGrid',month:'empCalMonth',prev:'empCalPrevMonth',next:'empCalNextMonth',today:'empCalToday',set:d=>setEmpWeek(d)});
    $('prev').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()-7);setEmpWeek(d);};
    $('next').onclick=()=>{const d=new Date($('weekDate').value+'T12:00:00');d.setDate(d.getDate()+7);setEmpWeek(d);};
    $('in').onclick=async()=>{try{stat(t('gpsChecking'));const c=await geo();const j=await api('/api/clock-in',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude})});stat(serverText(j.ruleAlert)||t('inOk'),'ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(displayMessage(e.payload||e.message),'bad');}};
    $('out').onclick=async()=>{try{const open=empCache?.openShift;if(!open)return stat(t('notClockedIn'),'bad');const elapsedHours=hours(open);const reason=$('earlyNote').value;if(elapsedHours<8 && !reason){stat(t('pickReason'),'bad');$('earlyNote').focus();return;}stat(t('gpsLimit'));const c=await geo();const j=await api('/api/clock-out',{method:'POST',body:JSON.stringify({lat:c.latitude,lng:c.longitude,note:reason,message:$('clockOutMessage').value.trim()})});$('clockOutMessage').value='';if(j.rejected)stat(serverText(j.message),'bad');else stat(j.managerReview?t('outReview'):t('outOk',{d:Number(j.distance).toFixed(2)}),'ok');await loadEmployee();}catch(e){if(e.status===401)showEmployeeLogin();else stat(displayMessage(e.payload||e.message),'bad');}};
    tick();setInterval(tick,1000);
  }

  let managerPeople=[];
  async function loadPeople(){const j=await api('/api/employees');managerPeople=j.employees||[];renderPeople();}
  // Employees: searchable list by status; one panel edits or adds a person.
  let empTab='active';
  const statusOfP=p=>p.employment_status||(p.active?'active':'terminated');
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  function renderPeople(){
    if(!managerMode||!$('empList'))return;
    const counts={active:0,vacation:0,terminated:0};managerPeople.forEach(p=>counts[statusOfP(p)]++);
    $('empCountActive').textContent=counts.active;$('empCountVacation').textContent=counts.vacation;$('empCountTerminated').textContent=counts.terminated;
    document.querySelectorAll('[data-emp-tab]').forEach(b=>b.classList.toggle('on',b.dataset.empTab===empTab));
    const q=($('empSearch').value||'').trim().toLowerCase();
    const list=managerPeople.filter(p=>statusOfP(p)===empTab).filter(p=>!q||[p.name,p.title,p.email].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const notes={active:'Working and able to clock in.',vacation:'Still employed — they can clock in if they come in.',terminated:'Cannot sign in. Every shift, hour and earning stays on record and in Reports.'};
    $('empList').innerHTML=`<p class="muted small empNote">${notes[empTab]}</p>`+(list.map(p=>{const st=statusOfP(p);return `<button class="empRow status-${st}" data-emp-open="${p.id}" type="button"><span class="avatar">${esc(initials(p.name))}</span><span class="empMain"><b>${esc(p.name)}</b><span>${esc(p.title||'No title')}${p.email?' · '+esc(p.email):''}</span></span><span class="empWage">$${Number(p.hourly_wage).toFixed(2)}<small>/h</small></span><span class="statusBadge ${st}">${esc(statusText(st))}</span><span class="pinState ${p.has_pin?'ok':'need'}">${p.has_pin?'PIN set':'PIN needed'}</span><svg aria-hidden="true" class="chev" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;}).join('')||`<div class="dashEmpty">${q?'No employees match your search.':'Nobody in this group.'}</div>`);
    document.querySelectorAll('[data-emp-open]').forEach(b=>b.onclick=()=>openEmpPanel(managerPeople.find(p=>String(p.id)===String(b.dataset.empOpen))));
  }
  function openEmpPanel(p){
    const isNew=!p;$('empPanel').dataset.id=p?p.id:'';
    $('empPanelTitle').textContent=isNew?'Add employee':'Edit employee';
    $('empPanelSub').textContent=isNew?'They sign in with their full name and this 4-digit PIN.':`Changes apply straight away. Changing the PIN signs ${p.name} out.`;
    $('epName').value=p?p.name:'';$('epName').disabled=!isNew;
    $('epTitle').value=p?.title||'';$('epEmail').value=p?.email||'';$('epWage').value=p?Number(p.hourly_wage).toFixed(2):'';
    $('epStatusWrap').classList.toggle('hide',isNew);$('epStatus').value=p?statusOfP(p):'active';
    $('epPin').value='';$('epPin').placeholder=isNew?'Required':'Blank = keep current PIN';$('epPinLabel').textContent=isNew?'4-digit PIN':'New 4-digit PIN';
    $('empPanelMsg').textContent='';$('empPanelSave').textContent=isNew?'Add employee':'Save changes';
    $('empPanel').classList.remove('hide');(isNew?$('epName'):$('epTitle')).focus();
  }
  function closeEmpPanel(){$('empPanel').classList.add('hide');}
  async function saveEmpPanel(){
    const id=$('empPanel').dataset.id,isNew=!id,msg=$('empPanelMsg');
    const name=$('epName').value.trim().replace(/\s+/g,' '),title=$('epTitle').value.trim(),email=$('epEmail').value.trim(),wage=Number($('epWage').value),pin=$('epPin').value.trim(),status=$('epStatus').value;
    if(isNew&&!name)return msg.textContent='Enter the employee’s full name.';
    if($('epWage').value===''||!Number.isFinite(wage)||wage<0)return msg.textContent='Enter a valid hourly wage.';
    if((isNew||pin)&&!/^\d{4}$/.test(pin))return msg.textContent='The PIN must be exactly 4 digits.';
    msg.textContent='Saving…';
    try{
      if(isNew){await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});toast(`${name} added.`);}
      else{
        const p=managerPeople.find(x=>String(x.id)===String(id));
        await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),wage,title,email})});
        if(p&&status!==statusOfP(p)){
          if(status==='terminated'&&!confirm(`Mark ${p.name} as terminated?\n\nThey will no longer be able to sign in, but all of their shifts, hours and earnings stay on record and remain searchable in Reports.`)){msg.textContent='Other changes saved; status not changed.';await loadPeople();return;}
          await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),status})});
        }
        if(pin)await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),pin})});
        toast(pin?'Saved. The new PIN is active; they must sign in again.':'Employee saved.');
      }
      closeEmpPanel();await loadPeople();await mgrRender();
    }catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  const loc=(a,b,label='View')=>a==null?'—':`<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${encodeURIComponent(a+','+b)}">${label}</a>`;
  const statusLabel=s=>({pending:t('stPending'),approved_full:t('stFull'),approved_actual:t('stActual'),approved_custom:t('stCustom'),not_required:'—'}[s]||'—');
  // Reasons are stored in English; show the employee their own language.
  const REASON_KEY={'Ending shift':'rEnding','Personal reason':'rPersonal','Doctor appointment':'rDoctor','Emergency':'rEmergency','Project completed':'rProject','Client request':'rClient','Manager approval':'rManager'};
  const reasonText=r=>REASON_KEY[String(r||'')]?t(REASON_KEY[String(r||'')]):String(r||'');
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
      toast('Paid hours saved.');
      await mgrRender();
    }catch(e){$('customReviewMsg').textContent=e.message;}
  }
  function closeClockInEdit(){const m=$('clockInEdit');if(m)m.classList.add('hide');}
  function clockInPreview(){
    const m=$('clockInEdit'),raw=$('clockInAt').value;
    if(!raw){$('clockInPreview').textContent='';return;}
    const d=new Date(raw);
    if(!Number.isFinite(d.getTime())){$('clockInPreview').textContent='';return;}
    const h=Math.max(0,(Date.now()-d.getTime())/3600000);
    const added=h-Number(m.dataset.currentHours||0);
    $('clockInPreview').textContent=`Running time becomes ${h.toFixed(2)} h`
      +(added>0.01?` — adds ${added.toFixed(2)} h to this shift.`:added<-0.01?` — removes ${Math.abs(added).toFixed(2)} h from this shift.`:'.');
  }
  function openClockInEdit(id,info){
    const m=$('clockInEdit');if(!m)return;
    const ci=new Date(info.in);
    const running=Math.max(0,(Date.now()-ci.getTime())/3600000);
    $('clockInWho').textContent=`${info.name} — clocked in ${fmtDay(ci)}`;
    $('clockInRecorded').textContent=ci.toLocaleString();
    $('clockInRunning').textContent=`${running.toFixed(2)} h`;
    $('clockInAt').value=localDateTimeValue(ci);
    $('clockInAt').max=localDateTimeValue(new Date());
    $('clockInAt').min=localDateTimeValue(new Date(Date.now()-7*86400000));
    $('clockInQuick').value='';
    $('clockInNote').value='';
    $('clockInMsg').textContent='';
    m.dataset.shiftId=id;
    m.dataset.originalIn=info.in;
    m.dataset.currentHours=String(running);
    clockInPreview();
    m.classList.remove('hide');
    $('clockInAt').focus();
  }
  async function saveClockInEdit(){
    const m=$('clockInEdit'),id=m.dataset.shiftId,raw=$('clockInAt').value;
    if(!raw){$('clockInMsg').textContent='Choose the actual start time.';return;}
    const d=new Date(raw);
    if(!Number.isFinite(d.getTime())){$('clockInMsg').textContent='Enter a valid date and time.';return;}
    if(d.getTime()>Date.now()+5*60000){$('clockInMsg').textContent='Clock-in time cannot be in the future.';return;}
    if(Date.now()-d.getTime()>7*86400000){$('clockInMsg').textContent='Clock-in time cannot be more than 7 days ago.';return;}
    $('clockInMsg').textContent='Saving…';
    try{
      await api('/api/manager-shift',{method:'POST',body:JSON.stringify({action:'set_clock_in',shiftId:id,clockInAt:d.toISOString(),message:$('clockInNote').value.trim()})});
      closeClockInEdit();
      toast('Clock-in time corrected.');
      await mgrRender();
    }catch(e){$('clockInMsg').textContent=displayMessage(e.payload||e.message);}
  }
  async function reviewShift(id,decision,info){
    if(info&&info.name){
      const willPay=decision==='approve_full'?info.full:info.actual;
      const summary=[`Employee: ${info.name}`,`Day: ${info.when}`,`Clock in / out: ${info.times}`,`Actual hours worked: ${info.actual} h`,'',decision==='approve_full'?`Approve FULL DAY pay — ${willPay} h will be paid.`:`Approve ACTUAL hours — ${willPay} h will be paid.`,'','Continue?'].join('\n');
      if(!confirm(summary))return;
    }
    const note=prompt('Manager note (optional):');if(note===null)return;
    try{await api('/api/manager-shift',{method:'PATCH',body:JSON.stringify({shiftId:id,decision,note})});toast(decision==='approve_full'?'Full day approved.':'Actual hours approved.');await mgrRender();}catch(e){toast(e.message,'bad');}
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
    try{const j=await api('/api/manager-shift',{method:'POST',body:JSON.stringify({action:'force_clock_out',shiftId,clockOutAt:new Date(clockOutAt).toISOString(),payMode,paidHours,message})});$('forceMsg').textContent=`Clocked out. Actual: ${Number(j.actualHours).toFixed(2)}h; paid: ${Number(j.paidHours).toFixed(2)}h.`;$('forceMessage').value='';toast('Employee clocked out.');await mgrRender();}catch(e){$('forceMsg').textContent=e.message;}
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
    const md={month:'short',day:'numeric'};const L=locale();
    if(start.getFullYear()!==end.getFullYear())return `${start.toLocaleDateString(L,{...md,year:'numeric'})} – ${end.toLocaleDateString(L,{...md,year:'numeric'})}`;
    const right=start.getMonth()===end.getMonth()?end.getDate():end.toLocaleDateString(L,md);
    return `${start.toLocaleDateString(L,md)} – ${right}, ${end.getFullYear()}`;
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
  // Payroll: totals bar, Mon–Sun table with a total row, cards on phones, CSV.
  let payWeekly=[],payBounds=[];
  async function loadWeeklyPaidHours(payload){
    if(!managerMode)return;
    const start=selectedWeekStart(),bounds=dayBounds(start,7),end=new Date(bounds[bounds.length-1]);
    const j=payload||mgrLastData||await api(`/api/manager?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`);
    // Terminated staff stay visible for weeks they worked, and drop out of the rest.
    const all=(j.weekly||[]).filter(e=>!((e.employment_status||'active')==='terminated'&&Number(e.total||0)===0));
    payWeekly=all;payBounds=bounds;
    const q=($('paySearch')?.value||'').trim().toLowerCase();
    const shown=all.filter(e=>!q||String(e.name).toLowerCase().includes(q)||String(e.title||'').toLowerCase().includes(q));
    $('weeklyRangeText').textContent=`Week of ${weekLabel(start)}`;
    const days=bounds.slice(0,7).map(b=>new Date(b)),names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const h2=v=>Number(v||0).toFixed(2),cell=v=>Number(v||0)>0.004?h2(v):'<span class="zero">–</span>';
    const totHours=all.reduce((a,e)=>a+Number(e.total||0),0),totPay=all.reduce((a,e)=>a+Number(e.earnings||0),0);
    const paidPeople=all.filter(e=>Number(e.total||0)>0.004).length;
    const kpi=(l,v,sub,cls='')=>`<div class="kpi ${cls}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
    $('payKpis').innerHTML=kpi('Paid hours',h2(totHours),'this week')+kpi('Payroll',money(totPay),'this week','dark')+kpi('People paid',String(paidPeople),`of ${all.length} listed`)+kpi('Average rate',totHours>0?money(totPay/totHours)+'/h':'—','paid hours × wage');
    $('payHeadRow').innerHTML=`<th class="stickyCol">Employee</th>${days.map((d,i)=>`<th class="num">${names[i]}<span class="dgDate">${d.getMonth()+1}/${d.getDate()}</span></th>`).join('')}<th class="num totalCol">Total h</th><th class="num totalCol">Earnings</th>`;
    const sub=e=>[e.title,`$${Number(e.wage||0).toFixed(2)}/h`].filter(Boolean).map(esc).join(' · ');
    const badge=e=>(e.employment_status&&e.employment_status!=='active')?` <span class="statusBadge ${e.employment_status}">${esc(statusText(e.employment_status))}</span>`:'';
    $('weeklyRows').innerHTML=shown.map(e=>`<tr><td class="stickyCol"><b>${esc(e.name)}</b>${badge(e)}<div class="small">${sub(e)}</div></td>${(e.days||[]).slice(0,7).map(v=>`<td class="num">${cell(v)}</td>`).join('')}<td class="num totalCol"><b>${h2(e.total)}</b></td><td class="num totalCol"><b>${money(Number(e.earnings||0))}</b></td></tr>`).join('')||'<tr><td colspan="10" class="muted">No employees match.</td></tr>';
    const colTot=i=>shown.reduce((a,e)=>a+Number((e.days||[])[i]||0),0);
    $('payFoot').innerHTML=shown.length?`<tr><td class="stickyCol"><b>${q?'Total (shown)':'Total'}</b></td>${[0,1,2,3,4,5,6].map(i=>`<td class="num"><b>${cell(colTot(i))}</b></td>`).join('')}<td class="num totalCol"><b>${h2(shown.reduce((a,e)=>a+Number(e.total||0),0))}</b></td><td class="num totalCol"><b>${money(shown.reduce((a,e)=>a+Number(e.earnings||0),0))}</b></td></tr>`:'';
    $('payCards').innerHTML=shown.map(e=>`<div class="payCardItem"><div class="pcHead"><div><b>${esc(e.name)}</b>${badge(e)}<span class="small">${sub(e)}</span></div><div class="pcTot"><b>${h2(e.total)} h</b><span>${money(Number(e.earnings||0))}</span></div></div><div class="pcDays">${days.map((d,i)=>{const v=Number((e.days||[])[i]||0);return `<div class="pcDay${v>0.004?'':' off'}"><span>${names[i]} ${d.getDate()}</span><b>${v>0.004?h2(v):'–'}</b></div>`;}).join('')}</div></div>`).join('')||'<div class="dashEmpty">No employees match.</div>';
    playRowsIn($('weeklyRows'));
  }
  function downloadPayrollCsv(){
    const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],days=payBounds.slice(0,7).map(b=>new Date(b));
    const q=v=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
    const head=['Employee','Title','Status','Hourly wage',...days.map((d,i)=>`${names[i]} ${iso(d)}`),'Total paid hours','Earnings'];
    const rows=payWeekly.map(e=>[e.name,e.title||'',statusText(e.employment_status||'active'),Number(e.wage||0).toFixed(2),...[0,1,2,3,4,5,6].map(i=>Number((e.days||[])[i]||0).toFixed(2)),Number(e.total||0).toFixed(2),Number(e.earnings||0).toFixed(2)]);
    const tot=['Total','','','',...[0,1,2,3,4,5,6].map(i=>payWeekly.reduce((a,e)=>a+Number((e.days||[])[i]||0),0).toFixed(2)),payWeekly.reduce((a,e)=>a+Number(e.total||0),0).toFixed(2),payWeekly.reduce((a,e)=>a+Number(e.earnings||0),0).toFixed(2)];
    const csv=[head,...rows,tot].map(r=>r.map(q).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`workclock-payroll-week-${iso(days[0]||new Date())}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Payroll CSV downloaded.');
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
    const mode=$('reportPeriod').value;
    let start,end,months=null,label='';
    if(mode==='custom'){
      const f=$('reportFrom').value,t=$('reportTo').value;
      if(!f||!t){$('reportMsg').textContent='Choose both a From and a To date.';$('reportResult').classList.add('hide');return;}
      start=new Date(f+'T00:00:00');end=new Date(t+'T23:59:59.999');
      if(!(end>start)){$('reportMsg').textContent='The To date must be after the From date.';$('reportResult').classList.add('hide');return;}
      if((end-start)>430*86400000){$('reportMsg').textContent='That range is too long. Choose 14 months or less.';$('reportResult').classList.add('hide');return;}
      label=`${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
    }else{
      months=Number(mode||3);
      end=new Date();end.setHours(23,59,59,999);
      start=new Date();start.setMonth(start.getMonth()-months);start.setHours(0,0,0,0);
      label=`the last ${months} month${months===1?'':'s'}`;
    }
    $('reportMsg').textContent='Loading…';
    try{
      const j=await api(`/api/manager?view=report&employeeId=${emp.id}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      renderReport(j,emp,start,end,months,label);
    }catch(e){$('reportMsg').textContent=e.message;$('reportResult').classList.add('hide');}
  }
  function renderReport(j,emp,start,end,months,label){
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
      tile('DAYS WORKED',String(worked),months?`over ${months} month${months>1?'s':''}`:'in this range'),
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
  /* ---- Manager app shell: one page per section, sidebar / burger menu ----
     Pages are switched with #/name in the address, so links, the back button
     and a refresh all land on the same page. Every section keeps the code it
     had before; this only decides which sections are on screen. */
  const MGR_PAGES={
    dashboard:{title:'Dashboard',sub:'The selected week at a glance',week:true},
    payroll:{title:'Payroll',sub:'Paid hours and earnings for the week',week:true},
    shifts:{title:'Shifts',sub:'Every clock-in, reviews and corrections',week:true},
    approvals:{title:'Approvals',sub:'Shifts waiting for your decision',week:true},
    alerts:{title:'Location Alerts',sub:'Clock-outs outside the allowed area',week:true},
    employees:{title:'Employees',sub:'Team, wages, titles and PINs',week:false},
    reports:{title:'Reports',sub:'Hours and earnings over any period',week:false},
    settings:{title:'Settings',sub:'Rules, data retention and your password',week:false}
  };
  // Sections that start collapsed are opened when their page is shown.
  const MGR_OPEN={shifts:[['toggleShiftDetails','shiftDetailsBody'],['toggleForce','forceBody']],alerts:[['toggleRejected','rejectedBody']],employees:[['toggleEmployees','employeesBody'],['toggleAddEmployee','addEmployeeBody']],reports:[['toggleReport','reportBody']],settings:[['toggleSettings','settingsBody']]};
  function mgrPageName(){const n=location.hash.replace(/^#\/?/,'').split(/[/?]/)[0];return MGR_PAGES[n]?n:'dashboard';}
  function setMgrNav(open){
    const nav=$('mgrNav'),scrim=$('mgrScrim'),b=$('mgrBurger');if(!nav)return;
    nav.classList.toggle('open',open);scrim.classList.toggle('hide',!open);
    if(b)b.setAttribute('aria-expanded',String(open));
    document.body.style.overflow=open&&innerWidth<1024?'hidden':'';
  }
  function showMgrPage(){
    const app=$('managerApp');if(!app)return;
    const name=mgrPageName(),pg=MGR_PAGES[name];
    app.dataset.page=name;
    if(pg.week)app.dataset.week='1';else delete app.dataset.week;
    $('mgrPageTitle').textContent=pg.title;$('mgrPageSub').textContent=pg.sub;
    document.querySelectorAll('#mgrNav [data-route]').forEach(a=>{const on=a.dataset.route===name;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    (MGR_OPEN[name]||[]).forEach(([btn,body])=>{const b=$(body);if(b&&b.classList.contains('hide'))setSection($(btn),b,true);});
    document.title=`${pg.title} — WorkClock Manager`;
    // A calendar left open on the previous page must not cover the new one.
    document.querySelectorAll('.weekCal:not(.hide)').forEach(c=>c.classList.add('hide'));
    // Same for any dialog or day sheet left open.
    closeDaySheet();closeForceDialog();closeEmpPanel();closeCustomReview();closeClockInEdit();
    document.querySelectorAll('.weekPickerBtn[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
    setMgrNav(false);
    window.scrollTo({top:0,behavior:'auto'});
  }
  function goMgrPage(name){if(mgrPageName()===name&&location.hash)showMgrPage();else location.hash='#/'+name;}
  function initManagerShell(){
    document.body.classList.add('mgrIn');
    // The week picker moves from the Payroll card into the top bar, where it
    // serves every page that follows the selected week.
    const wk=document.querySelector('[data-page="payroll"] .weekNav');if(wk&&$('mgrWeekSlot'))$('mgrWeekSlot').appendChild(wk);
    $('mgrBurger').onclick=()=>setMgrNav(!$('mgrNav').classList.contains('open'));
    $('mgrNavClose').onclick=()=>setMgrNav(false);
    $('mgrScrim').onclick=()=>setMgrNav(false);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setMgrNav(false);});
    $('navLogoutBtn').onclick=()=>$('logoutBtn').click();
    document.querySelectorAll('#mgrNav [data-route]').forEach(a=>a.addEventListener('click',()=>{if(a.getAttribute('href')===location.hash)showMgrPage();}));
    window.addEventListener('hashchange',showMgrPage);
    showMgrPage();
  }
  // Same details the day pop-up passes to the review dialogs.
  function shiftMeta(x,minimum){
    const actual=Number(x.actual_hours??hours(x)),fullPay=Math.max(actual,minimum);
    const ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;
    const hm=t=>t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const sameDay=co?iso(ci)===iso(co):true;
    const stamp=t=>sameDay?hm(t):`${t.toLocaleDateString([],{month:'short',day:'numeric'})} ${hm(t)}`;
    const times=co?`${stamp(ci)} – ${stamp(co)}`:`${hm(ci)} – still open`;
    return {actual,fullPay,times,attrs:`data-name="${esc(x.name)}" data-actual="${actual.toFixed(2)}" data-full="${fullPay.toFixed(2)}" data-when="${esc(fmtDay(ci))}" data-times="${esc(times)}" data-in="${esc(x.clock_in)}" data-out="${esc(x.clock_out||'')}" data-paid="${x.manager_custom_paid_hours!=null?Number(x.manager_custom_paid_hours).toFixed(2):''}" data-min="${minimum}"`};
  }
  let mgrLastData=null,daySheetState=null;
  const pinIcon='<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
  function mapPins(x){
    const link=(a,b,l)=>`<a class="mapPin" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${encodeURIComponent(a+','+b)}">${pinIcon}${l}</a>`;
    return (x.clock_in_lat!=null?link(x.clock_in_lat,x.clock_in_lng,'Clock-in spot'):'')+(x.clock_out_lat!=null?link(x.clock_out_lat,x.clock_out_lng,'Clock-out spot'):'');
  }
  function openForceDialog(id){
    closeDaySheet();
    const sel=$('forceShift');if(id&&[...sel.options].some(o=>o.value===String(id)))sel.value=String(id);
    $('forceClockOutAt').value=localDateTimeValue(new Date());$('forcePayMode').value='actual';$('forceCustomWrap').classList.add('hide');$('forceMessage').value='';$('forceMsg').textContent='';
    $('forceDialog').classList.remove('hide');sel.focus();
  }
  function closeForceDialog(){$('forceDialog').classList.add('hide');}
  function closeDaySheet(){const d=$('daySheet');if(d)d.classList.add('hide');daySheetState=null;}
  // On phones, tables become stacked cards; each cell carries its column name.
  function labelTable(tbody){const tbl=tbody&&tbody.closest('table');if(!tbl)return;const heads=[...tbl.querySelectorAll('thead th')].map(th=>th.textContent.trim());tbody.querySelectorAll('tr').forEach(tr=>[...tr.children].forEach((td,i)=>{if(heads[i])td.setAttribute('data-label',heads[i]);}));}
  function updateNavBadges(sm){
    const set=(id,n,cls)=>{const b=$(id);if(!b)return;b.textContent=n>99?'99+':String(n);b.classList.toggle('hide',!n);if(cls)b.classList.toggle(cls,n>0);};
    set('badgeApprovals',Number(sm.pending_approvals||0));
    set('badgeAlerts',Number(sm.rejected_clock_outs||0),'bad');
  }
  function renderDashboard(j,bounds,minimum){
    const shifts=j.shifts||[];
    const hm=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    const empty=t=>`<div class="dashEmpty">${t}</div>`;
    const live=shifts.filter(x=>!x.clock_out).sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
    $('dashLive').innerHTML=live.map(x=>`<div class="dashRow"><div><b><span class="liveDot"></span>${esc(x.name)}</b><span class="small">${esc(x.title||'')} · since ${esc(fmtDay(new Date(x.clock_in)))} ${hm(x.clock_in)}</span></div><span class="dashVal">${Number(x.actual_hours??hours(x)).toFixed(2)} h<button class="mini secondary dashForce" data-dash-force="${x.id}" type="button">Clock out…</button></span></div>`).join('')||empty('Nobody is clocked in right now.');
    document.querySelectorAll('[data-dash-force]').forEach(b=>b.onclick=()=>openForceDialog(b.dataset.dashForce));
    const pend=shifts.filter(x=>x.manager_review_status==='pending').sort((a,b)=>new Date(b.clock_in)-new Date(a.clock_in));
    $('dashPending').innerHTML=pend.slice(0,5).map(x=>`<div class="dashRow"><div><b>${esc(x.name)}</b><span class="small">${esc(fmtDay(new Date(x.clock_in)))} · ${esc(x.clock_out_note||'')}</span></div><span class="dashVal">${Number(x.actual_hours??hours(x)).toFixed(2)} h</span></div>`).join('')+(pend.length>5?`<a class="dashMore" href="#/approvals">+ ${pend.length-5} more</a>`:'')||empty('Nothing to approve this week.');
    const rej=j.rejectedAttempts||[];
    $('dashAlerts').innerHTML=rej.slice(0,5).map(x=>{const t=new Date(x.created_at);return `<div class="dashRow"><div><b>${esc(x.name)}</b><span class="small">${esc(fmtDay(t))} ${hm(t)}${x.note?' · '+esc(x.note):''}</span></div><span class="dashVal">${Number(x.distance_miles).toFixed(2)} mi</span></div>`;}).join('')+(rej.length>5?`<a class="dashMore" href="#/alerts">+ ${rej.length-5} more</a>`:'')||empty('No location alerts this week.');
    const days=Array(7).fill(0);(j.weekly||[]).forEach(e=>(e.days||[]).forEach((v,i)=>{if(i<7)days[i]+=Number(v||0);}));
    const max=Math.max(1,...days),names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    $('dashBars').innerHTML=days.map((v,i)=>{const d=new Date(bounds[i]);return `<div class="dashBar${v>0?'':' zero'}" title="${esc(fmtDay(d))}: ${v.toFixed(2)} h"><b>${v?v.toFixed(1):''}</b><i style="height:${Math.round(v/max*120)}px"></i><span>${names[i]} ${d.getDate()}</span></div>`;}).join('');
  }
  function renderApprovals(j,minimum,start){
    const pend=(j.shifts||[]).filter(x=>x.manager_review_status==='pending').sort((a,b)=>new Date(a.clock_in)-new Date(b.clock_in));
    $('approvalsRangeText').textContent=`Shifts waiting for your decision in the week of ${weekLabel(start)}.`;
    {const away=pend.filter(x=>Number(x.rejected_count||0)>0).length;$('approvalsSummary').innerHTML=pend.length?`<b>${pend.length}</b> waiting for your decision${away?` · <b>${away}</b> clocked out outside the area`:''}`:'';}
    $('approvalsList').innerHTML=pend.map(x=>{
      const m=shiftMeta(x,minimum),away=Number(x.rejected_count||0)>0;
      return `<div class="apprItem"><div><div class="apprWho"><b>${esc(x.name)}</b> <span class="small">${esc(x.title||'')}</span></div>
        <div class="apprFacts"><span>${esc(fmtDay(new Date(x.clock_in)))}</span><span>${esc(m.times)}</span><span>Worked <strong>${m.actual.toFixed(2)} h</strong></span><span>Reason <strong>${esc(x.clock_out_note||'—')}</strong></span>${x.clock_out_message?`<span>“${esc(x.clock_out_message)}”</span>`:''}${away?`<span class="dgTag warn">outside area${x.clock_out_distance_miles!=null?' · '+Number(x.clock_out_distance_miles).toFixed(2)+' mi':''}</span>`:''}</div></div>
        <div class="reviewBtns"><button class="mini primary" data-appr-full="${x.id}" ${m.attrs}>Approve full ${m.fullPay.toFixed(2)}h</button><button class="mini secondary" data-appr-actual="${x.id}" ${m.attrs}>Approve actual ${m.actual.toFixed(2)}h</button><button class="mini secondary" data-appr-custom="${x.id}" ${m.attrs}>Custom hours…</button></div></div>`;
    }).join('')||'<div class="apprDone">All caught up — nothing is waiting for approval this week.</div>';
    document.querySelectorAll('[data-appr-full]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.apprFull,'approve_full',b.dataset));
    document.querySelectorAll('[data-appr-actual]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.apprActual,'approve_actual',b.dataset));
    document.querySelectorAll('[data-appr-custom]').forEach(b=>b.onclick=()=>openCustomReview(b.dataset.apprCustom,b.dataset));
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
      $('shiftDetailsRangeText').textContent=`Showing shifts for the week of ${weekLabel(start)}.`;
      const j=await api(`/api/manager?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`),q=$('search').value.trim().toLowerCase(),shiftDate=dayFilter.value,shiftQ=$('shiftDetailsSearch').value.trim().toLowerCase(),rows=(j.shifts||[]).filter(x=>{const nameOk=!shiftQ||String(x.name).toLowerCase().includes(shiftQ);const dateOk=!shiftDate||iso(new Date(x.clock_in))===shiftDate;return nameOk&&dateOk;});
      // The week data carries fewer fields than /api/employees (no email or PIN state),
      // so merge it in rather than replacing the full records.
      if(j.employees){const full=new Map((managerPeople||[]).map(p=>[String(p.id),p]));managerPeople=j.employees.map(e=>Object.assign({},full.get(String(e.id))||{},e));}populateForceShifts(j.shifts||[]);fillReportEmployees();
      const focusForce=id=>openForceDialog(id);
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
      // Bucket each shift onto every day it actually covers, using the per-day
      // split the server computed. These cells therefore add up to exactly the
      // Weekly Paid Hours row above — a shift running past midnight lands partly
      // on each day rather than wholly on the day it started.
      const byEmpDay={};
      for(const x of (j.shifts||[])){
        const alloc=x.day_alloc||[];
        const startKey=iso(new Date(x.clock_in));
        dayKeys.forEach((k,i)=>{
          const share=Number(alloc[i]||0);
          const startsHere=startKey===k;
          if(share<=0.0001&&!startsHere)return;
          (byEmpDay[x.employee_id]=byEmpDay[x.employee_id]||{});
          (byEmpDay[x.employee_id][k]=byEmpDay[x.employee_id][k]||[]).push({shift:x,share,startsHere});
        });
      }
      $('rows').innerHTML=people.map(emp=>{
        const perDay=byEmpDay[emp.id]||{};
        let weekPaid=0;
        const cells=dayKeys.map(k=>{
          const list=(perDay[k]||[]).slice().sort((a,b)=>new Date(a.shift.clock_in)-new Date(b.shift.clock_in));
          if(!list.length)return `<td class="dgCell empty${shiftDate===k?' dgPicked':''}"><span class="dgDash">–</span></td>`;
          const paid=list.reduce((a,e)=>a+e.share,0);weekPaid+=paid;
          const open=list.some(e=>!e.shift.clock_out),pend=list.some(e=>e.shift.manager_review_status==='pending');
          const started=list.filter(e=>e.startsHere).length,carried=list.some(e=>!e.startsHere);
          const away=list.some(e=>Number(e.shift.rejected_count||0)>0);
          const flags=[started>1?`<span class="dgTag">${started}×</span>`:'',carried?'<span class="dgTag">carried</span>':'',pend?'<span class="dgTag warn">review</span>':'',away?'<span class="dgTag warn">location</span>':'',open?'<span class="dgTag live">open</span>':''].join('');
          return `<td class="dgCell${shiftDate===k?' dgPicked':''}"><button class="dgBtn${pend?' pend':''}" data-emp="${emp.id}" data-day="${k}" type="button"><b>${paid.toFixed(2)}</b>${flags}</button></td>`;
        }).join('');
        const est=emp.employment_status||'active';
        const badge=est!=='active'?`<span class="statusBadge ${est}">${esc(statusText(est))}</span>`:'';
        return `<tr class="dgRow" data-emp="${emp.id}"><td class="stickyCol"><b>${esc(emp.name)}</b>${badge}<div class="small">${esc(emp.title||'')}</div></td>${cells}<td class="totalCol"><b>${weekPaid.toFixed(2)}</b></td></tr>`
             + `<tr class="dgDetailRow hide" data-detail="${emp.id}"><td colspan="9"><div class="dgDetail"></div></td></tr>`;
      }).join('')||'<tr><td colspan="9">No employees match.</td></tr>';

      playRowsIn($('rows'));
      function renderDayDetail(empId,dayKey){
        const emp=(j.employees||[]).find(e=>String(e.id)===String(empId));
        const entries=((byEmpDay[empId]||{})[dayKey]||[]).slice().sort((a,b)=>new Date(a.shift.clock_in)-new Date(b.shift.clock_in));
        const dayPaid=entries.reduce((a,e)=>a+e.share,0);
        const head=`<div class="dgDetailHead"><div><b>${esc(emp?emp.name:'')}</b><span>${esc(fmtDay(new Date(dayKey+'T12:00:00')))}</span></div><div class="dgHeadRight"><span class="dgDayTotal">${dayPaid.toFixed(2)} h on this day</span><button class="mini secondary dgClose" type="button">Close</button></div></div>`;
        if(!entries.length)return head+'<p class="muted small">No hours recorded for this day.</p>';
        const rows=entries.map(entry=>{
          const x=entry.shift,m=shiftMeta(x,minimum);
          const paid=Number(x.paid_hours??paidFor(x,minimum)),earned=entry.share*Number(x.hourly_wage||0);
          const ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null,spans=co?iso(ci)!==iso(co):false,away=Number(x.rejected_count||0)>0;
          const st=x.manager_review_status;
          const badges=[!x.clock_out?'<span class="dgTag live">open</span>':'',st==='pending'?'<span class="dgTag warn">needs review</span>':'',st&&st.startsWith('approved')?`<span class="dgTag ok">${esc(statusLabel(st))}</span>`:'',away?'<span class="dgTag warn">outside area</span>':'',entry.startsHere?'':'<span class="dgTag">carried over</span>',x.manager_custom_paid_hours!=null?`<span class="dgTag">custom ${Number(x.manager_custom_paid_hours).toFixed(2)} h</span>`:''].join('');
          const notes=[
            away&&x.clock_out?`<div class="spanWarn">Clocked out ${x.clock_out_distance_miles!=null?Number(x.clock_out_distance_miles).toFixed(2)+' mi':'too far'} from the clock-in spot, so the shift was stopped then${st==='pending'?' and is waiting for your review':''}.</div>`:'',
            spans?'<div class="spanWarn">Runs past midnight into another day — check for a missed clock-out.</div>':'',
            Math.abs(entry.share-paid)>0.01?`<div class="small muted">Part of a ${paid.toFixed(2)} h shift that crosses midnight; ${entry.share.toFixed(2)} h count on this day.</div>`:'',
            x.manager_original_clock_out?`<div class="small muted">Clock-out corrected (was ${esc(new Date(x.manager_original_clock_out).toLocaleString())})</div>`:'',
            x.manager_original_clock_in?`<div class="small muted">Clock-in corrected (was ${esc(new Date(x.manager_original_clock_in).toLocaleString())})</div>`:'',
            x.manager_review_note?`<div class="small muted">Manager note: ${esc(x.manager_review_note)}</div>`:''
          ].join('');
          const btns=st==='pending'
            ?`<button class="mini primary" data-review-full="${x.id}" ${m.attrs}>Approve full ${m.fullPay.toFixed(2)}h</button><button class="mini secondary" data-review-actual="${x.id}" ${m.attrs}>Approve actual ${m.actual.toFixed(2)}h</button><button class="mini secondary" data-review-custom="${x.id}" ${m.attrs}>Custom hours…</button>`
            :(x.clock_out?`<button class="mini secondary" data-review-custom="${x.id}" ${m.attrs}>Adjust hours</button>`:`<button class="mini secondary" data-edit-in="${x.id}" ${m.attrs}>Edit clock-in time</button><button class="mini danger" data-force="${x.id}">Force clock out</button>`);
          return `<div class="shiftRow"><div class="shiftMain"><div class="shiftTimes"><b>${esc(m.times)}</b>${badges}</div><div class="shiftReason"><b>${esc(x.clock_out_note||(x.clock_out?'—':'Still clocked in'))}</b>${x.clock_out_message?` — ${esc(x.clock_out_message)}`:''}</div>${notes}</div>
            <div class="shiftNums"><div><span>Worked</span><b>${m.actual.toFixed(2)} h</b></div><div><span>Paid</span><b>${paid.toFixed(2)} h</b></div><div><span>This day</span><b>${entry.share.toFixed(2)} h</b></div><div><span>Earned</span><b>$${earned.toFixed(2)}</b></div></div>
            <div class="shiftActs"><span class="mapPins">${mapPins(x)}</span><span class="reviewBtns">${btns}</span></div></div>`;
        }).join('');
        return head+rows;
      }
      function wireDetailButtons(){
        document.querySelectorAll('[data-review-full]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewFull,'approve_full',b.dataset));
        document.querySelectorAll('[data-review-actual]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewActual,'approve_actual',b.dataset));
        document.querySelectorAll('[data-review-custom]').forEach(b=>b.onclick=()=>openCustomReview(b.dataset.reviewCustom,b.dataset));
        document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>focusForce(b.dataset.force));
        document.querySelectorAll('[data-edit-in]').forEach(b=>b.onclick=()=>openClockInEdit(b.dataset.editIn,b.dataset));
        document.querySelectorAll('.dgClose').forEach(b=>b.onclick=()=>{const r=b.closest('.dgDetailRow');if(!r){closeDaySheet();return;}r.classList.add('hide');document.querySelectorAll('.dgBtn.open').forEach(x=>x.classList.remove('open'));});
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
      // Phones: a day-by-day list instead of the week grid; a day opens in a sheet.
      $('shiftList').innerHTML=dayKeys.map(k=>{
        const items=people.map(emp=>({emp,list:((byEmpDay[emp.id]||{})[k]||[])})).filter(o=>o.list.length);
        if(shiftDate&&shiftDate!==k)return '';
        if(!items.length)return '';
        const tot=items.reduce((a,o)=>a+o.list.reduce((b,e)=>b+e.share,0),0);
        return `<div class="slDay"><div class="slDayHead"><b>${esc(fmtDay(new Date(k+'T12:00:00')))}</b><span>${tot.toFixed(2)} h</span></div>${items.map(o=>{
          const paid=o.list.reduce((b,e)=>b+e.share,0),open=o.list.some(e=>!e.shift.clock_out),pend=o.list.some(e=>e.shift.manager_review_status==='pending'),away=o.list.some(e=>Number(e.shift.rejected_count||0)>0),n=o.list.filter(e=>e.startsHere).length;
          return `<button class="slRow${pend?' pend':''}" data-sl-emp="${o.emp.id}" data-sl-day="${k}" type="button"><span class="slWho"><b>${esc(o.emp.name)}</b><span>${esc(o.emp.title||'')}${n>1?` · ${n} clock-ins`:''}</span></span><span class="slTags">${open?'<span class="dgTag live">open</span>':''}${pend?'<span class="dgTag warn">review</span>':''}${away?'<span class="dgTag warn">location</span>':''}</span><b class="slHours">${paid.toFixed(2)} h</b></button>`;}).join('')}</div>`;
      }).join('')||'<div class="dashEmpty">No hours recorded for this selection.</div>';
      const openDaySheet=(empId,dayKey)=>{daySheetState={empId,dayKey};$('daySheetBody').innerHTML=renderDayDetail(empId,dayKey);$('daySheet').classList.remove('hide');wireDetailButtons();};
      document.querySelectorAll('[data-sl-emp]').forEach(b=>b.onclick=()=>openDaySheet(b.dataset.slEmp,b.dataset.slDay));
      if(daySheetState&&!$('daySheet').classList.contains('hide'))openDaySheet(daySheetState.empId,daySheetState.dayKey);
      // A day picked in the calendar opens that day for the first employee who worked it.
      if(shiftDate){
        const first=people.find(e=>((byEmpDay[e.id]||{})[shiftDate]||[]).length);
        if(first)openDay(String(first.id),shiftDate);
      }
      document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>focusForce(b.dataset.force));

      mgrLastData=j;
      {const rej=(j.rejectedAttempts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q));
       const far=rej.reduce((a,x)=>Math.max(a,Number(x.distance_miles||0)),0);
       $('alertsSummary').innerHTML=rej.length?`<b>${rej.length}</b> clock-out${rej.length===1?'':'s'} outside the allowed area this week · farthest <b>${far.toFixed(2)} mi</b>`:'No clock-outs outside the allowed area this week.';
       $('alertCards').innerHTML=rej.map(x=>{const t=new Date(x.created_at);return `<div class="alertCard"><div class="acTop"><div><b>${esc(x.name)}</b><span class="small">${esc(x.title||'')}</span></div><span class="acDist">${Number(x.distance_miles).toFixed(2)} mi</span></div><div class="acMeta"><span>${esc(fmtDay(t))} · ${t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span><span>${esc(x.reason)}</span></div>${x.note?`<div class="acNote">“${esc(x.note)}”</div>`:''}<div class="acActs">${loc(x.lat,x.lng,'Open the clock-out spot in Maps')}</div></div>`;}).join('');}
      $('rejectedRows').innerHTML=(j.rejectedAttempts||[]).filter(x=>!q||String(x.name).toLowerCase().includes(q)).map(x=>{const t=new Date(x.created_at);return `<tr><td><b>${esc(x.name)}</b><div class="small">${esc(x.title||'')}</div></td><td>${fmtDay(t)}</td><td>${t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(x.reason)}</td><td>${esc(x.note||'—')}</td><td>${Number(x.distance_miles).toFixed(2)} mi</td><td>${loc(x.lat,x.lng,'View location')}</td></tr>`;}).join('')||'<tr><td colspan="7">No rejected clock-out attempts in this period.</td></tr>';
      const whole=v=>String(Math.round(v)),activeCount=managerPeople.filter(p=>(p.employment_status||(p.active?'active':'terminated'))==='active').length,sm=j.summary||{};
      animNum($('empCount'),activeCount,whole);animNum($('mHours'),Number(sm.total_paid_hours||0));animNum($('payroll'),Number(sm.total_payroll||0),money);
      animNum($('rejected'),Number(sm.rejected_clock_outs||0),whole);animNum($('liveClockIns'),Number(sm.live_clock_ins||0),whole);animNum($('pendingApprovals'),Number(sm.pending_approvals||0),whole);
      $('rejected').closest('.stat').classList.toggle('tileBad',Number(sm.rejected_clock_outs||0)>0);
      $('pendingApprovals').closest('.stat').classList.toggle('tileWarn',Number(sm.pending_approvals||0)>0);
      $('liveClockIns').closest('.stat').classList.toggle('tileLive',Number(sm.live_clock_ins||0)>0);
      renderDashboard(j,bounds,minimum);renderApprovals(j,minimum,start);updateNavBadges(sm);
      await loadWeeklyPaidHours(j);
      markRefreshed();
    }catch(e){$('employeeMsg').textContent='Connection error: '+e.message;if(!mgrRender._errShown){mgrRender._errShown=1;toast('Connection error: '+e.message,'bad');setTimeout(()=>mgrRender._errShown=0,60000);}}
  }
  // Rows slide in one after another the first time a table fills,
  // but not on the automatic 30-second refreshes.
  function playRowsIn(tbody){
    if(!tbody||tbody.dataset.played||calmMotion())return;
    tbody.dataset.played='1';tbody.classList.add('rowsIn');
    [...tbody.children].forEach((tr,i)=>tr.style.setProperty('--i',Math.min(i,14)));
    setTimeout(()=>tbody.classList.remove('rowsIn'),1600);
  }
  function markRefreshed(){
    const u=$('mgrUpdated'),d=$('mgrLiveDot');if(!u)return;
    u.textContent='Updated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    if(d){d.classList.remove('ping');void d.offsetWidth;d.classList.add('ping');}
  }
  // Header clock, plus cards that rise into view as you scroll down.
  function initManagerMotion(){
    const clock=$('mgrClock');
    const tickClock=()=>{if(clock)clock.textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};
    tickClock();setInterval(tickClock,15000);
    const cards=[...document.querySelectorAll('#managerApp > section.card')];
    if(calmMotion()||!('IntersectionObserver' in window)){cards.forEach(c=>c.classList.add('inView'));return;}
    cards.forEach(c=>c.classList.add('reveal'));
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('inView');io.unobserve(e.target);}}),{threshold:.08,rootMargin:'0px 0px -30px 0px'});
    cards.forEach(c=>io.observe(c));
  }
  // Opens or closes a section with a short slide, keeping the button text,
  // arrow and aria-expanded in step.
  function setSection(btn,body,open,showText='Show',hideText='Minimize'){
    if(!btn||!body)return;
    btn.textContent=open?hideText:showText;btn.setAttribute('aria-expanded',String(open));
    if(open){body.classList.remove('hide','sectionClosing');body.classList.add('sectionOpening');setTimeout(()=>body.classList.remove('sectionOpening'),320);return;}
    if(calmMotion()||body.classList.contains('hide')){body.classList.add('hide');return;}
    body.classList.add('sectionClosing');
    setTimeout(()=>{if(body.classList.contains('sectionClosing')){body.classList.add('hide');body.classList.remove('sectionClosing');}},200);
  }
  // Settings, Data Retention and Manager Password share one card with tabs.
  function initSettingsTabs(){
    const tabs=[...document.querySelectorAll('[data-settings-tab]')];
    tabs.forEach(tb=>tb.onclick=()=>{
      tabs.forEach(x=>{const on=x===tb;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));const panel=$(x.dataset.settingsTab);if(panel)panel.classList.toggle('hide',!on);});
    });
  }
  // Tapping a top tile opens the page it summarises.
  function initTileLinks(){
    [['empCount','employees'],['mHours','payroll'],['payroll','payroll'],['rejected','alerts'],['liveClockIns','shifts'],['pendingApprovals','approvals']].forEach(([id,page])=>{
      const el=$(id);if(!el)return;const tile=el.closest('.stat');tile.classList.add('tileLink');tile.onclick=()=>goMgrPage(page);
    });
  }
  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());initManagerShell();
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),title=$('newTitle').value.trim(),email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});['newName','newTitle','newEmail','newWage','newPin'].forEach(id=>$(id).value='');$('employeeMsg').textContent='Employee saved and PIN set.';toast('Employee saved and PIN set.');await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}};
    $('saveSettings').onclick=async()=>{try{const j=await api('/api/settings',{method:'PATCH',body:JSON.stringify({clock_out_radius_miles:Number($('radiusSetting').value),project_completed_min_paid_hours:Number($('projectMinSetting').value),max_active_employees:Number($('maxEmployeesSetting').value),data_retention_months:Number($('retentionSetting').value)})});const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles;$('projectMinSetting').value=s.project_completed_min_paid_hours;$('maxEmployeesSetting').value=s.max_active_employees;$('retentionSetting').value=s.data_retention_months;toast('Settings saved.');$('settingsMsg').textContent='Settings saved.';}catch(e){$('settingsMsg').textContent=e.message;}};
    $('changeManagerPasswordBtn').onclick=async()=>{const currentPassword=$('currentManagerPassword').value,newPassword=$('newManagerPassword').value,confirmPassword=$('confirmManagerPassword').value;if(!currentPassword||!newPassword||!confirmPassword)return $('managerPasswordMsg').textContent='Complete all password fields.';if(newPassword!==confirmPassword)return $('managerPasswordMsg').textContent='New passwords do not match.';try{await api('/api/manager-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('managerPasswordMsg').textContent='Password changed. Please sign in again.';setTimeout(()=>location.reload(),700);}catch(e){$('managerPasswordMsg').textContent=e.message;}};
    $('logoutBtn').onclick=async()=>{try{await api('/api/manager-auth',{method:'DELETE'});}catch{}location.href='/?manager=1';};
    $('forcePayMode').onchange=()=> $('forceCustomWrap').classList.toggle('hide',$('forcePayMode').value!=='custom');
    $('forceClockOutBtn').onclick=async()=>{await forceClockOut();if(/^Clocked out/.test($('forceMsg').textContent))setTimeout(closeForceDialog,900);};
    $('forceCancel').onclick=closeForceDialog;
    {const btns=$('forceDialog').querySelector('.modalBtns');if(btns&&$('forceClockOutBtn').parentElement!==btns){$('forceClockOutBtn').textContent='Force clock out';btns.appendChild($('forceClockOutBtn'));}}
    $('forceDialog').onclick=e=>{if(e.target===$('forceDialog'))closeForceDialog();};
    $('daySheet').onclick=e=>{if(e.target===$('daySheet'))closeDaySheet();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeForceDialog();closeDaySheet();closeEmpPanel();}});
    $('paySearch').oninput=()=>loadWeeklyPaidHours();
    $('payCsvBtn').onclick=downloadPayrollCsv;
    $('empSearch').oninput=renderPeople;
    document.querySelectorAll('[data-emp-tab]').forEach(b=>b.onclick=()=>{empTab=b.dataset.empTab;renderPeople();});
    $('addEmpBtn').onclick=()=>openEmpPanel(null);
    $('empPanelCancel').onclick=closeEmpPanel;$('empPanelSave').onclick=saveEmpPanel;
    $('empPanel').onclick=e=>{if(e.target===$('empPanel'))closeEmpPanel();};
    $('epPin').oninput=()=>{$('epPin').value=$('epPin').value.replace(/\D/g,'').slice(0,4);};
    document.querySelectorAll('#reportChips [data-range]').forEach(c=>c.onclick=()=>{document.querySelectorAll('#reportChips .chip').forEach(x=>x.classList.toggle('on',x===c));$('reportPeriod').value=c.dataset.range;$('reportPeriod').dispatchEvent(new Event('change'));});
    $('reportSearch').addEventListener('keydown',e=>{if(e.key==='Enter')runReport();});
    $('saveRetention').onclick=async()=>{$('saveSettings').click();setTimeout(()=>{$('retentionMsg').textContent=$('settingsMsg').textContent;},700);};
    ['reportMonths','reportDays','rejectedRows'].forEach(id=>{const tb=$(id);if(tb)new MutationObserver(()=>labelTable(tb)).observe(tb,{childList:true});});
    setWeek(new Date(),false);
    initWeekCal();
    initShiftCal();
const collapse=(btn,body,showText='Show',hideText='Minimize')=>{const b=$(body),k=$(btn);if(!b||!k)return;k.onclick=()=>setSection(k,b,b.classList.contains('hide'),showText,hideText);};
    collapse('toggleForce','forceBody');
    collapse('toggleAddEmployee','addEmployeeBody');
    collapse('toggleSettings','settingsBody');
    collapse('toggleReport','reportBody');
    collapse('toggleReportDays','reportDaysWrap','Show days','Hide days');
    $('runReport').onclick=runReport;
    $('reportPeriod').onchange=()=>{
      const custom=$('reportPeriod').value==='custom';
      $('reportFromWrap').classList.toggle('hide',!custom);
      $('reportToWrap').classList.toggle('hide',!custom);
      if(custom){
        // Default the boxes to the last month so they are never empty.
        if(!$('reportTo').value)$('reportTo').value=iso(new Date());
        if(!$('reportFrom').value){const d=new Date();d.setMonth(d.getMonth()-1);$('reportFrom').value=iso(d);}
        $('reportMsg').textContent='Choose a start and end date, then select View report.';
        return;
      }
      if($('reportResult').dataset.employeeId)runReport();
    };
    ['reportFrom','reportTo'].forEach(id=>$(id).onchange=()=>{if($('reportResult').dataset.employeeId)runReport();});
    const shiftWeek=step=>{const d=new Date($('weeklyWeekDate').value+'T12:00:00');d.setDate(d.getDate()+step);setWeek(d);};
    $('weeklyPrev').onclick=()=>shiftWeek(-7);
    $('weeklyNext').onclick=()=>shiftWeek(7);
    collapse('toggleShiftDetails','shiftDetailsBody');
    initSettingsTabs();
    initTileLinks();
    initManagerMotion();
    $('clockInCancel').onclick=closeClockInEdit;
    $('clockInSave').onclick=saveClockInEdit;
    $('clockInAt').oninput=clockInPreview;
    $('clockInQuick').onchange=()=>{
      const back=Number($('clockInQuick').value||0);
      if(!back)return;
      const base=new Date($('clockInEdit').dataset.originalIn);
      const d=new Date(base.getTime()-back*3600000);
      $('clockInAt').value=localDateTimeValue(d);
      clockInPreview();
    };
    $('clockInEdit').onclick=e=>{if(e.target===$('clockInEdit'))closeClockInEdit();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeClockInEdit();});
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
    collapse('toggleEmployees','employeesBody');
    collapse('toggleRejected','rejectedBody');
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
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-toggle-password]');if(!btn)return;const input=$(btn.dataset.togglePassword);if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';btn.textContent=visible?t('show'):t('hide');btn.setAttribute('aria-label',visible?t('show'):t('hide'));});
  // Each portal carries its own icon, so a pinned tab or home-screen shortcut
  // shows which one it opens.
  (function setPortalIcon(){
    const src=managerMode?'/icon-manager.png':'/icon-employee.png';
    const fav=$('favicon'),apple=$('appleIcon');
    if(fav)fav.href=src;
    if(apple)apple.href=src;
    document.title=managerMode?'WorkClock — Manager Portal':'WorkClock — Employee Portal';
  })();
  if(managerMode)initManager();else initEmployee();
})();
