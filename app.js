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

  /* Uniform item icons (simple line drawings). */
  const UNI_SVG=d=>`<svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
  const UNI_ICONS={
    tshirt_half:UNI_SVG('<path d="M17 6l-9 5 3 8 5-2v25h16V17l5 2 3-8-9-5c-1 3-4 5-7 5s-6-2-7-5z"/>'),
    tshirt_full:UNI_SVG('<path d="M17 6l-7 4-5 26 6 1 4-18v23h18V19l4 18 6-1-5-26-7-4c-1 3-4 5-7 5s-6-2-7-5z"/>'),
    trousers:UNI_SVG('<path d="M13 5h22l3 38h-9l-5-26-5 26h-9z"/><path d="M13 11h22"/>'),
    jacket:UNI_SVG('<path d="M17 5l-7 4-5 28 6 1 3-14v20h20V24l3 14 6-1-5-28-7-4-7 8z"/><path d="M24 13v30M20 24h1M27 24h1M20 31h1M27 31h1"/>')
  };
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
    erAtRate:['at ${r}/h','a ${r}/h'],
    supTitle:['Request Supplies','Pedir materiales'],
    supHelp:['Choose what you need and how many, then send. Your manager will hand them out.','Elija lo que necesita y cuántos, y envíe. Su gerente se los entregará.'],
    supOpen:['Open','Abrir'],supClose:['Close','Cerrar'],
    supSearch:['Search supplies','Buscar materiales'],
    supNote:['Note for your manager (optional)','Nota para su gerente (opcional)'],
    supNotePh:['e.g. for the ceiling job tomorrow','p. ej. para el trabajo del techo mañana'],
    supSend:['Send request','Enviar pedido'],
    supMine:['My requests','Mis pedidos'],
    supNoneMine:['You have not requested anything yet.','Todavía no ha pedido nada.'],
    supPicked:['{n} items selected','{n} artículos elegidos'],
    supPickSome:['Choose at least one item.','Elija al menos un artículo.'],
    supSent:['Request sent. Your manager has been notified.','Pedido enviado. Se avisó a su gerente.'],
    supNoMatch:['No supplies match your search.','Ningún material coincide con su búsqueda.'],
    supNoItems:['No supplies are available to request yet.','Todavía no hay materiales para pedir.'],
    supWaiting:['Waiting','En espera'],supGiven:['Given','Entregado'],supRejected:['Rejected','Rechazado'],supCancelled:['Cancelled','Cancelado'],
    supCancel:['Cancel request','Cancelar pedido'],
    supCancelAsk:['Cancel this request?','¿Cancelar este pedido?'],
    supAsked:['asked {n}','pidió {n}'],supGot:['got {n}','recibió {n}'],
    supMgrNote:['Manager:','Gerente:'],
    supTooMany:['You already have several requests waiting. Wait for your manager, or cancel one.','Ya tiene varios pedidos en espera. Espere a su gerente o cancele uno.'],
    supGone:['One of the items is no longer available. The list has been refreshed.','Uno de los artículos ya no está disponible. Se actualizó la lista.'],
    supQty:['Each item needs a quantity from 1 to 999.','Cada artículo necesita una cantidad de 1 a 999.'],
    supHandled:['This request has already been handled.','Este pedido ya fue atendido.'],
    supLess:['Less','Menos'],supMore:['More','Más'],
    navUniforms:['Uniforms','Uniformes'],uniTitle:['Request Uniform','Pedir uniforme'],
    uniHelp:['Pick the items you need, choose your size and how many, then send.','Elija las prendas que necesita, su talla y cuántas, y envíe.'],
    uniNotePh:['e.g. my jacket is torn','p. ej. mi chaqueta está rota'],
    uni_tshirt_half:['T-shirt, half sleeve','Camiseta, manga corta'],uni_tshirt_full:['T-shirt, full sleeve','Camiseta, manga larga'],uni_trousers:['Trousers','Pantalón'],uni_jacket:['Jacket','Chaqueta'],
    uniSize:['Size','Talla'],uniEach:['${p} each','${p} cada una'],
    uniTotal:['Total: ${t}','Total: ${t}'],
    uniDeductNote:['The cost is taken off your pay in the week your manager gives you the items.','El costo se descuenta de su pago la semana en que su gerente le entrega las prendas.'],
    uniCost:['Cost ${t}','Costo ${t}'],uniQty:['How many','Cuántas'],uniPickSize:['Choose a size for {item}.','Elija una talla para {item}.'],
    uniPickSome:['Choose at least one item and its size.','Elija al menos una prenda y su talla.'],uniTooMany:['You already have uniform requests waiting.','Ya tiene pedidos de uniforme en espera.'],
    uniDeduction:['UNIFORM DEDUCTION','DESCUENTO DE UNIFORME'],weekPay:['WEEK PAY','PAGO DE LA SEMANA'],
    navVacation:['Vacation','Vacaciones'],vacTitle:['My Vacation','Mis vacaciones'],
    vacHelp:['You earn 40 hours of vacation for every 2,080 paid hours you work: about 0.77 hours for each 40-hour week.','Gana 40 horas de vacaciones por cada 2,080 horas pagadas trabajadas: unas 0.77 horas por cada semana de 40 horas.'],
    vacBalance:['AVAILABLE NOW','DISPONIBLE AHORA'],vacEarnedYear:['EARNED THIS YEAR','GANADO ESTE AÑO'],vacEarnedAll:['EARNED IN TOTAL','GANADO EN TOTAL'],vacTaken:['TAKEN','USADO'],
    vacHours:['hours','horas'],vacDays:['about {d} days of 8 hours','aprox. {d} días de 8 horas'],vacFrom:['from {h} paid hours','de {h} horas pagadas'],
    vacNote:['Hours are counted from your paid shifts once you clock out. To take vacation, talk to your manager; they record it here.','Las horas se cuentan de sus turnos pagados al marcar la salida. Para tomar vacaciones, hable con su gerente; él lo registra aquí.'],
    supUpdated:['Your manager answered a supply request.','Su gerente respondió un pedido de materiales.'],uniUpdated:['Your manager answered a uniform request.','Su gerente respondió un pedido de uniforme.'],
    menu:['Menu','Menú'],close:['Close','Cerrar'],navClock:['Time Clock','Reloj'],navSupplies:['Supplies','Materiales']
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
    if(employeeIdentity&&$('empSupItems'))renderEmpSupplies();
    if(employeeIdentity&&$('empUniItems'))renderEmpUniforms();
    if(employeeIdentity&&empPage()==='vacation')loadEmpVacation();
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
  function showEmployeeLogin(){employeeIdentity=null;empCache=null;clearInterval(empPollTimer);empCountsKnown=null;empCounts.supplies=0;empCounts.uniforms=0;if($('empBurgerDot'))setEmpCounts();if($('empBurger')){$('empBurger').classList.add('hide');setEmpDrawer(false);}$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent='';}
  function showEmployeeApp(emp){employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name||'—';$('employeeTitleDisplay').textContent=emp.title||'';$('employeeRateDisplay').textContent=Number(emp.hourly_wage||0).toFixed(2)==='0.00'?'$0.00/hr':`$${Number(emp.hourly_wage||0).toFixed(2)}/hr`;setEmpWeek($('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),false);loadEmployee();$('empBurger').classList.remove('hide');$('empDrawerName').textContent=emp.name||'';startEmpPoll();if(empPage()==='supplies')showEmpPage();else{showEmpPage();if(!$('empSupBody').classList.contains('hide'))loadEmpSupplies();}}
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
    // Uniforms handed out this week come off this week's pay.
    const ded=Number(empCache.deduction?.total||0);
    $('weekDedBox').classList.toggle('hide',!ded);$('weekPayBox').classList.toggle('hide',!ded);
    if(ded){$('weekDed').textContent=`−$${ded.toFixed(2)}`;$('weekDedItems').textContent=(empCache.deduction.lines||[]).map(l=>`${l.qty} × ${t('uni_'+l.item)} ${l.size}`).join(', ');$('weekPay').textContent=`$${Math.max(0,total*rate-ded).toFixed(2)}`;}
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
    try{const dedP=api(`/api/supplies?mine=1&deductions=1&start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}`).catch(()=>null);empCache=await api(`/api/employee?start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}&dayStarts=${qp(bounds)}`);empCache.deduction=await dedP;employeeIdentity=empCache.employee;projectMinimum=Number(empCache.settings?.project_completed_min_paid_hours??8);renderEmployee();}
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

  /* ---- Employee: request supplies ---- */
  let supEmp={items:[],requests:[]};const supCart=new Map();
  const supStatusText=st=>({pending:t('supWaiting'),given:t('supGiven'),rejected:t('supRejected'),cancelled:t('supCancelled')}[st]||st);
  const supErr=e=>{const c=e.payload?.code;return c==='SUPPLY_EMPTY'?t('supPickSome'):c==='SUPPLY_TOO_MANY'?t('supTooMany'):c==='SUPPLY_GONE'?t('supGone'):c==='SUPPLY_QTY'?t('supQty'):c==='SUPPLY_HANDLED'?t('supHandled'):displayMessage(e.payload||e.message);};
  async function loadEmpSupplies(){try{supEmp=await api('/api/supplies?mine=1&seen=1');empCounts.supplies=0;setEmpCounts();for(const id of [...supCart.keys()])if(!supEmp.items.some(i=>String(i.id)===id))supCart.delete(id);renderEmpSupplies();}catch(e){if(e.status===401)return;$('empSupMsg').textContent=supErr(e);}}
  function renderEmpSupplies(){
    if(!$('empSupItems'))return;
    const q=($('empSupSearch').value||'').trim().toLowerCase();
    const items=supEmp.items.filter(i=>!q||(i.name+' '+i.category).toLowerCase().includes(q));
    const cats=[...new Set(items.map(i=>i.category))];
    $('empSupItems').innerHTML=cats.map(c=>`<div class="supCat">${esc(c)}</div>`+items.filter(i=>i.category===c).map(i=>{const n=supCart.get(String(i.id))||0;return `<div class="supPick${n?' on':''}"><div class="supPickName"><b>${esc(i.name)}</b><span>${esc(i.unit)}</span></div><div class="supStep"><button type="button" data-sup-dec="${i.id}" aria-label="${esc(t('supLess'))}"${n?'':' disabled'}>−</button><input data-sup-qty="${i.id}" inputmode="numeric" value="${n||''}" placeholder="0" aria-label="${esc(i.name)}"/><button type="button" data-sup-inc="${i.id}" aria-label="${esc(t('supMore'))}">+</button></div></div>`;}).join('')).join('')||`<div class="dashEmpty">${esc(supEmp.items.length?t('supNoMatch'):t('supNoItems'))}</div>`;
    const set=(id,v)=>{v=Math.max(0,Math.min(999,Math.floor(Number(v)||0)));if(v)supCart.set(String(id),v);else supCart.delete(String(id));renderEmpSupplies();};
    document.querySelectorAll('[data-sup-dec]').forEach(b=>b.onclick=()=>set(b.dataset.supDec,(supCart.get(b.dataset.supDec)||0)-1));
    document.querySelectorAll('[data-sup-inc]').forEach(b=>b.onclick=()=>set(b.dataset.supInc,(supCart.get(b.dataset.supInc)||0)+1));
    document.querySelectorAll('[data-sup-qty]').forEach(inp=>inp.onchange=()=>set(inp.dataset.supQty,inp.value));
    const picked=supCart.size;
    $('empSupSummary').textContent=picked?t('supPicked',{n:picked}):'';
    $('empSupSendBtn').disabled=!picked;
    $('empSupMine').innerHTML=supEmp.requests.length?supEmp.requests.map(r=>`<div class="supMine st-${r.status}"><div class="supMineHead"><span class="supBadge ${r.status}">${esc(supStatusText(r.status))}</span><span class="muted small">${esc(new Date(r.created_at).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div><ul>${r.lines.map(l=>`<li><b>${esc(l.item_name)}</b> <span class="muted">· ${esc(t('supAsked',{n:l.qty_requested+' '+l.unit}))}${r.status==='given'?' · '+esc(t('supGot',{n:(l.qty_given??0)+' '+l.unit})):''}</span></li>`).join('')}</ul>${r.note?`<div class="muted small">“${esc(r.note)}”</div>`:''}${r.manager_note?`<div class="small"><b>${esc(t('supMgrNote'))}</b> ${esc(r.manager_note)}</div>`:''}${r.status==='pending'?`<button class="mini secondary" data-sup-cancel="${r.id}" type="button">${esc(t('supCancel'))}</button>`:''}</div>`).join(''):`<div class="dashEmpty">${esc(t('supNoneMine'))}</div>`;
    document.querySelectorAll('[data-sup-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm(t('supCancelAsk')))return;try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'cancel',id:Number(b.dataset.supCancel)})});}catch(e){toast(supErr(e),'bad');}loadEmpSupplies();});
  }
  async function sendEmpSupplies(){
    if(!supCart.size)return $('empSupMsg').textContent=t('supPickSome');
    const btn=$('empSupSendBtn');btn.disabled=true;$('empSupMsg').textContent='';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'request',note:$('empSupNote').value.trim(),lines:[...supCart].map(([item_id,qty])=>({item_id:Number(item_id),qty}))})});supCart.clear();$('empSupNote').value='';$('empSupSearch').value='';toast(t('supSent'));$('empSupMsg').textContent=t('supSent');await loadEmpSupplies();}
    catch(e){$('empSupMsg').textContent=supErr(e);if(e.payload?.code==='SUPPLY_GONE')loadEmpSupplies();}
    finally{btn.disabled=!supCart.size;}
  }
  function initEmpSupplies(){
    const tb=$('toggleEmpSup'),body=$('empSupBody');
    tb.onclick=()=>{const open=body.classList.contains('hide');setSection(tb,body,open,t('supOpen'),t('supClose'));tb.dataset.i18n=open?'supClose':'supOpen';if(open)loadEmpSupplies();};
    $('empSupSearch').oninput=renderEmpSupplies;
    $('empSupSendBtn').onclick=sendEmpSupplies;
  }


  /* ---- Employee: uniforms ---- */
  const UNI_KEYS=['tshirt_half','tshirt_full','trousers','jacket'],UNI_SZ=['XS','S','M','L','XL','XXL','3XL'];
  let uniEmp={requests:[],prices:{}};const uniPrice=k=>Number(uniEmp.prices?.[k]??20);const uniPick={};UNI_KEYS.forEach(k=>uniPick[k]={size:'',qty:0});
  async function loadEmpUniforms(){try{uniEmp=await api('/api/supplies?mine=1&uniforms=1&seen=1');empCounts.uniforms=0;setEmpCounts();renderEmpUniforms();}catch(e){if(e.status!==401)$('empUniMsg').textContent=displayMessage(e.payload||e.message);}}
  function renderEmpUniforms(){
    if(!$('empUniItems'))return;
    $('empUniItems').innerHTML=UNI_KEYS.map(k=>{const p=uniPick[k];return `<div class="uniCard${p.qty?' on':''}"><div class="uniCardHead"><span class="uniIcon lg">${UNI_ICONS[k]}</span><div><b>${esc(t('uni_'+k))}</b><div class="uniPriceTag">${esc(t('uniEach',{p:uniPrice(k).toFixed(2)}))}</div></div></div><div class="uniSizeLbl">${esc(t('uniSize'))}</div><div class="uniSizes" role="group" aria-label="${esc(t('uniSize'))}">${UNI_SZ.map(z=>`<button type="button" class="uniSz${p.size===z?' on':''}" data-uni-size="${k}|${z}" aria-pressed="${p.size===z}">${z}</button>`).join('')}</div><div class="uniQtyRow"><span class="uniSizeLbl">${esc(t('uniQty'))}</span><div class="supStep"><button type="button" data-uni-dec="${k}" aria-label="${esc(t('supLess'))}"${p.qty?'':' disabled'}>−</button><input readonly value="${p.qty}" aria-label="${esc(t('uniQty'))}"/><button type="button" data-uni-inc="${k}" aria-label="${esc(t('supMore'))}">+</button></div></div></div>`;}).join('');
    document.querySelectorAll('[data-uni-size]').forEach(b=>b.onclick=()=>{const [k,z]=b.dataset.uniSize.split('|');uniPick[k].size=z;if(!uniPick[k].qty)uniPick[k].qty=1;renderEmpUniforms();});
    document.querySelectorAll('[data-uni-inc]').forEach(b=>b.onclick=()=>{const p=uniPick[b.dataset.uniInc];p.qty=Math.min(20,p.qty+1);renderEmpUniforms();});
    document.querySelectorAll('[data-uni-dec]').forEach(b=>b.onclick=()=>{const p=uniPick[b.dataset.uniDec];p.qty=Math.max(0,p.qty-1);renderEmpUniforms();});
    const n=UNI_KEYS.filter(k=>uniPick[k].qty).length,sum=UNI_KEYS.reduce((a,k)=>a+uniPick[k].qty*uniPrice(k),0);
    $('empUniSummary').innerHTML=n?`${esc(t('supPicked',{n}))} · <b>${esc(t('uniTotal',{t:sum.toFixed(2)}))}</b>`:'';$('empUniSendBtn').disabled=!n;
    $('empUniMine').innerHTML=uniEmp.requests.length?uniEmp.requests.map(r=>`<div class="supMine st-${r.status}"><div class="supMineHead"><span class="supBadge ${r.status}">${esc(supStatusText(r.status))}</span><span class="muted small">${esc(new Date(r.created_at).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div><ul>${r.lines.map(l=>`<li><b>${esc(t('uni_'+l.item))}</b> <span class="muted">· ${esc(l.size)} × ${l.qty} · $${Number(l.amount||0).toFixed(2)}</span></li>`).join('')}</ul>${r.status!=='rejected'&&r.status!=='cancelled'?`<div class="small"><b>${esc(t('uniCost',{t:Number(r.total||0).toFixed(2)}))}</b></div>`:''}${r.note?`<div class="muted small">“${esc(r.note)}”</div>`:''}${r.manager_note?`<div class="small"><b>${esc(t('supMgrNote'))}</b> ${esc(r.manager_note)}</div>`:''}${r.status==='pending'?`<button class="mini secondary" data-uni-cancel="${r.id}" type="button">${esc(t('supCancel'))}</button>`:''}</div>`).join(''):`<div class="dashEmpty">${esc(t('supNoneMine'))}</div>`;
    document.querySelectorAll('[data-uni-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm(t('supCancelAsk')))return;try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_cancel',id:Number(b.dataset.uniCancel)})});}catch(e){toast(supErr(e),'bad');}loadEmpUniforms();});
  }
  async function sendEmpUniforms(){
    const lines=UNI_KEYS.filter(k=>uniPick[k].qty).map(k=>({item:k,size:uniPick[k].size,qty:uniPick[k].qty}));
    if(!lines.length)return $('empUniMsg').textContent=t('uniPickSome');
    const noSize=lines.find(l=>!l.size);if(noSize)return $('empUniMsg').textContent=t('uniPickSize',{item:t('uni_'+noSize.item)});
    const btn=$('empUniSendBtn');btn.disabled=true;$('empUniMsg').textContent='';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_request',note:$('empUniNote').value.trim(),lines})});UNI_KEYS.forEach(k=>uniPick[k]={size:'',qty:0});$('empUniNote').value='';toast(t('supSent'));$('empUniMsg').textContent=t('supSent');await loadEmpUniforms();}
    catch(e){const c=e.payload?.code;$('empUniMsg').textContent=c==='UNIFORM_TOO_MANY'?t('uniTooMany'):c==='UNIFORM_EMPTY'?t('uniPickSome'):displayMessage(e.payload||e.message);btn.disabled=false;}
  }

  /* ---- Employee: answers from the manager, and vacation ---- */
  const empCounts={supplies:0,uniforms:0};let empCountsKnown=null,empPollTimer=null;
  function setEmpCounts(){
    [['empSupCount',empCounts.supplies],['empUniCount',empCounts.uniforms]].forEach(([id,n])=>{const el=$(id);if(el){el.textContent=n;el.classList.toggle('hide',!n);}});
    $('empBurgerDot')?.classList.toggle('hide',!(empCounts.supplies+empCounts.uniforms));
  }
  async function pollEmpCounts(){
    if(managerMode||!employeeIdentity)return;
    try{const j=await api('/api/supplies?mine=1&count=1');const pg=empPage();
      if(empCountsKnown){if(j.supplies>empCountsKnown.supplies&&pg!=='supplies')toast(t('supUpdated'));if(j.uniforms>empCountsKnown.uniforms&&pg!=='uniforms')toast(t('uniUpdated'));}
      empCountsKnown={supplies:j.supplies,uniforms:j.uniforms};
      // The page being looked at counts as read.
      if(pg==='supplies'&&j.supplies)return loadEmpSupplies();
      if(pg==='uniforms'&&j.uniforms)return loadEmpUniforms();
      empCounts.supplies=j.supplies;empCounts.uniforms=j.uniforms;setEmpCounts();
    }catch{}
  }
  function startEmpPoll(){pollEmpCounts();clearInterval(empPollTimer);empPollTimer=setInterval(pollEmpCounts,60000);}
  async function loadEmpVacation(){
    try{const v=(await api('/api/supplies?mine=1&vacation=1')).vacation||{year_paid_hours:0,year_earned:0,all_earned:0,used_hours:0,balance:0};
      const h=x=>`${Number(x).toFixed(2)} ${t('vacHours')}`;
      $('vBal').textContent=h(v.balance);$('vBalDays').textContent=t('vacDays',{d:(Math.max(0,v.balance)/8).toFixed(1)});
      $('vYear').textContent=h(v.year_earned);$('vYearHrs').textContent=t('vacFrom',{h:Number(v.year_paid_hours).toFixed(2)});
      $('vAll').textContent=h(v.all_earned);$('vUsed').textContent=h(v.used_hours);$('vacMsg').textContent='';
    }catch(e){if(e.status!==401)$('vacMsg').textContent=displayMessage(e.payload||e.message);}
  }
  /* ---- Employee menu: Time Clock and Supplies as separate sections ---- */
  const EMP_PAGES=['clock','supplies','uniforms','vacation'];
  const empPage=()=>{const pg=(location.hash.match(/^#\/(\w+)/)||[])[1];return EMP_PAGES.includes(pg)?pg:'clock';};
  function setEmpDrawer(open){const d=$('empDrawer');d.classList.toggle('open',open);$('empScrim').classList.toggle('hide',!open);$('empBurger').setAttribute('aria-expanded',String(open));document.body.classList.toggle('drawerOpen',open);}
  function showEmpPage(){
    if(managerMode||!employeeIdentity)return;
    const pg=empPage();
    document.querySelectorAll('#employeeApp [data-epage]').forEach(el=>el.classList.toggle('pageOff',el.dataset.epage!==pg));
    document.querySelectorAll('[data-eroute]').forEach(a=>{const on=a.dataset.eroute===pg;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    // On its own page the supplies list is always open.
    $('toggleEmpSup').classList.toggle('hide',pg==='supplies');
    if(pg==='supplies'){$('empSupBody').classList.remove('hide');loadEmpSupplies();}
    if(pg==='uniforms')loadEmpUniforms();
    if(pg==='vacation')loadEmpVacation();
    // The map was hidden while away; let Leaflet re-measure it.
    if(pg==='clock')setTimeout(()=>window.dispatchEvent(new Event('resize')),50);
    setEmpDrawer(false);window.scrollTo(0,0);
  }
  function initEmpMenu(){
    $('empBurger').onclick=()=>setEmpDrawer(!$('empDrawer').classList.contains('open'));
    $('empDrawerClose').onclick=()=>setEmpDrawer(false);
    $('empScrim').onclick=()=>setEmpDrawer(false);
    $('empDrawerLogout').onclick=()=>{setEmpDrawer(false);$('employeeLogoutBtn').click();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('empDrawer').classList.contains('open'))setEmpDrawer(false);});
    window.addEventListener('hashchange',showEmpPage);
    $('empUniSendBtn').onclick=sendEmpUniforms;
  }
  async function initEmployee(){
    initLanguage();
    initEmployeeReport();
    initEmpSupplies();
    initEmpMenu();
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
    // Uniforms given this week come off this week's pay.
    let ded=[];try{ded=(await api(`/api/supplies?deductions=1&start=${encodeURIComponent(bounds[0])}&end=${encodeURIComponent(end.toISOString())}`)).deductions||[];}catch{}
    const dedBy=new Map(ded.map(d=>[String(d.employee_id),d]));
    for(const d of ded)if(!weekly.some(e=>String(e.employee_id)===String(d.employee_id))){const full=(j.weekly||[]).find(e=>String(e.employee_id)===String(d.employee_id));if(full)weekly.push(full);}
    const box=$('uniDedNotice');
    if(box){box.classList.toggle('hide',!ded.length);
      box.innerHTML=ded.length?`<div class="uniDedHead"><span class="uniDedIcon" aria-hidden="true">$</span><div><b>Uniform deductions for this week</b><div class="small">Take these amounts off this week's pay.</div></div><strong class="uniDedSum">−$${ded.reduce((a,d)=>a+d.total,0).toFixed(2)}</strong></div><ul>${ded.map(d=>`<li><b>${esc(d.name)}</b>: −$${d.total.toFixed(2)} <span class="muted">(${d.lines.map(l=>`${l.qty} × ${esc(UNI_NAMES[l.item]||l.item)} ${esc(l.size)}`).join(', ')})</span></li>`).join('')}</ul>`:'';}
    $('weeklyRangeText').textContent=`Week of ${weekLabel(start)}`;
    $('weeklyRows').innerHTML=weekly.map(e=>`<tr><td class="stickyCol"><b>${esc(e.name)}</b></td><td class="totalCol"><b>${Number(e.total).toFixed(2)}</b></td><td class="totalCol"><b>$${Number(e.earnings).toFixed(2)}</b>${dedBy.has(String(e.employee_id))?`<div class="uniDed">−$${dedBy.get(String(e.employee_id)).total.toFixed(2)} uniform</div>${(()=>{const net=Number(e.earnings)-dedBy.get(String(e.employee_id)).total;return net>=0?`<div class="uniNet">Pay $${net.toFixed(2)}</div>`:`<div class="uniNet owed">Pay $0.00 · $${(-net).toFixed(2)} still owed</div>`;})()}`:''}</td><td>${esc(e.title||'')}</td><td><input class="wage" type="number" min="0" max="100000" step="0.01" value="${Number(e.wage).toFixed(2)}" data-id="${e.employee_id}"></td>${e.days.map(v=>Number(v)>0.0001?`<td class="wDay">${Number(v).toFixed(2)}</td>`:'<td class="wDay"><span class="dgDash">–</span></td>').join('')}</tr>`).join('')||'<tr><td colspan="12">No employees.</td></tr>';
    playRowsIn($('weeklyRows'));
    document.querySelectorAll('.wage').forEach(i=>i.onchange=async()=>{try{const person=managerPeople.find(p=>String(p.id)===String(i.dataset.id));await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:i.dataset.id,wage:Number(i.value),title:person?.title||'',email:person?.email||''})});await loadPeople();await loadWeeklyPaidHours();toast(`Wage updated for ${person?.name||'employee'}.`);}catch(e){toast(e.message,'bad');}});
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
      // so merge it in rather than replacing the full records; replacing them let the
      // next employee save write a blank email over the real one.
      if(j.employees){const full=new Map((managerPeople||[]).map(p=>[String(p.id),p]));managerPeople=j.employees.map(e=>Object.assign({},full.get(String(e.id))||{},e));}populateForceShifts(j.shifts||[]);fillReportEmployees();
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
        const list=entries.map(e=>e.shift);
        const head=`<div class="dgDetailHead"><b>${esc(emp?emp.name:'')}</b> — ${esc(fmtDay(new Date(dayKey+'T12:00:00')))}<button class="mini secondary dgClose" type="button">Close</button></div>`;
        if(!entries.length)return head+'<p class="muted small">No hours recorded for this day.</p>';
        const cards=entries.map((entry,idx)=>{
          const x=entry.shift;
          const actual=Number(x.actual_hours??hours(x)),paid=Number(x.paid_hours??paidFor(x,minimum));
          const earned=entry.share*Number(x.hourly_wage||0);
          const ci=new Date(x.clock_in),co=x.clock_out?new Date(x.clock_out):null;
          const hm=t=>t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          const fullPay=Math.max(actual,minimum);
          const sameDay=co?iso(ci)===iso(co):true;
          const stamp=t=>sameDay?hm(t):`${t.toLocaleDateString([],{month:'short',day:'numeric'})} ${hm(t)}`;
          const times=co?`${stamp(ci)} – ${stamp(co)}`:`${hm(ci)} – still open`;
          const meta=`data-name="${esc(x.name)}" data-actual="${actual.toFixed(2)}" data-full="${fullPay.toFixed(2)}" data-when="${esc(fmtDay(ci))}" data-times="${esc(times)}" data-in="${esc(x.clock_in)}" data-out="${esc(x.clock_out||'')}" data-paid="${x.manager_custom_paid_hours!=null?Number(x.manager_custom_paid_hours).toFixed(2):''}" data-min="${minimum}"`;
          const spansDays=co?iso(ci)!==iso(co):false;
          const corrected=[
            x.manager_original_clock_out?`<div class="small muted">Clock-out corrected by manager (was ${esc(new Date(x.manager_original_clock_out).toLocaleString())})</div>`:'',
            x.manager_original_clock_in?`<div class="small muted">Clock-in corrected by manager (was ${esc(new Date(x.manager_original_clock_in).toLocaleString())})</div>`:''
          ].join('');
          const customNote=x.manager_custom_paid_hours!=null?`<div class="small"><b>${Number(x.manager_custom_paid_hours).toFixed(2)} h</b> custom paid</div>`:'';
          const btns=x.manager_review_status==='pending'
            ?`<div class="reviewBtns"><button class="mini primary" data-review-full="${x.id}" ${meta}>Approve full ${fullPay.toFixed(2)}h</button><button class="mini secondary" data-review-actual="${x.id}" ${meta}>Approve actual ${actual.toFixed(2)}h</button><button class="mini secondary" data-review-custom="${x.id}" ${meta}>Custom hours…</button></div>`
            :(x.clock_out?`<div class="reviewBtns"><button class="mini secondary" data-review-custom="${x.id}" ${meta}>Adjust hours</button></div>`:'');
          const action=x.clock_out?'':`<div class="reviewBtns"><button class="mini secondary" data-edit-in="${x.id}" ${meta}>Edit clock-in time</button><button class="mini danger" data-force="${x.id}">Force clock out</button></div>`;
          const split=Math.abs(entry.share-paid)>0.01;
          return `<div class="dgShift"><div class="dgShiftTop"><span class="dgSeq">#${idx+1}</span><b>${esc(times)}</b>${entry.startsHere?'':'<span class="dgTag">carried over</span>'}${x.manager_review_status==='pending'?'<span class="dgTag warn">needs review</span>':''}${Number(x.rejected_count||0)>0?'<span class="dgTag warn">outside area</span>':''}</div>
            ${Number(x.rejected_count||0)>0&&x.clock_out?`<div class="spanWarn">Clock-out was outside the allowed area${x.clock_out_distance_miles!=null?` (${Number(x.clock_out_distance_miles).toFixed(2)} mi from clock-in)`:''}. The shift was stopped at that moment${x.manager_review_status==='pending'?' and is waiting for your review':''}.</div>`:''}
            <div class="dgFacts"><div><span>Actual (whole shift)</span><b>${actual.toFixed(2)} h</b></div><div><span>Paid (whole shift)</span><b>${paid.toFixed(2)} h</b></div><div><span>Counted on this day</span><b>${entry.share.toFixed(2)} h</b></div><div><span>Earned this day</span><b>$${earned.toFixed(2)}</b></div></div>
            ${split?`<div class="small muted">This shift runs across midnight, so its ${paid.toFixed(2)} paid hours are split across the days it covers. ${entry.share.toFixed(2)} h fall on this day.</div>`:''}
            <div class="small"><span>Status</span> <b>${esc(statusLabel(x.manager_review_status))}</b></div>
            <div class="small"><b>${esc(x.clock_out_note||'—')}</b>${x.clock_out_message?` — ${esc(x.clock_out_message)}`:''}</div>
            ${customNote}${corrected}${spansDays?'<div class="spanWarn">Spans more than one day — check for a missed clock-out.</div>':''}
            <div class="small">${safeMapPair(x)}</div>${btns}${action}</div>`;
        }).join('');
        const dayPaid=entries.reduce((a,e)=>a+e.share,0);
        const started=entries.filter(e=>e.startsHere).length;
        return head+`<div class="dgDayTotals"><span>${started} clock-in${started===1?'':'s'}${entries.length>started?' (+1 carried over)':''}</span><span>Counted on this day <b>${dayPaid.toFixed(2)} h</b></span></div>`+cards;
      }
      function wireDetailButtons(){
        document.querySelectorAll('[data-review-full]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewFull,'approve_full',b.dataset));
        document.querySelectorAll('[data-review-actual]').forEach(b=>b.onclick=()=>reviewShift(b.dataset.reviewActual,'approve_actual',b.dataset));
        document.querySelectorAll('[data-review-custom]').forEach(b=>b.onclick=()=>openCustomReview(b.dataset.reviewCustom,b.dataset));
        document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>focusForce(b.dataset.force));
        document.querySelectorAll('[data-edit-in]').forEach(b=>b.onclick=()=>openClockInEdit(b.dataset.editIn,b.dataset));
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
      const whole=v=>String(Math.round(v)),activeCount=managerPeople.filter(p=>(p.employment_status||(p.active?'active':'terminated'))==='active').length,sm=j.summary||{};
      animNum($('empCount'),activeCount,whole);animNum($('mHours'),Number(sm.total_paid_hours||0));animNum($('payroll'),Number(sm.total_payroll||0),money);
      animNum($('rejected'),Number(sm.rejected_clock_outs||0),whole);animNum($('liveClockIns'),Number(sm.live_clock_ins||0),whole);animNum($('pendingApprovals'),Number(sm.pending_approvals||0),whole);
      $('rejected').closest('.stat').classList.toggle('tileBad',Number(sm.rejected_clock_outs||0)>0);
      $('pendingApprovals').closest('.stat').classList.toggle('tileWarn',Number(sm.pending_approvals||0)>0);
      $('liveClockIns').closest('.stat').classList.toggle('tileLive',Number(sm.live_clock_ins||0)>0);
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
  // Tapping a top tile jumps to (and opens) the section it summarises.
  function initTileLinks(){
    const go=(id,btn,body)=>{const el=$(id);if(!el)return;el.closest('.stat').classList.add('tileLink');el.closest('.stat').onclick=()=>{
      if(btn&&body&&$(body).classList.contains('hide'))setSection($(btn),$(body),true);
      const card=$(btn||id).closest('section.card');if(card){card.scrollIntoView({behavior:calmMotion()?'auto':'smooth',block:'start'});card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');}
    };};
    const weekly=()=>$('weeklyRows');
    go('empCount','toggleEmployees','employeesBody');
    ['mHours','payroll'].forEach(id=>{const el=$(id);el.closest('.stat').classList.add('tileLink');el.closest('.stat').onclick=()=>{const c=weekly().closest('section.card');c.scrollIntoView({behavior:calmMotion()?'auto':'smooth',block:'start'});c.classList.remove('flash');void c.offsetWidth;c.classList.add('flash');};});
    go('rejected','toggleRejected','rejectedBody');
    go('liveClockIns','toggleShiftDetails','shiftDetailsBody');
    go('pendingApprovals','toggleShiftDetails','shiftDetailsBody');
  }
  /* ---- Manager: Tools & Supplies ---- */
  let supData={items:[],requests:[],log:[],pending:0},supTab='pending',supKnownPending=null;
  const supWhen=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';};
  const supStatus={pending:'Waiting',given:'Given',rejected:'Rejected',cancelled:'Cancelled by painter'};
  function setSupBadge(n){
    document.querySelectorAll('[data-sup-count]').forEach(el=>{el.textContent=n;el.classList.toggle('hide',!n);});
    if($('supCountPending'))$('supCountPending').textContent=n;
    
  }
  async function pollSupplies(){
    if($('managerApp').classList.contains('hide'))return;
    try{const j=await api('/api/supplies?count=1');const n=Number(j.pending||0);
      if(supKnownPending!==null&&n>supKnownPending){toast(j.latest?`New supply request from ${j.latest.employee_name}`:'New supply request');if(currentMgrPage()==='supplies')loadSupplies();}
      supKnownPending=n;setSupBadge(n);
      const un=Number(j.uniformPending||0);
      if(uniKnownPending!==null&&un>uniKnownPending){toast(j.uniformLatest?`New uniform request from ${j.uniformLatest.employee_name}`:'New uniform request');if(currentMgrPage()==='uniforms')loadUniforms();}
      uniKnownPending=un;setUniBadge(un);renderLowAlert(j.low||[]);
      document.title=document.title.replace(/^\(\d+\)\s*/,'');if(n+un)document.title=`(${n+un}) `+document.title;}catch{}
  }
  async function loadSupplies(){
    try{supData=await api('/api/supplies');supKnownPending=Number(supData.pending||0);setSupBadge(supKnownPending);renderSupplies();}
    catch(e){$('supReqList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}
  }
  function renderSupplies(){
    // Requests
    document.querySelectorAll('[data-sup-tab]').forEach(b=>b.classList.toggle('on',b.dataset.supTab===supTab));
    const reqs=supData.requests.filter(r=>supTab==='all'||r.status===supTab||(supTab==='rejected'&&r.status==='cancelled'));
    const empty={pending:'No requests waiting. New ones show up here and on the Supplies link.',given:'Nothing given in the last 90 days.',rejected:'No rejected or cancelled requests.',all:'No requests yet.'}[supTab];
    $('supReqList').innerHTML=reqs.map(r=>{
      const pending=r.status==='pending';
      const rows=r.lines.map(l=>{const shelf=l.on_shelf??0,short=pending&&l.qty_requested>shelf;
        return `<tr><td><b>${esc(l.item_name)}</b></td><td>${l.qty_requested} <span class="muted">${esc(l.unit)}</span></td>`+(pending?`<td class="${short?'supShort':''}">${shelf} <span class="muted">${esc(l.unit)}</span>${short?'<div class="supShortTxt">Not enough</div>':''}</td><td><input class="supGiveQty" data-sup-line="${l.id}" data-sup-req="${r.id}" inputmode="numeric" type="number" min="0" max="${shelf}" value="${Math.min(l.qty_requested,shelf)}" aria-label="Give ${esc(l.item_name)}"/></td>`:`<td>${r.status==='given'?`<b>${l.qty_given??0}</b> <span class="muted">${esc(l.unit)}</span>`:'—'}</td>`)+`</tr>`;}).join('');
      return `<article class="supReq st-${r.status}"><div class="supReqHead"><div class="who"><span class="avatar">${esc(initials(r.employee_name))}</span><div><b>${esc(r.employee_name)}</b><div class="muted small">${esc(r.employee_title||'')}${r.employee_title?' · ':''}asked ${esc(supWhen(r.created_at))}</div></div></div><span class="supBadge ${r.status}">${esc(supStatus[r.status]||r.status)}</span></div>${r.note?`<div class="supNote">“${esc(r.note)}”</div>`:''}<div class="tableWrap"><table class="supLines"><thead><tr><th>Item</th><th>Asked for</th>${pending?'<th>In stock</th><th>Give</th>':'<th>Given</th>'}</tr></thead><tbody>${rows}</tbody></table></div>${pending?`<div class="supReqActions"><input class="supMgrNote" data-sup-note="${r.id}" maxlength="300" placeholder="Note to the painter (optional)"/><button class="secondary" data-sup-reject="${r.id}" type="button">Reject</button><button class="primary" data-sup-give="${r.id}" type="button">Mark as given</button></div><div class="muted small" data-sup-msg="${r.id}"></div>`:`<div class="muted small supDone">${r.status==='given'?'Given':r.status==='rejected'?'Rejected':'Cancelled'} ${esc(supWhen(r.decided_at))}${r.manager_note?` · Your note: “${esc(r.manager_note)}”`:''}</div>`}</article>`;
    }).join('')||`<div class="dashEmpty">${esc(empty)}</div>`;
    document.querySelectorAll('[data-sup-give]').forEach(b=>b.onclick=()=>supDecide(b.dataset.supGive,'given',b));
    document.querySelectorAll('[data-sup-reject]').forEach(b=>b.onclick=()=>supDecide(b.dataset.supReject,'rejected',b));
    // Stock
    const cats=[...new Set(supData.items.map(i=>i.category))].sort();
    const cf=$('supCatFilter'),keep=cf.value;cf.innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');cf.value=cats.includes(keep)?keep:'';
    $('supCatList').innerHTML=cats.map(c=>`<option value="${esc(c)}"></option>`).join('');
    const q=($('supSearch').value||'').trim().toLowerCase(),lowOnly=$('supLowOnly').checked;
    const isLow=supIsLow;
    const items=supData.items.filter(i=>(!q||(i.name+' '+i.category).toLowerCase().includes(q))&&(!cf.value||i.category===cf.value)&&(!lowOnly||isLow(i)));
    const lowN=supData.items.filter(isLow).length,outN=supData.items.filter(i=>i.active&&i.quantity===0).length;
    $('supStockSummary').innerHTML=`<span><b>${supData.items.filter(i=>i.active).length}</b> items</span><span class="${lowN?'warn':''}"><b>${lowN}</b> low</span><span class="${outN?'warn':''}"><b>${outN}</b> at zero</span>`;
    const shown=[...new Set(items.map(i=>i.category))];
    $('supItemList').innerHTML=shown.map(c=>`<div class="supCat">${esc(c)}</div><div class="supItems">`+items.filter(i=>i.category===c).map(i=>`<div class="supItem${isLow(i)?' low':''}${i.quantity===0&&i.active?' zero':''}${i.active?'':' off'}"><div class="supItemName"><b>${esc(i.name)}</b><span class="muted small">${esc(i.unit)}${i.full_qty?` · full ${i.full_qty} · ${supPct(i)}%`:''}${i.active?'':' · hidden from painters'}</span></div><div class="supQty"><b>${i.quantity}</b><span>${isLow(i)?'Low':i.quantity===0&&i.active?'None left':'in stock'}</span></div><div class="supItemBtns"><button class="mini secondary" data-sup-edit="${i.id}" type="button">Edit</button><button class="mini secondary supDel" data-sup-del="${i.id}" type="button" aria-label="Delete ${esc(i.name)}">Delete</button></div></div>`).join('')+`</div>`).join('')||`<div class="dashEmpty">No items match.</div>`;
    document.querySelectorAll('[data-sup-edit]').forEach(b=>b.onclick=()=>openSupItem(supData.items.find(i=>String(i.id)===b.dataset.supEdit)));
    document.querySelectorAll('[data-sup-del]').forEach(b=>b.onclick=()=>deleteSupItem(supData.items.find(i=>String(i.id)===b.dataset.supDel)));
    renderLowAlert(supData.low||[]);
    // History
    $('supLogRows').innerHTML=supData.log.map(g=>`<tr><td>${esc(supWhen(g.created_at))}</td><td><b>${esc(g.item_name)}</b></td><td class="${g.change<0?'neg':'pos'}">${g.change>0?'+':''}${g.change}</td><td>${g.quantity_after}</td><td>${esc(g.reason)}${g.employee_name?` · ${esc(g.employee_name)}`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No changes yet.</td></tr>';
  }
  async function supDecide(id,decision,btn){
    const msg=document.querySelector(`[data-sup-msg="${id}"]`),note=(document.querySelector(`[data-sup-note="${id}"]`)?.value||'').trim();
    const lines=[...document.querySelectorAll(`[data-sup-req="${id}"]`)].map(inp=>({id:Number(inp.dataset.supLine),qty:Number(inp.value||0)}));
    if(decision==='rejected'&&!confirm('Reject this request? The painter will see it as rejected'+(note?' with your note.':'.')))return;
    if(decision==='given'&&lines.some(l=>!Number.isInteger(l.qty)||l.qty<0)){msg.textContent='Enter whole numbers to give (0 or more).';return;}
    btn.disabled=true;msg.textContent='Saving…';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'decide',id:Number(id),decision,note,lines})});toast(decision==='given'?'Marked as given. Stock updated.':'Request rejected.');await loadSupplies();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);btn.disabled=false;}
  }
  const supIsLow=i=>i.active&&i.full_qty>0&&i.quantity*5<i.full_qty;
  const supPct=i=>i.full_qty?Math.round(i.quantity/i.full_qty*100):0;
  // Dashboard notice when any item is below 20% of its full stock.
  function renderLowAlert(low){
    const box=$('lowAlert');if(!box)return;
    box.classList.toggle('hide',!low.length);
    if(!low.length)return;
    $('lowAlertTitle').textContent=low.length===1?'1 supply item is below 20%':`${low.length} supply items are below 20%`;
    $('lowAlertList').innerHTML=low.slice(0,6).map(i=>`<span class="lowChip">${esc(i.name)} <b>${i.quantity}/${i.full_qty}</b></span>`).join('')+(low.length>6?`<span class="lowChip">+${low.length-6} more</span>`:'');
  }
  async function deleteSupItem(it){
    if(!it)return;
    if(!confirm(`Delete "${it.name}"?\n\nPainters will no longer see it. Past requests and Stock History keep its name.`))return;
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'item_delete',id:Number(it.id)})});$('supItemPanel').classList.add('hide');toast('Item deleted.');await loadSupplies();}
    catch(e){toast(displayMessage(e.payload||e.message),'bad');}
  }
  // Usage by painter, per month.
  let usageMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),usageMode='given',usageRows=[];
  async function loadUsage(){
    const start=new Date(usageMonth),end=new Date(usageMonth.getFullYear(),usageMonth.getMonth()+1,1);
    $('usageMonth').textContent=start.toLocaleDateString([], {month:'long',year:'numeric'});
    const now=new Date();$('usageNext').disabled=start.getFullYear()===now.getFullYear()&&start.getMonth()===now.getMonth();
    try{usageRows=(await api(`/api/supplies?usage=1&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)).usage||[];}catch(e){usageRows=[];$('usageNote').textContent=displayMessage(e.payload||e.message);}
    renderUsage();
  }
  function renderUsage(){
    document.querySelectorAll('[data-usage-mode]').forEach(b=>b.classList.toggle('on',b.dataset.usageMode===usageMode));
    const key=usageMode==='given'?'given':'asked';
    const rows=[...usageRows].sort((a,b)=>b[key]-a[key]||String(a.name).localeCompare(String(b.name)));
    const max=Math.max(1,...rows.map(r=>r[key]));
    const total=rows.reduce((a,r)=>a+r[key],0);
    $('usageChart').innerHTML=rows.length?`<div class="usageCols" role="list">${rows.map((r,i)=>`<div class="usageCol${i===0&&r[key]>0?' top':''}" role="listitem" aria-label="${esc(r.name)}: ${r[key]} items"><div class="usageName" title="${esc(r.name)}">${esc(r.name)}</div><div class="usageTrack"><div class="usageBar" style="height:${Math.max(r[key]?4:0,Math.round(r[key]/max*100))}%"><span>${r[key]}</span></div></div><div class="usageSub">${r.requests} request${r.requests===1?'':'s'}</div></div>`).join('')}</div>`:`<div class="dashEmpty">No supply requests this month.</div>`;
    $('usageNote').textContent=rows.length?`${total} items ${usageMode==='given'?'given out':'asked for'} in total. Counted in units (rolls, pieces, packs, boxes).`:'';
  }
  // Uniforms
  const UNI_NAMES={tshirt_half:'T-shirt, half sleeve',tshirt_full:'T-shirt, full sleeve',trousers:'Trousers',jacket:'Jacket'};
  const UNI_SIZES=['XS','S','M','L','XL','XXL','3XL'];
  let uniData={requests:[]},uniTab='pending',uniKnownPending=null;
  function setUniBadge(n){document.querySelectorAll('[data-uni-count]').forEach(el=>{el.textContent=n;el.classList.toggle('hide',!n);});if($('uniCountPending'))$('uniCountPending').textContent=n;}
  async function loadUniforms(){
    try{uniData=await api('/api/supplies?uniforms=1');uniKnownPending=uniData.requests.filter(r=>r.status==='pending').length;setUniBadge(uniKnownPending);renderUniforms();renderUniPrices();}
    catch(e){$('uniReqList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}
  }
  function renderUniforms(){
    document.querySelectorAll('[data-uni-tab]').forEach(b=>b.classList.toggle('on',b.dataset.uniTab===uniTab));
    const reqs=uniData.requests.filter(r=>uniTab==='all'||r.status===uniTab||(uniTab==='rejected'&&r.status==='cancelled'));
    $('uniReqList').innerHTML=reqs.map(r=>{const pending=r.status==='pending';
      return `<article class="supReq st-${r.status}"><div class="supReqHead"><div class="who"><span class="avatar">${esc(initials(r.employee_name))}</span><div><b>${esc(r.employee_name)}</b><div class="muted small">${esc(r.employee_title||'')}${r.employee_title?' · ':''}asked ${esc(supWhen(r.created_at))}</div></div></div><span class="supBadge ${r.status}">${esc(supStatus[r.status]||r.status)}</span></div>${r.note?`<div class="supNote">“${esc(r.note)}”</div>`:''}<div class="uniLines">${r.lines.map(l=>`<div class="uniLine"><span class="uniIcon">${UNI_ICONS[l.item]||''}</span><b>${esc(UNI_NAMES[l.item]||l.item)}</b><span class="uniSize">${esc(l.size)}</span><span class="muted">× ${l.qty}</span><span class="uniAmt">$${Number(l.amount||0).toFixed(2)}</span></div>`).join('')}<div class="uniTotal">Total to deduct: <b>$${Number(r.total||0).toFixed(2)}</b>${pending?' <span class="muted small">· deducted the week you mark it Given</span>':''}</div></div>${pending?`<div class="supReqActions"><input class="supMgrNote" data-uni-note="${r.id}" maxlength="300" placeholder="Note to the painter (optional)"/><button class="secondary" data-uni-reject="${r.id}" type="button">Reject</button><button class="primary" data-uni-give="${r.id}" type="button">Mark as given</button></div><div class="muted small" data-uni-msg="${r.id}"></div>`:`<div class="muted small supDone">${esc(supStatus[r.status]||r.status)} ${esc(supWhen(r.decided_at))}${r.manager_note?` · Your note: “${esc(r.manager_note)}”`:''}</div>`}</article>`;}).join('')||`<div class="dashEmpty">${uniTab==='pending'?'No uniform requests waiting.':'Nothing here.'}</div>`;
    document.querySelectorAll('[data-uni-give]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniGive,'given',b));
    document.querySelectorAll('[data-uni-reject]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniReject,'rejected',b));
    const tally={};uniData.requests.filter(r=>r.status==='pending').forEach(r=>r.lines.forEach(l=>{tally[l.item]=tally[l.item]||{};tally[l.item][l.size]=(tally[l.item][l.size]||0)+l.qty;}));
    $('uniSizeRows').innerHTML=Object.keys(UNI_NAMES).map(k=>{const t=tally[k]||{},tot=Object.values(t).reduce((a,b)=>a+b,0);return `<tr><td><span class="uniIcon sm">${UNI_ICONS[k]}</span><b>${esc(UNI_NAMES[k])}</b></td>${UNI_SIZES.map(z=>`<td class="${t[z]?'has':''}">${t[z]||'—'}</td>`).join('')}<td><b>${tot||'—'}</b></td></tr>`;}).join('');
  }
  function renderUniPrices(){
    const pr=uniData.prices||{};
    $('uniPriceGrid').innerHTML=Object.keys(UNI_NAMES).map(k=>`<label class="uniPrice"><span class="uniIcon">${UNI_ICONS[k]}</span><span>${esc(UNI_NAMES[k])}</span><span class="uniPriceIn">$<input data-uni-price="${k}" type="number" min="0" max="1000" step="0.01" value="${Number(pr[k]??20).toFixed(2)}"/></span></label>`).join('');
  }
  async function saveUniPrices(){
    const prices={};for(const i of document.querySelectorAll('[data-uni-price]')){const v=Number(i.value);if(!Number.isFinite(v)||v<0||v>1000)return $('uniPriceMsg').textContent='Prices must be between $0 and $1,000.';prices[i.dataset.uniPrice]=v;}
    $('uniPriceMsg').textContent='Saving…';
    try{const j=await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_prices',prices})});uniData.prices=j.prices;renderUniPrices();$('uniPriceMsg').textContent='Prices saved. New requests use these prices.';toast('Uniform prices saved.');}
    catch(e){$('uniPriceMsg').textContent=displayMessage(e.payload||e.message);}
  }
  async function uniDecide(id,decision,btn){
    const msg=document.querySelector(`[data-uni-msg="${id}"]`),note=(document.querySelector(`[data-uni-note="${id}"]`)?.value||'').trim();
    if(decision==='rejected'&&!confirm('Reject this uniform request?'))return;
    btn.disabled=true;msg.textContent='Saving…';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_decide',id:Number(id),decision,note})});toast(decision==='given'?'Marked as given. The cost now shows as a deduction on this week\'s Weekly Paid Hours.':'Uniform request rejected.');await loadUniforms();loadWeeklyPaidHours().catch(()=>{});}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);btn.disabled=false;}
  }
  // Vacations
  let vacYear=new Date().getFullYear(),vacRows=[];
  async function loadVacations(){
    $('vacYear').textContent=vacYear;$('vacYearH').textContent=vacYear;$('vacYearH2').textContent=vacYear;$('vacNext').disabled=vacYear>=new Date().getFullYear();
    try{vacRows=(await api(`/api/manager?view=vacations&year=${vacYear}`)).employees||[];renderVacations();}
    catch(e){$('vacRows').innerHTML=`<tr><td colspan="7">${esc(displayMessage(e.payload||e.message))}</td></tr>`;}
  }
  const hd=h=>{const d=Math.round(Number(h)/8*10)/10;return `${Number(h).toFixed(2)} h<small>${(Object.is(d,-0)?0:d).toFixed(1)} days (8 h)</small>`;};
  function renderVacations(){
    const q=($('vacSearch').value||'').trim().toLowerCase(),all=$('vacShowAll').checked;
    const rows=vacRows.filter(r=>(all||r.employment_status!=='terminated')&&(!q||String(r.name).toLowerCase().includes(q)));
    $('vacRows').innerHTML=rows.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.employment_status!=='active'?` <span class="statusBadge ${r.employment_status}">${esc(statusText(r.employment_status))}</span>`:''}<div class="muted small">${esc(r.title||'')}</div></td><td>${Number(r.year_paid_hours).toFixed(2)}</td><td class="vacNum">${hd(r.year_earned)}</td><td class="vacNum">${hd(r.all_earned)}</td><td class="vacNum">${hd(r.used_hours)}</td><td class="vacNum vacBal${r.balance<0?' neg':''}">${hd(r.balance)}</td><td><button class="mini secondary" data-vac-rec="${r.employee_id}" type="button">Record taken</button></td></tr>`).join('')||'<tr><td colspan="7" class="muted">No employees match.</td></tr>';
    document.querySelectorAll('[data-vac-rec]').forEach(b=>b.onclick=()=>openVacPanel(vacRows.find(r=>r.employee_id===b.dataset.vacRec)));
  }
  async function openVacPanel(r){
    $('vacPanel').dataset.id=r.employee_id;$('vacPanelSub').textContent=`${r.name} · balance ${Number(r.balance).toFixed(2)} hours`;
    $('vacHours').value='';$('vacDate').value=iso(new Date());$('vacNoteIn').value='';$('vacPanelMsg').textContent='';$('vacHistory').textContent='Loading…';
    $('vacPanel').classList.remove('hide');$('vacHours').focus();
    try{const h=(await api(`/api/manager?view=vacation_history&employeeId=${encodeURIComponent(r.employee_id)}`)).history||[];
      $('vacHistory').innerHTML=h.length?h.map(x=>`<div class="vacHist"><b>${Number(x.hours).toFixed(2)} h</b> <span class="muted">· ${esc(x.taken_on)}${x.note?' · '+esc(x.note):''}</span></div>`).join(''):'<span class="muted">No vacation recorded yet.</span>';}catch{$('vacHistory').textContent='';}
  }
  async function saveVac(){
    const id=$('vacPanel').dataset.id,hours=Number($('vacHours').value),day=$('vacDate').value,msg=$('vacPanelMsg');
    if(!(hours>0))return msg.textContent='Enter the hours taken.';if(!day)return msg.textContent='Choose the date.';
    if(!confirm(`Record ${hours} vacation hours for ${(vacRows.find(r=>r.employee_id===id)||{}).name}? This cannot be undone from the app.`))return;
    msg.textContent='Saving…';
    try{await api('/api/manager',{method:'POST',body:JSON.stringify({action:'vacation_used',employeeId:Number(id),hours,takenOn:day,note:$('vacNoteIn').value.trim()})});$('vacPanel').classList.add('hide');toast('Vacation recorded.');await loadVacations();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  function openSupItem(it){
    const isNew=!it;$('supItemPanel').dataset.id=it?it.id:'';
    $('supItemTitle').textContent=isNew?'Add item':'Update item';
    $('supItemSub').textContent=isNew?'Painters will see it in their supplies list.':`Last changed ${supWhen(it.updated_at)}. Changing the quantity is recorded in Stock History.`;
    $('siName').value=it?.name||'';$('siCat').value=it?.category||($('supCatFilter').value||'');$('siUnit').value=it?.unit||'Piece';
    $('siQty').value=it?it.quantity:'';$('siFull').value=it&&it.full_qty?it.full_qty:'';$('supItemDelete').classList.toggle('hide',isNew);$('siActive').value=!it||it.active?'1':'0';
    $('supItemMsg').textContent='';$('supItemSave').textContent=isNew?'Add item':'Save';
    $('supItemPanel').classList.remove('hide');(isNew?$('siName'):$('siQty')).focus();
  }
  async function saveSupItem(){
    const id=$('supItemPanel').dataset.id,isNew=!id,msg=$('supItemMsg');
    const body={action:'item',name:$('siName').value.trim(),category:$('siCat').value.trim(),unit:$('siUnit').value.trim(),quantity:Number($('siQty').value||0),full_qty:$('siFull').value===''?'':Number($('siFull').value),active:$('siActive').value==='1'};
    if(!body.name)return msg.textContent='Enter an item name.';
    if(!Number.isInteger(body.quantity)||body.quantity<0)return msg.textContent='Quantity must be a whole number, 0 or more.';
    if(body.full_qty!==''&&(!Number.isInteger(body.full_qty)||body.full_qty<0))return msg.textContent='Full stock must be a whole number, 0 or more.';
    if(body.full_qty!==''&&body.full_qty>0&&body.quantity>body.full_qty)body.full_qty=body.quantity;
    if(!isNew)body.id=Number(id);
    msg.textContent='Saving…';
    try{await api('/api/supplies',{method:isNew?'POST':'PATCH',body:JSON.stringify(body)});$('supItemPanel').classList.add('hide');toast(isNew?'Item added.':'Item updated.');await loadSupplies();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  function initSupplies(){
    document.querySelectorAll('[data-sup-tab]').forEach(b=>b.onclick=()=>{supTab=b.dataset.supTab;renderSupplies();});
    $('supRefresh').onclick=loadSupplies;
    ['supSearch','supCatFilter','supLowOnly'].forEach(id=>$(id).addEventListener('input',renderSupplies));
    $('supLowOnly').addEventListener('change',renderSupplies);
    $('supAddItem').onclick=()=>openSupItem(null);
    $('supItemCancel').onclick=()=>$('supItemPanel').classList.add('hide');
    $('supItemSave').onclick=saveSupItem;
    $('supItemPanel').onclick=e=>{if(e.target===$('supItemPanel'))$('supItemPanel').classList.add('hide');};
    const tb=$('toggleSupLog'),body=$('supLogBody');tb.onclick=()=>setSection(tb,body,body.classList.contains('hide'));
    $('supItemDelete').onclick=()=>deleteSupItem(supData.items.find(i=>String(i.id)===$('supItemPanel').dataset.id));
    $('siQty').addEventListener('input',()=>{const q=Number($('siQty').value),f=Number($('siFull').value);if($('siFull').value!==''&&q>f)$('siFull').value=q;});
    const ts=$('toggleSupStock'),bs=$('supStockBody');ts.onclick=()=>setSection(ts,bs,bs.classList.contains('hide'),'Show items','Hide items');
    $('usagePrev').onclick=()=>{usageMonth=new Date(usageMonth.getFullYear(),usageMonth.getMonth()-1,1);loadUsage();};
    $('usageNext').onclick=()=>{usageMonth=new Date(usageMonth.getFullYear(),usageMonth.getMonth()+1,1);loadUsage();};
    document.querySelectorAll('[data-usage-mode]').forEach(b=>b.onclick=()=>{usageMode=b.dataset.usageMode;renderUsage();});
    document.querySelectorAll('[data-uni-tab]').forEach(b=>b.onclick=()=>{uniTab=b.dataset.uniTab;renderUniforms();});
    $('uniRefresh').onclick=loadUniforms;
    $('uniPriceSave').onclick=saveUniPrices;
    $('vacPrev').onclick=()=>{vacYear--;loadVacations();};$('vacNext').onclick=()=>{vacYear++;loadVacations();};
    $('vacSearch').oninput=renderVacations;$('vacShowAll').onchange=renderVacations;
    $('vacCancel').onclick=()=>$('vacPanel').classList.add('hide');$('vacSave').onclick=saveVac;
    $('vacPanel').onclick=e=>{if(e.target===$('vacPanel'))$('vacPanel').classList.add('hide');};
    pollSupplies();setInterval(pollSupplies,30000);
  }
  // Section menu: Dashboard, Employees, Supplies, Settings. Each section shows
  // its own cards (tagged data-page) in the original layout; the address keeps
  // the section (#/employees) so refresh and the back button stay put.
  const MGR_PAGES=['dashboard','vacations','supplies','uniforms','performance'];
  function setDrawer(open){
    const d=$('mgrDrawer'),s=$('mgrScrim'),b=$('mgrBurger');if(!d)return;
    d.classList.toggle('open',open);s.classList.toggle('hide',!open);b.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('drawerOpen',open);
  }
  const currentMgrPage=()=>{const pg=(location.hash.match(/^#\/(\w+)/)||[])[1];return MGR_PAGES.includes(pg)?pg:'dashboard';};
  function showMgrPage(){
    let pg=(location.hash.match(/^#\/(\w+)/)||[])[1];if(!MGR_PAGES.includes(pg))pg='dashboard';
    document.querySelectorAll('#managerApp [data-page]').forEach(el=>el.classList.toggle('pageOff',el.dataset.page!==pg));
    document.querySelectorAll('#managerApp [data-route]').forEach(a=>{const on=a.dataset.route===pg;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    // Close anything left open on the previous section.
    document.querySelectorAll('.weekCal').forEach(c=>c.classList.add('hide'));
    ['clockInEdit','customReview','empPanel','supItemPanel','vacPanel'].forEach(id=>{const m=$(id);if(m)m.classList.add('hide');});
    const open=(btn,body)=>{if($(body)&&$(body).classList.contains('hide'))setSection($(btn),$(body),true);};
    if(pg==='supplies'){loadSupplies();loadUsage();}
    if(pg==='uniforms')loadUniforms();
    if(pg==='vacations')loadVacations();
    document.title=({dashboard:'Dashboard',vacations:'Vacations',supplies:'Supplies',uniforms:'Uniforms',performance:'Performance'})[pg]+' · WorkClock Manager';{const n=(supKnownPending||0)+(uniKnownPending||0);if(n)document.title=`(${n}) `+document.title;}
    setDrawer(false);window.scrollTo(0,0);
  }
  function initMgrNav(){
    $('mgrBurger').onclick=()=>setDrawer(!$('mgrDrawer').classList.contains('open'));
    $('mgrDrawerClose').onclick=()=>setDrawer(false);
    $('mgrScrim').onclick=()=>setDrawer(false);
    $('drawerLogout').onclick=()=>$('logoutBtn').click();
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setDrawer(false);});
    window.addEventListener('hashchange',showMgrPage);
    showMgrPage();
  }
  async function startManagerApp(){
    $('managerLogin').classList.add('hide');$('managerApp').classList.remove('hide');$('mdate').value=iso(new Date());
    $('addEmployee').onclick=async()=>{const name=$('newName').value.trim(),title=$('newTitle').value.trim(),email=$('newEmail').value.trim(),wage=Number($('newWage').value||0),pin=$('newPin').value.trim();if(!name)return $('employeeMsg').textContent='Enter an employee name.';if(!Number.isFinite(wage)||wage<0)return $('employeeMsg').textContent='Enter a valid hourly wage.';if(!/^\d{4}$/.test(pin))return $('employeeMsg').textContent='PIN must be exactly 4 digits.';try{await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});['newName','newTitle','newEmail','newWage','newPin'].forEach(id=>$(id).value='');$('employeeMsg').textContent='Employee saved and PIN set.';toast('Employee saved and PIN set.');await loadPeople();await mgrRender();}catch(e){$('employeeMsg').textContent=displayMessage(e.payload||e.message);}};
    $('saveSettings').onclick=async()=>{try{const j=await api('/api/settings',{method:'PATCH',body:JSON.stringify({clock_out_radius_miles:Number($('radiusSetting').value),project_completed_min_paid_hours:Number($('projectMinSetting').value),max_active_employees:Number($('maxEmployeesSetting').value),data_retention_months:Number($('retentionSetting').value)})});const s=j.settings||{};$('radiusSetting').value=s.clock_out_radius_miles;$('projectMinSetting').value=s.project_completed_min_paid_hours;$('maxEmployeesSetting').value=s.max_active_employees;$('retentionSetting').value=s.data_retention_months;toast('Settings saved.');$('settingsMsg').textContent='Settings saved.';}catch(e){$('settingsMsg').textContent=e.message;}};
    $('changeManagerPasswordBtn').onclick=async()=>{const currentPassword=$('currentManagerPassword').value,newPassword=$('newManagerPassword').value,confirmPassword=$('confirmManagerPassword').value;if(!currentPassword||!newPassword||!confirmPassword)return $('managerPasswordMsg').textContent='Complete all password fields.';if(newPassword!==confirmPassword)return $('managerPasswordMsg').textContent='New passwords do not match.';try{await api('/api/manager-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('managerPasswordMsg').textContent='Password changed. Please sign in again.';setTimeout(()=>location.reload(),700);}catch(e){$('managerPasswordMsg').textContent=e.message;}};
    $('logoutBtn').onclick=async()=>{try{await api('/api/manager-auth',{method:'DELETE'});}catch{}location.href='/?manager=1';};
    $('forcePayMode').onchange=()=> $('forceCustomWrap').classList.toggle('hide',$('forcePayMode').value!=='custom');
    $('forceClockOutBtn').onclick=forceClockOut;
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
    $('empSearch').oninput=renderPeople;
    document.querySelectorAll('[data-emp-tab]').forEach(b=>b.onclick=()=>{empTab=b.dataset.empTab;renderPeople();});
    $('addEmpBtn').onclick=()=>openEmpPanel(null);
    $('empPanelCancel').onclick=closeEmpPanel;
    $('empPanelSave').onclick=saveEmpPanel;
    $('empPanel').onclick=e=>{if(e.target===$('empPanel'))closeEmpPanel();};
    $('epPin').oninput=()=>{$('epPin').value=$('epPin').value.replace(/\D/g,'').slice(0,4);};
    initSupplies();
    initMgrNav();
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
