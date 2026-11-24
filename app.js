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
  const fmtYmd=d=>d?new Date(d+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'}):'';

  /* Photos (licence): shrink to at most 1600 px as JPEG before upload. */
  const shrinkImage=(file,max=1600,q=0.82)=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',q));};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('bad image'));};img.src=url;});
  /* Month calendar of projects. Weeks start Monday. */
  const PROJ_COLORS=['#f97316','#2563eb','#16a34a','#9333ea','#db2777','#0891b2','#ca8a04','#dc2626'];
  function renderProjCal(el,month,projects,onPick,loc){
    const first=new Date(month.getFullYear(),month.getMonth(),1),start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
    const dows=[...Array(7)].map((_,i)=>{const d=new Date(2024,0,1+i);return d.toLocaleDateString(loc||[], {weekday:'short'});});
    const today=iso(new Date());let html=`<div class="calHead">${dows.map(d=>`<span>${esc(d)}</span>`).join('')}</div><div class="calGrid">`;
    for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=iso(d),out=d.getMonth()!==month.getMonth();
      if(i===35&&out)break;
      const on=projects.filter(p=>p.start_date<=k&&p.end_date>=k);
      html+=`<div class="calDay${out?' out':''}${k===today?' today':''}"><span class="calNum">${d.getDate()}</span>${on.slice(0,3).map(p=>`<button type="button" class="calChip" data-proj="${p.id}" style="background:${PROJ_COLORS[Number(p.id)%PROJ_COLORS.length]}" title="${esc(p.name)}">${esc(p.name)}</button>`).join('')}${on.length>3?`<span class="calMore">+${on.length-3}</span>`:''}</div>`;}
    el.innerHTML=html+'</div>';
    el.querySelectorAll('[data-proj]').forEach(b=>b.onclick=()=>onPick(projects.find(p=>String(p.id)===b.dataset.proj)));
  }
  const mapsLink=a=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
  const fileSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  const readAsDataURL=f=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=bad;r.readAsDataURL(f);});
  /* Starting supply catalog in Spanish. Items the manager adds later show as typed. */
  const SUP_ES={'Tape':'Cinta','Rollers':'Rodillos','Brushes':'Brochas','Buckets':'Cubetas','Trays':'Bandejas','Protection':'Protección','Preparation':'Preparación','Cleaning':'Limpieza','Accessories':'Accesorios','Safety':'Seguridad','Other':'Otros',
    'Roll':'Rollo','Piece':'Pieza','Pack':'Paquete','Box':'Caja',
    'Blue painter tape 1"':'Cinta azul de pintor 1"','Blue painter tape 1.5"':'Cinta azul de pintor 1.5"','Blue painter tape 2"':'Cinta azul de pintor 2"','Green delicate-surface tape':'Cinta verde para superficies delicadas',
    '9" roller cover':'Funda de rodillo 9"','14" roller cover':'Funda de rodillo 14"','4" roller cover':'Funda de rodillo 4"','9" roller frame':'Marco de rodillo 9"','14" roller frame':'Marco de rodillo 14"','4" roller frame':'Marco de rodillo 4"',
    '2" paintbrush':'Brocha 2"','2.5" paintbrush':'Brocha 2.5"','3" paintbrush':'Brocha 3"',
    '5-gallon bucket':'Cubeta de 5 galones','Handheld paint pail':'Cubo de pintura de mano','Bucket grid':'Rejilla para cubeta',
    'Paint tray':'Bandeja de pintura','Disposable tray liner':'Forro desechable para bandeja',
    'Plastic drop cloth':'Lona de plástico','Canvas drop cloth':'Lona de tela','Plastic covering box/dispenser':'Caja/dispensador de plástico protector',
    'Masking plastic':'Plástico para enmascarar','Masking paper':'Papel para enmascarar','Floor protection paper':'Papel protector de piso',
    'Sandpaper sheets':'Hojas de lija','Sanding sponges':'Esponjas de lijar','Sanding discs':'Discos de lija','Scrapers':'Raspadores','Putty knives':'Espátulas','Caulking gun':'Pistola de calafateo',
    'Utility knife blades':'Hojas de cúter','Rags':'Trapos','Cleaning sponges':'Esponjas de limpieza','Cleaning brushes':'Cepillos de limpieza','Trash bags':'Bolsas de basura',
    'Extension poles':'Palos de extensión','Roller bucket screens':'Rejillas para cubeta de rodillo','Paint strainers':'Coladores de pintura','Mixing sticks':'Palos para mezclar',
    'Disposable gloves':'Guantes desechables','Dust masks':'Mascarillas contra polvo','Safety glasses':'Lentes de seguridad'};
  const supT=x=>lang==='es'&&SUP_ES[x]?SUP_ES[x]:x;
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
    supWaiting:['Requested','Pedido'],supApproved:['Approved','Aprobado'],supGiven:['Delivered','Entregado'],
    supCustomTitle:['Something not on the list?','¿Algo que no está en la lista?'],supCustomName:['What do you need?','¿Qué necesita?'],supCustomAdd:['Add','Agregar'],supCustomTag:['Not on the list','No está en la lista'],supRemove:['Remove','Quitar'],supRejected:['Rejected','Rechazado'],supCancelled:['Cancelled','Cancelado'],
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
    uniKindLbl:['Free or paid','Gratis o pagado'],uniKindFree:['Free (from the company)','Gratis (de la compañía)'],uniKindPaid:['Paid (I buy it)','Pagado (yo lo compro)'],
    uniFreeHint:['The company gives a set number of each item free per {per}. When you reach it, choose Paid.','La compañía da un número fijo de cada prenda gratis por {per}. Cuando llegue al límite, elija Pagado.'],uniPerYear:['year','año'],uniPerMonth:['month','mes'],
    uniFreeLeft:['{n} free left this {per}','Le quedan {n} gratis este {per}'],uniNoFree:['No free left this {per}: choose Paid','No le quedan gratis este {per}: elija Pagado'],uniFreeSum:['Free: nothing is deducted','Gratis: no se descuenta nada'],
    uniFreeLimit:['You reached the free limit for one of the items. Choose Paid to order it.','Llegó al límite gratis de una de las prendas. Elija Pagado para pedirla.'],uniTagFree:['Free','Gratis'],uniTagPaid:['Paid','Pagado'],
    uniDeductNote:['The cost is taken off your pay in the week your manager gives you the items.','El costo se descuenta de su pago la semana en que su gerente le entrega las prendas.'],
    uniCost:['Cost ${t}','Costo ${t}'],uniFree:['Free from the company: nothing deducted','Gratis de la compañía: no se descuenta nada'],uniQty:['How many','Cuántas'],uniPickSize:['Choose a size for {item}.','Elija una talla para {item}.'],
    uniPickSome:['Choose at least one item and its size.','Elija al menos una prenda y su talla.'],uniTooMany:['You already have uniform requests waiting.','Ya tiene pedidos de uniforme en espera.'],
    uniDeduction:['UNIFORM DEDUCTION','DESCUENTO DE UNIFORME'],weekPay:['WEEK PAY','PAGO DE LA SEMANA'],
    navVacation:['Vacation','Vacaciones'],vacTitle:['My Vacation','Mis vacaciones'],
    vacHelp:['You earn 40 hours of vacation for every 2,080 paid hours you work: about 0.77 hours for each 40-hour week.','Gana 40 horas de vacaciones por cada 2,080 horas pagadas trabajadas: unas 0.77 horas por cada semana de 40 horas.'],
    vacBalance:['AVAILABLE NOW','DISPONIBLE AHORA'],vacEarnedYear:['EARNED THIS YEAR','GANADO ESTE AÑO'],vacEarnedAll:['EARNED IN TOTAL','GANADO EN TOTAL'],vacTaken:['VACATION TAKEN','VACACIONES USADAS'],
    vacHours:['hours','horas'],vacDays:['about {d} days of 8 hours','aprox. {d} días de 8 horas'],vacFrom:['from {h} paid hours','de {h} horas pagadas'],
    vacNote:['Hours are counted from your paid shifts once you clock out. To take vacation, talk to your manager; they record it here.','Las horas se cuentan de sus turnos pagados al marcar la salida. Para tomar vacaciones, hable con su gerente; él lo registra aquí.'],
    supUpdated:['Your manager answered a supply request.','Su gerente respondió un pedido de materiales.'],uniUpdated:['Your manager answered a uniform request.','Su gerente respondió un pedido de uniforme.'],
    navInfo:['My Info','Mis datos'],infoTitle:['My Info','Mis datos'],
    infoHelp:['Please fill in your details. Only you and your manager can see them. Your SSN and licence photo are stored encrypted.','Por favor complete sus datos. Solo usted y su gerente pueden verlos. Su SSN y la foto de su licencia se guardan cifrados.'],
    infoPersonal:['Personal','Personal'],infoFull:['Full name','Nombre completo'],infoDob:['Date of birth','Fecha de nacimiento'],infoAddr:['Address','Dirección'],infoPhone:['Phone','Teléfono'],infoEmail:['Email','Correo electrónico'],
    infoSsn:['Social Security Number (SSN)','Número de Seguro Social (SSN)'],infoSsnPh:['9 digits','9 dígitos'],infoSsnOn:['On file: {m}. Type a new one only to change it.','Guardado: {m}. Escriba uno nuevo solo para cambiarlo.'],infoSsnNone:['Not entered yet','Aún no ingresado'],
    infoLic:["Photo of your driver's licence",'Foto de su licencia de conducir'],infoLicOn:['On file. Take a new photo only to replace it.','Guardada. Tome una nueva foto solo para reemplazarla.'],infoLicNone:['No photo yet','Aún no hay foto'],infoLicNew:['New photo ready. Press Save.','Nueva foto lista. Presione Guardar.'],infoView:['View','Ver'],
    infoEmergency:['Emergency contact','Contacto de emergencia'],infoEmName:['Name','Nombre'],infoEmRel:['Relation to you','Parentesco'],infoEmRelPh:['e.g. Wife, Brother','p. ej. Esposa, Hermano'],
    infoJob:['Job','Trabajo'],infoStatus:['Job status','Estado de trabajo'],infoStart:['Start date','Fecha de inicio'],infoStartNone:['Set by your manager','Lo registra su gerente'],
    infoSave:['Save my info','Guardar mis datos'],infoSaved:['Your info was saved.','Sus datos se guardaron.'],infoSsnBad:['The SSN must have 9 digits.','El SSN debe tener 9 dígitos.'],
    infoMissing:['Still missing: {list}','Falta: {list}'],
    infoF_full_name:['full name','nombre'],infoF_dob:['date of birth','fecha de nacimiento'],infoF_address:['address','dirección'],infoF_phone:['phone','teléfono'],infoF_ssn_last4:['SSN','SSN'],infoF_emergency_name:['emergency contact','contacto de emergencia'],infoF_emergency_phone:['emergency phone','teléfono de emergencia'],infoF_emergency_relation:['relation','parentesco'],infoF_license:['licence photo','foto de licencia'],
    vacEligRule:['You need to complete your first full year to be eligible for paid vacation.','Debe completar su primer año completo para tener derecho a vacaciones pagadas.'],
    vacEligFrom:['You can use paid vacation from {d}.','Puede usar vacaciones pagadas a partir del {d}.'],vacEligYes:['You are eligible for paid vacation.','Ya tiene derecho a vacaciones pagadas.'],
    vacEligUnknown:['Your manager has not entered your start date yet.','Su gerente aún no ha ingresado su fecha de inicio.'],vacOpening:['includes {h} hours earned before WorkClock','incluye {h} horas ganadas antes de WorkClock'],
    navPerf:['Performance','Desempeño'],perfTitle:['My Performance','Mi desempeño'],perfMonthly:['Monthly','Mensual'],perfYearly:['Yearly','Anual'],
    perfHowTitle:['What makes up your score','Qué forma su puntaje'],
    perfR1:['Manager evaluation: up to 30%.','Evaluación del gerente: hasta 30%.'],
    perfR2:['Clocking in on time (first clock-in at 8:10 am or earlier): up to 10%.','Marcar la entrada a tiempo (primera entrada a las 8:10 am o antes): hasta 10%.'],
    perfR3:['Working 38.5 hours or more each week (over 40 counts too): up to 10%.','Trabajar 38.5 horas o más cada semana (más de 40 también cuenta): hasta 10%.'],
    perfR5:['Absent without notice in the month: none = 20%, once or more = 0%.','Ausencias sin aviso en el mes: ninguna = 20%, una o más = 0%.'],perfP5:['Absent without notice','Ausencias sin aviso'],perfAbs:['{n} this month','{n} este mes'],
    perfNotFinal:['Not final: your manager has not entered all of this month’s scores yet (evaluation, touch-ups, absences). The score shows the points possible so far.','No es final: su gerente aún no ingresó todos los puntajes del mes (evaluación, retoques, ausencias). El puntaje muestra los puntos posibles hasta ahora.'],perfNotFinalTag:['Not final','No final'],
    perfR4:['Customer touch-ups or complaints in the month: 0–1 = 30%, 2 = 10%, 3 or more = 0%.','Retoques o quejas de clientes en el mes: 0–1 = 30%, 2 = 10%, 3 o más = 0%.'],
    perfNoteTitle:['Why it matters','Por qué es importante'],
    perfNote1:['Your performance percentage affects your importance as an employee in the company.','Su porcentaje de desempeño afecta su importancia como empleado en la compañía.'],
    perfNote2:['It also affects any future bonus or yearly vacation the company offers. A perfect score is 85% and above.','También afecta cualquier bono futuro o vacaciones anuales que ofrezca la compañía. Un puntaje perfecto es 85% o más.'],
    perfP1:['Manager evaluation','Evaluación del gerente'],perfP2:['On-time clock-in','Entrada a tiempo'],perfP3:['Weekly hours','Horas semanales'],perfP4:['Touch-ups / complaints','Retoques / quejas'],
    perfDays:['{a} of {b} days on time','{a} de {b} días a tiempo'],perfWeeks:['{a} of {b} weeks with 38.5 h+','{a} de {b} semanas con 38.5 h+'],perfTouch:['{n} this month','{n} este mes'],
    perfPending:['Not entered yet','Aún no ingresado'],perfNoWork:['No shifts in this period.','No hay turnos en este periodo.'],perfPerfect:['Perfect','Perfecto'],perfAvg:['Average of {n} months','Promedio de {n} meses'],
    navProj:['My Projects','Mis proyectos'],navVeh:['My Vehicle','Mi vehículo'],navRes:['Job Resources','Recursos de trabajo'],
    projTitle:['My Projects','Mis proyectos'],projHelp:['Jobs you are assigned to, with the address and start and finish days.','Trabajos asignados a usted, con la dirección y los días de inicio y fin.'],
    projCrew:['Crew','Equipo'],projNone:['No one else yet','Nadie más todavía'],projEmpty:['No projects for you this month.','No tiene proyectos este mes.'],
    vehTitle:['My Vehicle','Mi vehículo'],vOdo:['Odometer at purchase','Odómetro al comprar'],vReg:['Registration date','Fecha de registro'],vRegExp:['Registration expires','Registro vence'],vInsp:['Current inspection','Inspección actual'],vInspExp:['Inspection expires','Inspección vence'],vExpReg:['Registration expires {d}','El registro vence {d}'],vExpInsp:['Inspection expires {d}','La inspección vence {d}'],vExpiredReg:['Registration EXPIRED {d}','Registro VENCIDO {d}'],vExpiredInsp:['Inspection EXPIRED {d}','Inspección VENCIDA {d}'],vehNone:['No vehicle is assigned to you.','No tiene un vehículo asignado.'],
    vPlate:['Plate','Placa'],vVin:['VIN','VIN'],vDriver:['Driver','Conductor'],vNone:['Not assigned','Sin asignar'],vMnt:['Maintenance history','Historial de mantenimiento'],vNoMnt:['No maintenance recorded yet.','Aún no hay mantenimiento registrado.'],vDate:['Date','Fecha'],vWhat:['What was done','Qué se hizo'],vMiles:['Mileage','Millaje'],vCost:['Cost','Costo'],vNotes:['Notes','Notas'],
    resTitle:['Job Resources','Recursos de trabajo'],resHelp:['These documents explain the job and how we work. Tap one to open it.','Estos documentos explican el trabajo y cómo trabajamos. Toque uno para abrirlo.'],resEmpty:['No documents yet.','Aún no hay documentos.'],resOpen:['Open','Abrir'],
    resK_handbook:['Employee Handbook','Manual del empleado'],resK_sop:['Standard Operating Procedure (SOP)','Procedimiento operativo estándar (SOP)'],resK_other:['Document','Documento'],
    perHour:['/hr','/hora'],prevLbl:['Previous','Anterior'],nextLbl:['Next','Siguiente'],qtyLbl:['Quantity','Cantidad'],
    navHelp:['Help','Ayuda'],helpTitle:['Help & Manual','Ayuda y manual'],helpIntro:['Search for a section or a question, then tap a topic to read how it works.','Busque una sección o una pregunta y toque un tema para leer cómo funciona.'],
    helpSearchPh:['Search: clock out, vacation, uniform…','Buscar: salida, vacaciones, uniforme…'],helpFound:['{n} topics found','{n} temas encontrados'],helpNone:['Nothing found. Try another word.','No se encontró nada. Pruebe otra palabra.'],helpGo:['Open this section','Abrir esta sección'],
    photoBad:['That file could not be read as a photo. Try again.','No se pudo leer ese archivo como foto. Intente de nuevo.'],
    menu:['Menu','Menú'],close:['Close','Cerrar'],navClock:['Time Clock','Reloj'],navSupplies:['Supplies','Materiales']
  };
  const DOWS = {en:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],es:['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']};
  const DAYNAMES = {en:['MON','TUE','WED','THU','FRI','SAT','SUN'],es:['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']};

  /* Server replies are English. Map the ones an employee can see, so a
     rejected clock-out or a locked PIN reads in their language too. */
  const SERVER_ES = {
    'Choose Free or Paid.':'Elija Gratis o Pagado.',
    'Choose an item, a size and a quantity from 1 to 20.':'Elija una prenda, una talla y una cantidad de 1 a 20.',
    'Choose at least one item and size.':'Elija al menos una prenda y su talla.',
    'Choose at least one item.':'Elija al menos un artículo.',
    'Each extra item needs a name and a quantity from 1 to 999.':'Cada artículo adicional necesita un nombre y una cantidad de 1 a 999.',
    'Each item needs a quantity from 1 to 999.':'Cada artículo necesita una cantidad de 1 a 999.',
    'Enter a valid email.':'Escriba un correo electrónico válido.',
    'One of the items is no longer available. Refresh and try again.':'Uno de los artículos ya no está disponible. Actualice e intente de nuevo.',
    'The SSN must have 9 digits.':'El SSN debe tener 9 dígitos.',
    'The licence photo is too large. Take it again a little further away.':'La foto de la licencia es demasiado grande. Tómela de nuevo un poco más lejos.',
    'The licence photo must be a JPG, PNG or WEBP image.':'La foto de la licencia debe ser una imagen JPG, PNG o WEBP.',
    'The note must be 500 characters or fewer.':'La nota debe tener 500 caracteres o menos.',
    'This request has already been handled.':'Este pedido ya fue atendido.',
    'Too many lines in one request.':'Demasiadas líneas en un pedido.',
    'Up to 40 items per request.':'Hasta 40 artículos por pedido.',
    'Up to 10 items that are not on the list.':'Hasta 10 artículos que no están en la lista.',
    'You already have several requests waiting. Wait for the manager, or cancel one.':'Ya tiene varios pedidos en espera. Espere a su gerente o cancele uno.',
    'You already have uniform requests waiting.':'Ya tiene pedidos de uniforme en espera.',
    'Valid start and end are required.':'Se requieren fechas de inicio y fin válidas.',
    'Choose a month or a year.':'Elija un mes o un año.',
    'Employee login required.':'Debe iniciar sesión como empleado.',
    'Login required.':'Debe iniciar sesión.',
    'Not found.':'No encontrado.',
    'Server error':'Error del servidor. Intente de nuevo.',
    'Request failed':'La solicitud falló. Intente de nuevo.',
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
    let ck=text.match(/^Check the (.+)\.$/);
    if(ck){const F={'full name':'el nombre completo','dob':'la fecha de nacimiento','address':'la dirección','phone':'el teléfono','email':'el correo','emergency name':'el nombre del contacto de emergencia','emergency phone':'el teléfono de emergencia','emergency relation':'el parentesco'};return `Revise ${F[ck[1]]||ck[1]}.`;}
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
    if($('employeeRecovery')&&!$('employeeRecovery').classList.contains('hide'))$('employeeRecoveryMsg').textContent=t('recoveryHelp');
    if(employeeIdentity&&$('employeeRateDisplay'))$('employeeRateDisplay').textContent=`$${Number((empCache?.employee||employeeIdentity).hourly_wage||0).toFixed(2)}${t('perHour')}`;
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
    if(employeeIdentity&&infoRec)renderEmpInfo(false);
    if(employeeIdentity&&empPage()==='performance')loadEmpPerf();
    if(employeeIdentity&&empPage()==='projects')loadEmpProjects();
    if(employeeIdentity&&empPage()==='vehicle')loadEmpVehicle();
    if(employeeIdentity&&empPage()==='resources')loadEmpResources();
    if(employeeIdentity&&empPage()==='help')renderHelp();
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
  function showEmployeeLogin(){employeeIdentity=null;empCache=null;{const el=$('empSectionName');if(el){el.dataset.i18n='brandSub';el.textContent=t('brandSub');}}clearInterval(empPollTimer);empCountsKnown=null;empCounts.supplies=0;empCounts.uniforms=0;if($('empBurgerDot'))setEmpCounts();if($('empBurger')){$('empBurger').classList.add('hide');setEmpDrawer(false);}$('employeeApp').classList.add('hide');$('employeeLogin').classList.remove('hide');$('employeeLoginError').textContent='';}
  function showEmployeeApp(emp){employeeIdentity=emp;$('employeeLogin').classList.add('hide');$('employeeApp').classList.remove('hide');$('employeeNameDisplay').textContent=emp.name||'—';$('employeeTitleDisplay').textContent=emp.title||'';$('employeeRateDisplay').textContent=`$${Number(emp.hourly_wage||0).toFixed(2)}${t('perHour')}`;setEmpWeek($('weekDate').value?new Date($('weekDate').value+'T12:00:00'):new Date(),false);loadEmployee();$('empBurger').classList.remove('hide');$('empDrawerName').textContent=emp.name||'';startEmpPoll();if(empPage()==='supplies')showEmpPage();else{showEmpPage();if(!$('empSupBody').classList.contains('hide'))loadEmpSupplies();}}
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
    $('employeeTitleDisplay').textContent=p.title||'';$('employeeRateDisplay').textContent=`$${Number(p.hourly_wage||0).toFixed(2)}${t('perHour')}`;
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
  let supEmp={items:[],requests:[]};const supCart=new Map();let supCustom=[];
  const supStatusText=st=>({pending:t('supWaiting'),approved:t('supApproved'),given:t('supGiven'),rejected:t('supRejected'),cancelled:t('supCancelled')}[st]||st);
  const supErr=e=>{const c=e.payload?.code;return c==='SUPPLY_EMPTY'?t('supPickSome'):c==='SUPPLY_TOO_MANY'?t('supTooMany'):c==='SUPPLY_GONE'?t('supGone'):c==='SUPPLY_QTY'?t('supQty'):c==='SUPPLY_HANDLED'?t('supHandled'):displayMessage(e.payload||e.message);};
  async function loadEmpSupplies(){try{supEmp=await api('/api/supplies?mine=1&seen=1');empCounts.supplies=0;setEmpCounts();for(const id of [...supCart.keys()])if(!supEmp.items.some(i=>String(i.id)===id))supCart.delete(id);renderEmpSupplies();}catch(e){if(e.status===401)return;$('empSupMsg').textContent=supErr(e);}}
  function renderEmpSupplies(){
    if(!$('empSupItems'))return;
    const q=($('empSupSearch').value||'').trim().toLowerCase();
    const items=supEmp.items.filter(i=>!q||[i.name,i.category,supT(i.name),supT(i.category)].join(' ').toLowerCase().includes(q));
    const cats=[...new Set(items.map(i=>i.category))];
    $('empSupItems').innerHTML=cats.map(c=>`<div class="supCat">${esc(supT(c))}</div>`+items.filter(i=>i.category===c).map(i=>{const n=supCart.get(String(i.id))||0;return `<div class="supPick${n?' on':''}"><div class="supPickName"><b>${esc(supT(i.name))}</b><span>${esc(supT(i.unit))}</span></div><div class="supStep"><button type="button" data-sup-dec="${i.id}" aria-label="${esc(t('supLess'))}"${n?'':' disabled'}>−</button><input data-sup-qty="${i.id}" inputmode="numeric" value="${n||''}" placeholder="0" aria-label="${esc(supT(i.name))}"/><button type="button" data-sup-inc="${i.id}" aria-label="${esc(t('supMore'))}">+</button></div></div>`;}).join('')).join('')||`<div class="dashEmpty">${esc(supEmp.items.length?t('supNoMatch'):t('supNoItems'))}</div>`;
    const set=(id,v)=>{v=Math.max(0,Math.min(999,Math.floor(Number(v)||0)));if(v)supCart.set(String(id),v);else supCart.delete(String(id));renderEmpSupplies();};
    document.querySelectorAll('[data-sup-dec]').forEach(b=>b.onclick=()=>set(b.dataset.supDec,(supCart.get(b.dataset.supDec)||0)-1));
    document.querySelectorAll('[data-sup-inc]').forEach(b=>b.onclick=()=>set(b.dataset.supInc,(supCart.get(b.dataset.supInc)||0)+1));
    document.querySelectorAll('[data-sup-qty]').forEach(inp=>inp.onchange=()=>set(inp.dataset.supQty,inp.value));
    $('empSupCustomList').innerHTML=supCustom.map((c,i)=>`<span class="customChip"><b>${esc(c.name)}</b> × ${c.qty}<button type="button" data-sup-cdel="${i}" aria-label="${esc(t('supRemove'))}">×</button></span>`).join('');
    document.querySelectorAll('[data-sup-cdel]').forEach(b=>b.onclick=()=>{supCustom.splice(Number(b.dataset.supCdel),1);renderEmpSupplies();});
    const picked=supCart.size+supCustom.length;
    $('empSupSummary').textContent=picked?t('supPicked',{n:picked}):'';
    $('empSupSendBtn').disabled=!picked;
    $('empSupMine').innerHTML=supEmp.requests.length?supEmp.requests.map(r=>`<div class="supMine st-${r.status}"><div class="supMineHead"><span class="supBadge ${r.status}">${esc(supStatusText(r.status))}</span><span class="muted small">${esc(new Date(r.created_at).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div><ul>${r.lines.map(l=>`<li><b>${esc(supT(l.item_name))}</b> <span class="muted">· ${esc(t('supAsked',{n:l.qty_requested+' '+supT(l.unit)}))}${r.status==='given'?' · '+esc(t('supGot',{n:(l.qty_given??0)+' '+supT(l.unit)})):''}</span></li>`).join('')}${(r.custom||[]).map(c=>`<li><b>${esc(c.name)}</b> <span class="customTag">${esc(t('supCustomTag'))}</span> <span class="muted">· ${esc(t('supAsked',{n:c.qty}))}${r.status==='given'?' · '+esc(t('supGot',{n:c.qty_given??0})):''}</span></li>`).join('')}</ul>${r.note?`<div class="muted small">“${esc(r.note)}”</div>`:''}${r.manager_note?`<div class="small"><b>${esc(t('supMgrNote'))}</b> ${esc(r.manager_note)}</div>`:''}${r.status==='pending'?`<button class="mini secondary" data-sup-cancel="${r.id}" type="button">${esc(t('supCancel'))}</button>`:''}</div>`).join(''):`<div class="dashEmpty">${esc(t('supNoneMine'))}</div>`;
    document.querySelectorAll('[data-sup-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm(t('supCancelAsk')))return;try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'cancel',id:Number(b.dataset.supCancel)})});}catch(e){toast(supErr(e),'bad');}loadEmpSupplies();});
  }
  async function sendEmpSupplies(){
    if(!supCart.size&&!supCustom.length)return $('empSupMsg').textContent=t('supPickSome');
    const btn=$('empSupSendBtn');btn.disabled=true;$('empSupMsg').textContent='';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'request',note:$('empSupNote').value.trim(),lines:[...supCart].map(([item_id,qty])=>({item_id:Number(item_id),qty})),custom:supCustom})});supCart.clear();supCustom=[];$('empSupNote').value='';$('empSupSearch').value='';toast(t('supSent'));$('empSupMsg').textContent=t('supSent');await loadEmpSupplies();}
    catch(e){$('empSupMsg').textContent=supErr(e);if(e.payload?.code==='SUPPLY_GONE')loadEmpSupplies();}
    finally{btn.disabled=!supCart.size;}
  }
  function initEmpSupplies(){
    const tb=$('toggleEmpSup'),body=$('empSupBody');
    tb.onclick=()=>{const open=body.classList.contains('hide');setSection(tb,body,open,t('supOpen'),t('supClose'));tb.dataset.i18n=open?'supClose':'supOpen';if(open)loadEmpSupplies();};
    $('empSupSearch').oninput=renderEmpSupplies;
    $('empSupSendBtn').onclick=sendEmpSupplies;
    $('empSupCustomAdd').onclick=()=>{const name=$('empSupCustomName').value.trim().replace(/\s+/g,' '),qty=Math.floor(Number($('empSupCustomQty').value||1));if(!name)return $('empSupCustomName').focus();if(!(qty>=1&&qty<=999))return;if(supCustom.length>=10)return;supCustom.push({name:name.slice(0,80),qty});$('empSupCustomName').value='';$('empSupCustomQty').value='1';renderEmpSupplies();};
  }


  /* ---- Employee: uniforms ---- */
  const UNI_KEYS=['tshirt_half','tshirt_full','trousers','jacket'],UNI_SZ=['XS','S','M','L','XL','XXL','3XL'];
  let uniEmp={requests:[],prices:{}},uniKind='free';const uniFreeLeft=k=>Number(uniEmp.freeLeft?.[k]??0),uniPer=()=>t(uniEmp.freePeriod==='month'?'uniPerMonth':'uniPerYear');const uniPrice=k=>Number(uniEmp.prices?.[k]??20);const uniPick={};UNI_KEYS.forEach(k=>uniPick[k]={size:'',qty:0});
  async function loadEmpUniforms(){try{uniEmp=await api('/api/supplies?mine=1&uniforms=1&seen=1');empCounts.uniforms=0;setEmpCounts();renderEmpUniforms();}catch(e){if(e.status!==401)$('empUniMsg').textContent=displayMessage(e.payload||e.message);}}
  function renderEmpUniforms(){
    if(!$('empUniItems'))return;
    $('empUniItems').innerHTML=UNI_KEYS.map(k=>{const p=uniPick[k];return `<div class="uniCard${p.qty?' on':''}"><div class="uniCardHead"><span class="uniIcon lg">${UNI_ICONS[k]}</span><div><b>${esc(t('uni_'+k))}</b><div class="uniPriceTag${uniKind==='free'&&!uniFreeLeft(k)?' none':''}">${esc(uniKind==='free'?(uniFreeLeft(k)?t('uniFreeLeft',{n:uniFreeLeft(k),per:uniPer()}):t('uniNoFree',{per:uniPer()})):t('uniEach',{p:uniPrice(k).toFixed(2)}))}</div></div></div><div class="uniSizeLbl">${esc(t('uniSize'))}</div><div class="uniSizes" role="group" aria-label="${esc(t('uniSize'))}">${UNI_SZ.map(z=>`<button type="button" class="uniSz${p.size===z?' on':''}" data-uni-size="${k}|${z}" aria-pressed="${p.size===z}">${z}</button>`).join('')}</div><div class="uniQtyRow"><span class="uniSizeLbl">${esc(t('uniQty'))}</span><div class="supStep"><button type="button" data-uni-dec="${k}" aria-label="${esc(t('supLess'))}"${p.qty?'':' disabled'}>−</button><input readonly value="${p.qty}" aria-label="${esc(t('uniQty'))}"/><button type="button" data-uni-inc="${k}" aria-label="${esc(t('supMore'))}">+</button></div></div></div>`;}).join('');
    document.querySelectorAll('[data-uni-size]').forEach(b=>b.onclick=()=>{const [k,z]=b.dataset.uniSize.split('|');uniPick[k].size=z;if(!uniPick[k].qty)uniPick[k].qty=1;renderEmpUniforms();});
    document.querySelectorAll('[data-uni-inc]').forEach(b=>{const k=b.dataset.uniInc,cap=uniKind==='free'?uniFreeLeft(k):20;if(uniPick[k].qty>=cap)b.disabled=true;b.onclick=()=>{const p=uniPick[k];p.qty=Math.min(cap,p.qty+1);renderEmpUniforms();};});
    document.querySelectorAll('[data-uni-size]').forEach(b=>{const k=b.dataset.uniSize.split('|')[0];if(uniKind==='free'&&!uniFreeLeft(k))b.disabled=true;});
    document.querySelectorAll('[data-uni-kind]').forEach(b=>{const on=b.dataset.uniKind===uniKind;b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false');});
    $('empUniKindHint').textContent=uniKind==='free'?t('uniFreeHint',{per:uniPer()}):'';$('empUniDeductNote').classList.toggle('hide',uniKind!=='paid');
    document.querySelectorAll('[data-uni-dec]').forEach(b=>b.onclick=()=>{const p=uniPick[b.dataset.uniDec];p.qty=Math.max(0,p.qty-1);renderEmpUniforms();});
    const n=UNI_KEYS.filter(k=>uniPick[k].qty).length,sum=UNI_KEYS.reduce((a,k)=>a+uniPick[k].qty*uniPrice(k),0);
    $('empUniSummary').innerHTML=n?`${esc(t('supPicked',{n}))} · <b>${esc(uniKind==='free'?t('uniFreeSum'):t('uniTotal',{t:sum.toFixed(2)}))}</b>`:'';$('empUniSendBtn').disabled=!n;
    $('empUniMine').innerHTML=uniEmp.requests.length?uniEmp.requests.map(r=>`<div class="supMine st-${r.status}"><div class="supMineHead"><span><span class="supBadge ${r.status}">${esc(supStatusText(r.status))}</span>${r.kind?`<span class="kindTag ${r.kind}">${esc(t(r.kind==='free'?'uniTagFree':'uniTagPaid'))}</span>`:''}</span><span class="muted small">${esc(new Date(r.created_at).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div><ul>${r.lines.map(l=>`<li><b>${esc(t('uni_'+l.item))}</b> <span class="muted">· ${esc(l.size)} × ${l.qty} · $${Number(l.amount||0).toFixed(2)}</span></li>`).join('')}</ul>${r.status==='given'&&r.free?`<div class="small uniFreeNote"><b>${esc(t('uniFree'))}</b></div>`:r.status!=='rejected'&&r.status!=='cancelled'?`<div class="small"><b>${esc(t('uniCost',{t:Number(r.total||0).toFixed(2)}))}</b></div>`:''}${r.note?`<div class="muted small">“${esc(r.note)}”</div>`:''}${r.manager_note?`<div class="small"><b>${esc(t('supMgrNote'))}</b> ${esc(r.manager_note)}</div>`:''}${r.status==='pending'?`<button class="mini secondary" data-uni-cancel="${r.id}" type="button">${esc(t('supCancel'))}</button>`:''}</div>`).join(''):`<div class="dashEmpty">${esc(t('supNoneMine'))}</div>`;
    document.querySelectorAll('[data-uni-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm(t('supCancelAsk')))return;try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_cancel',id:Number(b.dataset.uniCancel)})});}catch(e){toast(supErr(e),'bad');}loadEmpUniforms();});
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-uni-kind]');if(!b)return;uniKind=b.dataset.uniKind;if(uniKind==='free')UNI_KEYS.forEach(k=>{uniPick[k].qty=Math.min(uniPick[k].qty,uniFreeLeft(k));if(!uniPick[k].qty)uniPick[k].size='';});renderEmpUniforms();});
  async function sendEmpUniforms(){
    const lines=UNI_KEYS.filter(k=>uniPick[k].qty).map(k=>({item:k,size:uniPick[k].size,qty:uniPick[k].qty}));
    if(!lines.length)return $('empUniMsg').textContent=t('uniPickSome');
    const noSize=lines.find(l=>!l.size);if(noSize)return $('empUniMsg').textContent=t('uniPickSize',{item:t('uni_'+noSize.item)});
    const btn=$('empUniSendBtn');btn.disabled=true;$('empUniMsg').textContent='';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_request',kind:uniKind,note:$('empUniNote').value.trim(),lines})});UNI_KEYS.forEach(k=>uniPick[k]={size:'',qty:0});$('empUniNote').value='';toast(t('supSent'));$('empUniMsg').textContent=t('supSent');await loadEmpUniforms();}
    catch(e){const c=e.payload?.code;$('empUniMsg').textContent=c==='UNIFORM_TOO_MANY'?t('uniTooMany'):c==='UNIFORM_FREE_LIMIT'?t('uniFreeLimit'):c==='UNIFORM_EMPTY'?t('uniPickSome'):displayMessage(e.payload||e.message);btn.disabled=false;}
  }

  /* ---- Employee: answers from the manager, and vacation ---- */
  const empCounts={supplies:0,uniforms:0};let empCountsKnown=null,empPollTimer=null;
  function setEmpCounts(){
    [['empSupCount',empCounts.supplies],['empUniCount',empCounts.uniforms]].forEach(([id,n])=>{const el=$(id);if(el){el.textContent=n;el.classList.toggle('hide',!n);}});
    $('empBurgerDot')?.classList.toggle('hide',!(empCounts.supplies+empCounts.uniforms)&&!(infoRec?.missing?.length));
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
  function startEmpPoll(){api('/api/company?area=menu').then(j=>$('empVehLink').classList.toggle('hide',!j.hasVehicle)).catch(()=>{});api('/api/records?mine=1').then(j=>{infoRec={...j.record,_status:j.status};renderEmpInfo(empPage()==='info');}).catch(()=>{});pollEmpCounts();clearInterval(empPollTimer);empPollTimer=setInterval(pollEmpCounts,60000);}
  async function loadEmpVacation(){
    try{const v=(await api('/api/supplies?mine=1&vacation=1')).vacation||{year_paid_hours:0,year_earned:0,all_earned:0,used_hours:0,balance:0};
      const h=x=>`${Number(x).toFixed(2)} ${t('vacHours')}`;
      $('vBal').textContent=h(v.balance);$('vBalDays').textContent=t('vacDays',{d:(Math.max(0,v.balance)/8).toFixed(1)});
      $('vYear').textContent=h(v.year_earned);$('vYearHrs').textContent=t('vacFrom',{h:Number(v.year_paid_hours).toFixed(2)});
      $('vAll').textContent=h(v.all_earned);$('vUsed').textContent=h(v.used_hours);$('vacMsg').textContent='';
      $('vacElig').innerHTML=`<b>${esc(t('vacEligRule'))}</b><br>${esc(v.start_date?(v.eligible?t('vacEligYes'):t('vacEligFrom',{d:fmtYmd(v.eligible_from)})):t('vacEligUnknown'))}${v.opening_hours?`<br><span class="small">${esc(t('vacOpening',{h:Number(v.opening_hours).toFixed(2)}))}</span>`:''}`;
      $('vacElig').classList.toggle('ok',!!v.eligible);
    }catch(e){if(e.status!==401)$('vacMsg').textContent=displayMessage(e.payload||e.message);}
  }

  /* ---- Employee: My Info ---- */
  let infoRec=null,infoLic=null;
  async function loadEmpInfo(){
    try{const j=await api('/api/records?mine=1');infoRec=j.record;infoRec._status=j.status;renderEmpInfo(true);}catch(e){if(e.status!==401)$('infoMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function renderEmpInfo(fill){
    const r=infoRec;if(!r)return;
    if(fill){const v=(id,x)=>{$(id).value=x??'';};v('iFull',r.full_name||employeeIdentity?.name);v('iDob',r.dob);v('iAddr',r.address);v('iPhone',r.phone);v('iEmail',r.email);v('iEmName',r.emergency_name);v('iEmPhone',r.emergency_phone);v('iEmRel',r.emergency_relation);v('iSsn','');v('iLic','');infoLic=null;$('iLicImg').classList.add('hide');}
    $('iSsnShown').textContent=r.ssn_masked?t('infoSsnOn',{m:r.ssn_masked}):t('infoSsnNone');
    $('iLicState').textContent=infoLic?t('infoLicNew'):r.has_license?t('infoLicOn'):t('infoLicNone');$('iLicView').classList.toggle('hide',!r.has_license||!!infoLic);
    $('iStatus').value=statusText(r._status||'active');$('iStart').value=r.start_date?fmtYmd(r.start_date):t('infoStartNone');
    const miss=r.missing||[];$('infoMissing').classList.toggle('hide',!miss.length);$('infoMissing').textContent=miss.length?t('infoMissing',{list:miss.map(k=>t('infoF_'+k)).join(', ')}):'';
    $('empInfoDot').classList.toggle('hide',!miss.length);$('empBurgerDot')?.classList.toggle('hide',!(empCounts.supplies+empCounts.uniforms)&&!miss.length);
  }
  async function saveEmpInfo(){
    const body={action:'mine',full_name:$('iFull').value,dob:$('iDob').value,address:$('iAddr').value,phone:$('iPhone').value,email:$('iEmail').value,emergency_name:$('iEmName').value,emergency_phone:$('iEmPhone').value,emergency_relation:$('iEmRel').value};
    if($('iSsn').value.trim()){if($('iSsn').value.replace(/\D/g,'').length!==9)return $('infoMsg').textContent=t('infoSsnBad');body.ssn=$('iSsn').value;}
    if(infoLic)body.license=infoLic;
    const btn=$('infoSave');btn.disabled=true;$('infoMsg').textContent='…';
    try{const j=await api('/api/records?mine=1',{method:'PATCH',body:JSON.stringify(body)});infoRec={...j.record,_status:infoRec?._status};renderEmpInfo(true);$('infoMsg').textContent=t('infoSaved');toast(t('infoSaved'));}
    catch(e){$('infoMsg').textContent=displayMessage(e.payload||e.message);}finally{btn.disabled=false;}
  }
  function initEmpInfo(){
    $('infoSave').onclick=saveEmpInfo;
    $('iLic').onchange=async()=>{const f=$('iLic').files[0];if(!f)return;try{infoLic=await shrinkImage(f);$('iLicImg').src=infoLic;$('iLicImg').classList.remove('hide');renderEmpInfo(false);}catch{toast(t('photoBad'),'bad');}};
    $('iLicView').onclick=async()=>{try{const j=await api('/api/records?mine=1&license=1');if(j.image){$('iLicImg').src=j.image;$('iLicImg').classList.remove('hide');}}catch{}};
  }

  /* ---- Employee: Performance ---- */
  let ePerfMode='month',ePerfMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),ePerfYear=new Date().getFullYear();
  const pctBar=(v,max)=>`<div class="perfMeter${v==null?'':v/max>=0.85?' great':v/max>=0.6?' mid':' low'}"><i style="width:${v==null?0:Math.round(v/max*100)}%"></i></div>`;
  async function loadEmpPerf(){
    document.querySelectorAll('[data-perf-mode]').forEach(b=>b.classList.toggle('on',b.dataset.perfMode===ePerfMode));
    const now=new Date();
    $('ePerfLabel').textContent=ePerfMode==='year'?String(ePerfYear):ePerfMonth.toLocaleDateString(locale(),{month:'long',year:'numeric'});
    $('ePerfNext').disabled=ePerfMode==='year'?ePerfYear>=now.getFullYear():(ePerfMonth.getFullYear()===now.getFullYear()&&ePerfMonth.getMonth()===now.getMonth());
    try{
      if(ePerfMode==='year'){
        const j=await api(`/api/performance?mine=1&year=${ePerfYear}`),me=j.me;
        $('ePerfParts').innerHTML='';
        $('ePerfScore').innerHTML=me&&me.average!=null?`<strong class="${me.average>=85?'great':''}">${me.average.toFixed(1)}%</strong>${me.average>=85&&me.final?`<span class="perfTag">${esc(t('perfPerfect'))}</span>`:''}${me.final?'':`<span class="notFinal">${esc(t('perfNotFinalTag'))}</span>`}<small>${esc(t('perfAvg',{n:me.months_worked}))}</small>`:`<small>${esc(t('perfNoWork'))}</small>`;
        $('ePerfYear').innerHTML=me?(j.months||[]).map(m=>{const v=me.months[m];return `<div class="perfYearItem"><span>${esc(new Date(m+'-15T12:00:00').toLocaleDateString(locale(),{month:'short'}))}</span>${pctBar(v,100)}<b>${v==null?'—':v.toFixed(0)+'%'}</b></div>`;}).join(''):'';
      }else{
        const mo=`${ePerfMonth.getFullYear()}-${String(ePerfMonth.getMonth()+1).padStart(2,'0')}`;
        const j=await api(`/api/performance?mine=1&month=${mo}`),me=j.me;$('ePerfYear').innerHTML='';
        if(!me||!me.worked){$('ePerfScore').innerHTML=`<small>${esc(t('perfNoWork'))}</small>`;$('ePerfParts').innerHTML='';return;}
        $('ePerfScore').innerHTML=me.total==null?`<small>${esc(t('perfNoWork'))}</small>`:`<strong class="${me.total>=85&&me.final?'great':''}">${me.total.toFixed(1)}%</strong>${me.total>=85&&me.final?`<span class="perfTag">${esc(t('perfPerfect'))}</span>`:''}${me.final?'':`<span class="notFinal">${esc(t('perfNotFinalTag'))}</span><small class="notFinalNote">${esc(t('perfNotFinal'))}</small>`}`;
        const p=me.points,row=(name,v,max,sub)=>`<div class="perfPart"><div class="perfPartHead"><b>${esc(name)}</b><span>${v==null?esc(t('perfPending')):v.toFixed(1)+'%'} / ${max}%</span></div>${pctBar(v,max)}<small>${esc(sub)}</small></div>`;
        $('ePerfParts').innerHTML=row(t('perfP1'),p.evaluation,30,'')+row(t('perfP2'),p.on_time,10,me.days_worked?t('perfDays',{a:me.days_on_time,b:me.days_worked}):'')+row(t('perfP3'),p.hours,10,me.weeks_worked?t('perfWeeks',{a:me.weeks_met,b:me.weeks_worked}):'')+row(t('perfP4'),p.touchups,30,me.touchups==null?'':t('perfTouch',{n:me.touchups}))+row(t('perfP5'),p.absences,20,me.absences==null?'':t('perfAbs',{n:me.absences}));
      }
      $('ePerfMsg').textContent='';
    }catch(e){if(e.status!==401)$('ePerfMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function initEmpPerf(){
    document.querySelectorAll('[data-perf-mode]').forEach(b=>b.onclick=()=>{ePerfMode=b.dataset.perfMode;loadEmpPerf();});
    $('ePerfPrev').onclick=()=>{if(ePerfMode==='year')ePerfYear--;else ePerfMonth=new Date(ePerfMonth.getFullYear(),ePerfMonth.getMonth()-1,1);loadEmpPerf();};
    $('ePerfNext').onclick=()=>{if(ePerfMode==='year')ePerfYear++;else ePerfMonth=new Date(ePerfMonth.getFullYear(),ePerfMonth.getMonth()+1,1);loadEmpPerf();};
  }

  /* ---- Employee: Projects, Vehicle, Resources ---- */
  let eProjMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),eProjRows=[];
  async function loadEmpProjects(){
    $('eProjMonth').textContent=eProjMonth.toLocaleDateString(locale(),{month:'long',year:'numeric'});
    const s=new Date(eProjMonth.getFullYear(),eProjMonth.getMonth(),1),e=new Date(eProjMonth.getFullYear(),eProjMonth.getMonth()+1,0);
    try{eProjRows=(await api(`/api/company?area=projects&start=${iso(new Date(s.getTime()-7*864e5))}&end=${iso(new Date(e.getTime()+7*864e5))}`)).projects||[];}catch{eProjRows=[];}
    const L=k=>({crew:t('projCrew'),none:t('projNone'),map:'Map'}[k]);
    const show=p=>{const el=document.querySelector(`#eProjList [data-p="${p.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1200);}};
    renderProjCal($('eProjCal'),eProjMonth,eProjRows,show,locale());
    const inMonth=eProjRows.filter(p=>p.start_date<=iso(e)&&p.end_date>=iso(s));
    $('eProjList').innerHTML=inMonth.map(p=>`<div data-p="${p.id}">${projectRow(p,false,L)}</div>`).join('')||`<div class="dashEmpty">${esc(t('projEmpty'))}</div>`;
  }
  async function loadEmpVehicle(){
    try{const v=(await api('/api/company?area=vehicles')).vehicles||[];const L=k=>t({odo:'vOdo',reg:'vReg',regExp:'vRegExp',insp:'vInsp',inspExp:'vInspExp',expReg:'vExpReg',expInsp:'vExpInsp',expiredReg:'vExpiredReg',expiredInsp:'vExpiredInsp',plate:'vPlate',vin:'vVin',driver:'vDriver',none:'vNone',mnt:'vMnt',noMnt:'vNoMnt',date:'vDate',what:'vWhat',miles:'vMiles',cost:'vCost',notes:'vNotes'}[k]);
      $('eVehList').innerHTML=v.map(x=>vehicleCard(x,false,L)).join('')||`<div class="dashEmpty">${esc(t('vehNone'))}</div>`;}catch{}
  }
  async function loadEmpResources(){
    try{const r=(await api('/api/company?area=resources')).resources||[];
      const catName=c=>c==='Employee Handbook'?t('resK_handbook'):c==='SOP'?t('resK_sop'):c==='Other'?t('resK_other'):c;
      $('eResList').innerHTML=resGroups(r).map(([c,rows])=>`<div class="supCat">${esc(catName(c))}</div>`+rows.map(x=>`<a class="resRow resLink" href="/api/company?file=${x.id}" target="_blank" rel="noopener"><span class="resIcon">${fileTag(x.mime)}</span><div class="resMain"><b>${esc(x.title)}</b><span class="muted small">${fileSize(x.size)}</span></div><span class="mini secondary">${esc(t('resOpen'))}</span></a>`).join('')).join('')||`<div class="dashEmpty">${esc(t('resEmpty'))}</div>`;}catch{}
  }
  function initEmpCompany(){
    $('eProjPrev').onclick=()=>{eProjMonth=new Date(eProjMonth.getFullYear(),eProjMonth.getMonth()-1,1);loadEmpProjects();};
    $('eProjNext').onclick=()=>{eProjMonth=new Date(eProjMonth.getFullYear(),eProjMonth.getMonth()+1,1);loadEmpProjects();};
  }

  /* ---- Employee: Help & Manual (searchable, English and Spanish) ---- */
  const HELP=[
    {id:'signin',en:{t:'Signing in and your PIN',k:'login log in password pin forgot',b:['Sign in with your full name exactly as your manager added it, and your private 4-digit PIN.','Forgot your PIN? Tap “Forgot your PIN?”, type your name and send the request. Your manager will set a new PIN. Your PIN is never sent by email.','After too many wrong tries, sign-in is paused for a short time. Wait and try again.']},
     es:{t:'Iniciar sesión y su PIN',k:'entrar contraseña pin olvidé',b:['Inicie sesión con su nombre completo, tal como lo registró su gerente, y su PIN privado de 4 dígitos.','¿Olvidó su PIN? Toque “¿Olvidó su PIN?”, escriba su nombre y envíe la solicitud. Su gerente le pondrá un PIN nuevo. Su PIN nunca se envía por correo.','Después de varios intentos fallidos, el inicio de sesión se pausa por un rato. Espere e intente de nuevo.']}},
    {id:'menu',en:{t:'The menu and language',k:'menu sidebar spanish english language red dot',b:['Tap ☰ (top left) to open the menu and move between sections.','A red dot on ☰ or a red number in the menu means something needs your attention, for example your manager answered a request, or My Info is missing details.','Tap “Español” / “English” at the top to switch the whole app between Spanish and English.']},
     es:{t:'El menú y el idioma',k:'menú barra lateral español inglés idioma punto rojo',b:['Toque ☰ (arriba a la izquierda) para abrir el menú y moverse entre secciones.','Un punto rojo en ☰ o un número rojo en el menú significa que algo necesita su atención; por ejemplo, su gerente respondió un pedido o faltan datos en Mis datos.','Toque “Español” / “English” arriba para cambiar toda la aplicación entre español e inglés.']}},
    {id:'clockin',page:'clock',en:{t:'Clock In',k:'start shift gps location clock in',b:['Go to Time Clock and tap Clock In when you start work.','Allow location (GPS) when your phone asks. Your location is saved with the clock-in.','Your time starts counting right away and shows on the screen.']},
     es:{t:'Marcar entrada',k:'empezar turno gps ubicación entrada',b:['Vaya a Reloj y toque Marcar entrada cuando empiece a trabajar.','Permita la ubicación (GPS) cuando su teléfono lo pida. Su ubicación se guarda con la entrada.','Su tiempo empieza a contar enseguida y se ve en la pantalla.']}},
    {id:'clockout',page:'clock',en:{t:'Clock Out',k:'end shift reason distance message clock out',b:['Tap Clock Out when you finish. Allow location again.','You must be within the distance your manager set from where you clocked in. If you are too far, the clock-out is refused or sent to your manager to review.','If you leave before 8 hours, choose a reason from the list. You can also add a short message for your manager.']},
     es:{t:'Marcar salida',k:'terminar turno motivo distancia mensaje salida',b:['Toque Marcar salida cuando termine. Permita la ubicación otra vez.','Debe estar dentro de la distancia que fijó su gerente desde donde marcó la entrada. Si está muy lejos, la salida se rechaza o se envía a su gerente para revisión.','Si se va antes de 8 horas, elija un motivo de la lista. También puede escribir un mensaje corto para su gerente.']}},
    {id:'week',page:'clock',en:{t:'Weekly Summary and pay',k:'hours week earned paid deduction pay calendar',b:['Weekly Summary shows your paid hours for each day, the week total and what you earned. Use ‹ › or the calendar to see other weeks.','Boxes at the top show clock-outs that were denied and days waiting for your manager’s approval.','If you got a uniform you are paying for, the week also shows “Uniform deduction” and “Week pay” (what you are paid after the deduction).']},
     es:{t:'Resumen semanal y pago',k:'horas semana ganado pagado descuento pago calendario',b:['El Resumen semanal muestra sus horas pagadas de cada día, el total de la semana y lo que ganó. Use ‹ › o el calendario para ver otras semanas.','Los recuadros de arriba muestran salidas rechazadas y días que esperan la aprobación de su gerente.','Si recibió un uniforme que usted paga, la semana también muestra “Descuento de uniforme” y “Pago de la semana” (lo que recibe después del descuento).']}},
    {id:'report',page:'clock',en:{t:'My Report',k:'report history months days earnings',b:['At the bottom of Time Clock, open My Report to see your working days, hours and earnings over a longer time.','Pick a quick range or choose a start and end date.']},
     es:{t:'Mi reporte',k:'reporte historial meses días ganancias',b:['Al final de Reloj, abra Mi reporte para ver sus días trabajados, horas y ganancias en un periodo más largo.','Elija un rango rápido o una fecha de inicio y de fin.']}},
    {id:'supplies',page:'supplies',en:{t:'Requesting supplies',k:'supplies tape rollers brushes request materials not on the list',b:['Open Supplies, search or scroll, and use + / − to choose how many of each item you need.','Need something that is not on the list? Type it under “Something not on the list?” and tap Add.','Add a note if you like, then tap Send request. Your manager is notified.']},
     es:{t:'Pedir materiales',k:'materiales cinta rodillos brochas pedido no está en la lista',b:['Abra Materiales, busque o desplácese, y use + / − para elegir cuántos de cada artículo necesita.','¿Necesita algo que no está en la lista? Escríbalo en “¿Algo que no está en la lista?” y toque Agregar.','Agregue una nota si quiere y toque Enviar pedido. Se avisa a su gerente.']}},
    {id:'status',page:'supplies',en:{t:'Request status: Requested, Approved, Delivered',k:'status approved delivered rejected cancel requested waiting',b:['Requested: your manager has your request.','Approved: your manager accepted it and will hand it to you.','Delivered: you received it. It shows how many you got.','Rejected: not approved; your manager may leave a note explaining why.','While a request is still Requested, you can cancel it.']},
     es:{t:'Estado del pedido: Pedido, Aprobado, Entregado',k:'estado aprobado entregado rechazado cancelar pedido espera',b:['Pedido: su gerente tiene su pedido.','Aprobado: su gerente lo aceptó y se lo entregará.','Entregado: usted lo recibió. Muestra cuántos recibió.','Rechazado: no fue aprobado; su gerente puede dejar una nota explicando por qué.','Mientras un pedido esté en Pedido, puede cancelarlo.']}},
    {id:'uniforms',page:'uniforms',en:{t:'Uniforms, sizes and cost',k:'uniform shirt t-shirt trousers pants jacket size price cost deduction free paid limit left',b:['Open Uniforms and first choose Free (from the company) or Paid (I buy it). Then choose a size (XS to 3XL) for each item you need and how many, and tap Send request.','Free: the company gives a set number of each item free per month or year. Each item shows how many free you have left. When none are left, choose Paid.','Paid: each item shows its price. When your manager delivers it, the cost is taken off your pay that week.','My requests shows each request with a Free or Paid tag and its status.']},
     es:{t:'Uniformes, tallas y costo',k:'uniforme camisa camiseta pantalón chaqueta talla precio costo descuento gratis pagado límite quedan',b:['Abra Uniformes y primero elija Gratis (de la compañía) o Pagado (yo lo compro). Luego elija una talla (XS a 3XL) para cada prenda que necesite y cuántas, y toque Enviar pedido.','Gratis: la compañía da un número fijo de cada prenda gratis por mes o por año. Cada prenda muestra cuántas gratis le quedan. Cuando no le queden, elija Pagado.','Pagado: cada prenda muestra su precio. Cuando su gerente se la entrega, el costo se descuenta de su pago esa semana.','Mis pedidos muestra cada pedido con la etiqueta Gratis o Pagado y su estado.']}},
    {id:'vacation',page:'vacation',en:{t:'Vacation',k:'vacation holiday time off balance earned eligible first year',b:['You earn 40 hours of vacation for every 2,080 paid hours (about 0.77 hours per 40-hour week).','You need to complete your first full year (from your start date) to be eligible for paid vacation. The Vacation page shows the date you become eligible.','“Available now” is what you have earned minus what you have taken. To take vacation, talk to your manager; they record it.']},
     es:{t:'Vacaciones',k:'vacaciones descanso saldo ganado derecho primer año',b:['Gana 40 horas de vacaciones por cada 2,080 horas pagadas (unas 0.77 horas por semana de 40 horas).','Debe completar su primer año completo (desde su fecha de inicio) para tener derecho a vacaciones pagadas. La página de Vacaciones muestra la fecha en que tendrá derecho.','“Disponible ahora” es lo que ha ganado menos lo que ha usado. Para tomar vacaciones, hable con su gerente; él lo registra.']}},
    {id:'performance',page:'performance',en:{t:'Performance score',k:'performance score evaluation on time hours touch-up complaint bonus 85',b:['Your score each month adds up to 100% from five parts: manager evaluation (up to 30%), clocking in on time at 8:10 am or earlier (up to 10%), working 38.5 hours or more each week, over 40 included (up to 10%), customer touch-ups or complaints (0–1 = 30%, 2 = 10%, 3 or more = 0%), and being absent without notice (none = 20%, once or more = 0%).','Until your manager enters all of the month’s scores (evaluation, touch-ups, absences), the score is “Not final” and shows the points possible so far.','Switch between Monthly and Yearly. The year is the average of the months you worked.','Your score affects your importance in the company and any future bonus or yearly vacation. 85% and above is perfect.']},
     es:{t:'Puntaje de desempeño',k:'desempeño puntaje evaluación a tiempo horas retoque queja bono 85',b:['Su puntaje de cada mes suma 100% con cinco partes: evaluación del gerente (hasta 30%), marcar la entrada a tiempo a las 8:10 am o antes (hasta 10%), trabajar 38.5 horas o más cada semana, incluso más de 40 (hasta 10%), retoques o quejas de clientes (0–1 = 30%, 2 = 10%, 3 o más = 0%), y ausencias sin aviso (ninguna = 20%, una o más = 0%).','Hasta que su gerente ingrese todos los puntajes del mes (evaluación, retoques, ausencias), el puntaje “No es final” y muestra los puntos posibles hasta ahora.','Cambie entre Mensual y Anual. El año es el promedio de los meses trabajados.','Su puntaje afecta su importancia en la compañía y cualquier bono futuro o vacaciones anuales. 85% o más es perfecto.']}},
    {id:'projects',page:'projects',en:{t:'My Projects',k:'projects jobs calendar address map crew start finish',b:['My Projects shows a calendar of the jobs you are assigned to.','Tap a job to see the address (tap it to open the map), the start and finish days, and who else is on the crew.']},
     es:{t:'Mis proyectos',k:'proyectos trabajos calendario dirección mapa equipo inicio fin',b:['Mis proyectos muestra un calendario de los trabajos que tiene asignados.','Toque un trabajo para ver la dirección (tóquela para abrir el mapa), los días de inicio y fin, y quién más está en el equipo.']}},
    {id:'vehicle',page:'vehicle',en:{t:'My Vehicle',k:'vehicle truck van car plate vin maintenance',b:['If a company vehicle is assigned to you, My Vehicle appears in the menu.','It shows the year, make, model, plate, VIN and the maintenance history.']},
     es:{t:'Mi vehículo',k:'vehículo camioneta carro placa vin mantenimiento',b:['Si tiene asignado un vehículo de la compañía, Mi vehículo aparece en el menú.','Muestra el año, la marca, el modelo, la placa, el VIN y el historial de mantenimiento.']}},
    {id:'resources',page:'resources',en:{t:'Job Resources',k:'handbook sop documents pdf rules procedure',b:['Job Resources has the Employee Handbook and the Standard Operating Procedure (SOP) as PDFs.','Tap a document to open it. These explain the job and how we work.']},
     es:{t:'Recursos de trabajo',k:'manual sop documentos pdf reglas procedimiento',b:['Recursos de trabajo tiene el Manual del empleado y el Procedimiento operativo estándar (SOP) en PDF.','Toque un documento para abrirlo. Explican el trabajo y cómo trabajamos.']}},
    {id:'info',page:'info',en:{t:'My Info',k:'personal details address phone ssn licence license emergency contact privacy',b:['Fill in your personal details when you are hired: name, date of birth, address, phone, email, SSN, emergency contact and a photo of your driver’s licence.','Only you and your manager can see them. Your SSN and licence photo are stored encrypted; your SSN shows only the last 4 digits.','Your job status and start date are set by your manager.']},
     es:{t:'Mis datos',k:'datos personales dirección teléfono ssn licencia contacto de emergencia privacidad',b:['Complete sus datos personales cuando lo contraten: nombre, fecha de nacimiento, dirección, teléfono, correo, SSN, contacto de emergencia y una foto de su licencia de conducir.','Solo usted y su gerente pueden verlos. Su SSN y la foto de su licencia se guardan cifrados; su SSN muestra solo los últimos 4 dígitos.','Su estado de trabajo y su fecha de inicio los registra su gerente.']}},
    {id:'privacy',en:{t:'Privacy and signing out',k:'privacy sign out logout security',b:['Your time, earnings and location records are private to your login.','On a shared phone, open the menu and tap Sign Out when you finish.']},
     es:{t:'Privacidad y cerrar sesión',k:'privacidad cerrar sesión salir seguridad',b:['Sus registros de tiempo, ganancias y ubicación son privados para su inicio de sesión.','En un teléfono compartido, abra el menú y toque Cerrar sesión al terminar.']}}
  ];
  const fold=x=>String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  let helpOpen=new Set();
  function renderHelp(){
    const q=fold($('helpSearch').value.trim()),words=q.split(/\s+/).filter(Boolean);
    const L=lang==='es'?'es':'en';
    const hits=HELP.filter(h=>{const c=h[L],hay=fold([c.t,c.k,...c.b].join(' '));return words.every(w=>hay.includes(w));});
    $('helpCount').textContent=q?(hits.length?t('helpFound',{n:hits.length}):t('helpNone')):'';
    const mark=txt=>{let out=esc(txt);if(!words.length)return out;for(const w of words){const f=fold(txt);let i=f.indexOf(w);if(i<0)continue;const raw=txt.slice(i,i+w.length);out=out.split(esc(raw)).join(`<mark>${esc(raw)}</mark>`);}return out;};
    $('helpList').innerHTML=hits.map(h=>{const c=h[L],open=q||helpOpen.has(h.id);return `<article class="helpItem${open?' open':''}"><button type="button" class="helpHead" data-help="${h.id}" aria-expanded="${open}"><span>${mark(c.t)}</span><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="helpBody">${c.b.map(p=>`<p>${mark(p)}</p>`).join('')}${h.page?`<a class="mini secondary helpGo" href="#/${h.page}">${esc(t('helpGo'))}</a>`:''}</div></article>`;}).join('')||`<div class="dashEmpty">${esc(t('helpNone'))}</div>`;
    document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{const id=b.dataset.help;helpOpen.has(id)?helpOpen.delete(id):helpOpen.add(id);if(!$('helpSearch').value.trim())renderHelp();else b.closest('.helpItem').classList.toggle('open');});
  }
  /* ---- Employee menu: Time Clock and Supplies as separate sections ---- */
  const EMP_PAGES=['clock','supplies','uniforms','vacation','performance','projects','vehicle','resources','info','help'];
  const empPage=()=>{const pg=(location.hash.match(/^#\/(\w+)/)||[])[1];return EMP_PAGES.includes(pg)?pg:'clock';};
  function setEmpDrawer(open){const d=$('empDrawer');d.classList.toggle('open',open);$('empScrim').classList.toggle('hide',!open);$('empBurger').setAttribute('aria-expanded',String(open));document.body.classList.toggle('drawerOpen',open);}
  function showEmpPage(){
    if(managerMode||!employeeIdentity)return;
    const pg=empPage();
    document.querySelectorAll('#employeeApp [data-epage]').forEach(el=>el.classList.toggle('pageOff',el.dataset.epage!==pg));
    {const k={clock:'navClock',supplies:'navSupplies',uniforms:'navUniforms',vacation:'navVacation',performance:'navPerf',projects:'navProj',vehicle:'navVeh',resources:'navRes',info:'navInfo',help:'navHelp'}[pg];const el=$('empSectionName');if(el&&k){el.dataset.i18n=k;el.textContent=t(k);}}
    document.querySelectorAll('[data-eroute]').forEach(a=>{const on=a.dataset.eroute===pg;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    // On its own page the supplies list is always open.
    $('toggleEmpSup').classList.toggle('hide',pg==='supplies');
    if(pg==='supplies'){$('empSupBody').classList.remove('hide');loadEmpSupplies();}
    if(pg==='uniforms')loadEmpUniforms();
    if(pg==='vacation')loadEmpVacation();
    if(pg==='info')loadEmpInfo();
    if(pg==='performance')loadEmpPerf();
    if(pg==='projects')loadEmpProjects();
    if(pg==='vehicle')loadEmpVehicle();
    if(pg==='resources')loadEmpResources();
    if(pg==='help')renderHelp();
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
    initEmpInfo();
    initEmpPerf();
    initEmpCompany();
    $('helpSearch').oninput=renderHelp;
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
    $('empPanelDelete').classList.toggle('hide',isNew);
    $('epStart').value='';$('epEnd').value='';$('epEndReason').value='';
    if(!isNew)api(`/api/records?id=${p.id}`).then(j=>{const r=j.record||{};$('epStart').value=r.start_date||'';$('epEnd').value=r.termination_date||'';$('epEndReason').value=r.termination_reason||'';}).catch(()=>{});
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
      const dates={start_date:$('epStart').value,termination_date:$('epEnd').value,termination_reason:$('epEndReason').value};
      if(isNew){const j=await api('/api/employees',{method:'POST',body:JSON.stringify({name,title,email,wage,pin})});if(dates.start_date||dates.termination_date)await api('/api/records',{method:'PATCH',body:JSON.stringify({employeeId:Number(j.employee.id),...dates})});toast(`${name} added.`);}
      else{
        const p=managerPeople.find(x=>String(x.id)===String(id));
        await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),wage,title,email})});
        if(p&&status!==statusOfP(p)){
          if(status==='terminated'&&!confirm(`Mark ${p.name} as terminated?\n\nThey will no longer be able to sign in, but all of their shifts, hours and earnings stay on record and remain searchable in Reports.`)){msg.textContent='Other changes saved; status not changed.';await loadPeople();return;}
          await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),status})});
        }
        if(pin)await api('/api/employees',{method:'PATCH',body:JSON.stringify({id:Number(id),pin})});
        await api('/api/records',{method:'PATCH',body:JSON.stringify({employeeId:Number(id),...dates})});
        toast(pin?'Saved. The new PIN is active; they must sign in again.':'Employee saved.');
      }
      closeEmpPanel();await loadPeople();await mgrRender();if(currentMgrPage()==='employees')loadRecords();
    }catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  async function deleteEmpPanel(){
    const id=$('empPanel').dataset.id,p=managerPeople.find(x=>String(x.id)===String(id));if(!p)return;
    if(!confirm(`Delete ${p.name} for good?\n\nThis only works for someone with no work history. Anyone who has worked should be marked Terminated instead, so their records are kept.`))return;
    try{await api(`/api/employees?id=${encodeURIComponent(id)}&hard=1`,{method:'DELETE'});closeEmpPanel();toast(`${p.name} deleted.`);await loadPeople();await mgrRender();loadRecords();}
    catch(e){$('empPanelMsg').textContent=displayMessage(e.payload||e.message);}
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
    {const st=$('empCount').closest('.stat');st.classList.add('tileLink');st.onclick=()=>{location.hash='#/employees';};}
    ['mHours','payroll'].forEach(id=>{const el=$(id);el.closest('.stat').classList.add('tileLink');el.closest('.stat').onclick=()=>{const c=weekly().closest('section.card');c.scrollIntoView({behavior:calmMotion()?'auto':'smooth',block:'start'});c.classList.remove('flash');void c.offsetWidth;c.classList.add('flash');};});
    go('rejected','toggleRejected','rejectedBody');
    go('liveClockIns','toggleShiftDetails','shiftDetailsBody');
    go('pendingApprovals','toggleShiftDetails','shiftDetailsBody');
  }
  /* ---- Manager: Employee Records ---- */
  let recRows=[],recCurrent=null,recLicData=null;
  const REC_LABEL={full_name:'name',dob:'birth date',address:'address',phone:'phone',ssn_last4:'SSN',emergency_name:'emergency contact',emergency_phone:'emergency phone',emergency_relation:'relation',license:'licence photo'};
  async function loadRecords(){try{recRows=(await api('/api/records')).employees||[];renderRecords();}catch(e){$('recList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}}
  function renderRecords(){
    const q=($('recSearch').value||'').trim().toLowerCase(),miss=$('recMissing').checked,term=$('recShowTerm').checked;
    const rows=recRows.filter(e=>(term||e.employment_status!=='terminated')&&(!q||String(e.name).toLowerCase().includes(q))&&(!miss||e.record.missing.length));
    $('recList').innerHTML=rows.map(e=>{const r=e.record,st=e.employment_status||'active';return `<button class="empRow status-${st}" data-rec="${e.id}" type="button"><span class="avatar">${esc(initials(e.name))}</span><span class="empMain"><b>${esc(e.name)}</b><span>${esc(e.title||'')}${r.start_date?` · started ${esc(fmtYmd(r.start_date))}`:''}</span></span><span class="statusBadge ${st}">${esc(statusText(st))}</span>${r.missing.length?`<span class="recMissing">Missing: ${esc(r.missing.map(k=>REC_LABEL[k]||k).join(', '))}</span>`:'<span class="recDone">Complete</span>'}<svg aria-hidden="true" class="chev" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;}).join('')||'<div class="dashEmpty">No employees match.</div>';
    document.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>openRecord(recRows.find(e=>String(e.id)===b.dataset.rec)));
  }
  function openRecord(e){
    recCurrent=e;recLicData=null;const r=e.record;
    $('recTitle').textContent=e.name;$('recSub').textContent=r.updated_at?`Last updated ${supWhen(r.updated_at)} by ${r.updated_by||'—'}.`:'No details yet. The employee can fill them in under My Info.';
    const v=(id,val)=>{$(id).value=val??'';};
    v('rFull',r.full_name||e.name);v('rDob',r.dob);v('rAddr',r.address);v('rPhone',r.phone);v('rEmail',r.email||e.email);v('rEmName',r.emergency_name);v('rEmPhone',r.emergency_phone);v('rEmRel',r.emergency_relation);
    v('rStart',r.start_date);v('rTermDate',r.termination_date);v('rTermReason',r.termination_reason);v('rOpening',r.vacation_opening_hours||'');v('rSsn','');v('rLic','');
    $('rStatus').value=statusText(e.employment_status||'active');
    $('rSsnShown').textContent=r.ssn_masked||'Not entered';$('rSsnReveal').classList.toggle('hide',!r.ssn_masked);
    $('rLicState').textContent=r.has_license?`On file (${supWhen(r.license_updated_at)})`:'None';$('rLicView').classList.toggle('hide',!r.has_license);
    $('rLicImg').classList.add('hide');$('rLicImg').removeAttribute('src');$('recMsg').textContent='';
    $('recPanel').classList.remove('hide');
  }
  async function saveRecord(){
    const body={employeeId:Number(recCurrent.id),full_name:$('rFull').value,dob:$('rDob').value,address:$('rAddr').value,phone:$('rPhone').value,email:$('rEmail').value,emergency_name:$('rEmName').value,emergency_phone:$('rEmPhone').value,emergency_relation:$('rEmRel').value,start_date:$('rStart').value,termination_date:$('rTermDate').value,termination_reason:$('rTermReason').value,vacation_opening_hours:$('rOpening').value||0};
    if($('rSsn').value.trim()){if($('rSsn').value.replace(/\D/g,'').length!==9)return $('recMsg').textContent='The SSN must have 9 digits.';body.ssn=$('rSsn').value;}
    if(recLicData)body.license=recLicData;
    $('recMsg').textContent='Saving…';
    try{await api('/api/records',{method:'PATCH',body:JSON.stringify(body)});$('recPanel').classList.add('hide');toast('Record saved.');await loadRecords();}
    catch(e){$('recMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function initRecords(){
    $('recSearch').oninput=renderRecords;$('recMissing').onchange=renderRecords;$('recShowTerm').onchange=renderRecords;
    $('recCancel').onclick=()=>$('recPanel').classList.add('hide');$('recSave').onclick=saveRecord;
    $('rSsnReveal').onclick=async()=>{try{const j=await api(`/api/records?id=${recCurrent.id}&ssn=1`);$('rSsnShown').textContent=j.ssn||'Not entered';$('rSsnReveal').classList.add('hide');}catch(e){toast(displayMessage(e.payload||e.message),'bad');}};
    $('rLicView').onclick=async()=>{try{const j=await api(`/api/records?id=${recCurrent.id}&license=1`);if(j.image){$('rLicImg').src=j.image;$('rLicImg').classList.remove('hide');$('rLicImg').scrollIntoView({block:'nearest'});}}catch(e){toast(displayMessage(e.payload||e.message),'bad');}};
    $('rLic').onchange=async()=>{const f=$('rLic').files[0];if(!f)return;try{recLicData=await shrinkImage(f);$('rLicImg').src=recLicData;$('rLicImg').classList.remove('hide');$('rLicState').textContent='New photo ready to save';}catch{toast('That file could not be read as a photo.','bad');}};
  }
  /* ---- Manager: Performance ---- */
  let perfBar,perfData=null;
  const PERF_TZ=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','America/Puerto_Rico','Asia/Karachi'];
  const perfBarHtml=v=>v==null||!Number.isFinite(Number(v))?'<span class="muted">—</span>':`<div class="perfMeter${v>=85?' great':v>=60?' mid':' low'}"><i style="width:${Math.max(0,Math.min(100,v))}%"></i></div><b>${Number(v).toFixed(1)}%</b>${v>=85?' <span class="perfTag">Perfect</span>':''}`;
  async function loadPerf(){
    const [a]=perfBar.range(),mode=perfBar.mode();
    $('perfMonthWrap').classList.toggle('hide',mode==='year');$('perfYearWrap').classList.toggle('hide',mode!=='year');
    try{
      perfData=mode==='year'?await api(`/api/performance?year=${a.getFullYear()}`):await api(`/api/performance?month=${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}`);
      const sel=$('perfTz');if(!sel.options.length){const list=PERF_TZ.includes(perfData.tz)?PERF_TZ:[perfData.tz,...PERF_TZ];sel.innerHTML=list.map(z=>`<option>${esc(z)}</option>`).join('');}sel.value=perfData.tz;
      mode==='year'?renderPerfYear():renderPerfMonth();
    }catch(e){$('perfRows').innerHTML=`<tr><td colspan="6">${esc(displayMessage(e.payload||e.message))}</td></tr>`;}
  }
  function renderPerfMonth(){
    const q=($('perfSearch').value||'').trim().toLowerCase();
    const rows=(perfData.employees||[]).filter(e=>(e.employment_status!=='terminated'||e.worked)&&(!q||String(e.name).toLowerCase().includes(q)));
    $('perfRows').innerHTML=rows.map(e=>{const p=e.points;return `<tr data-perf-row="${e.employee_id}"><td><b>${esc(e.name)}</b><div class="muted small">${esc(e.title||'')}${e.worked?'':' · no shifts this month'}</div></td>
      <td><input class="perfIn" data-perf-eval="${e.employee_id}" type="number" min="0" max="30" step="1" inputmode="numeric" value="${e.evaluation??''}" placeholder="0–30"/></td>
      <td>${e.days_worked?`<b>${p.on_time.toFixed(1)}%</b><div class="muted small">${e.days_on_time} of ${e.days_worked} days</div>`:'<span class="muted small">No days</span>'}</td>
      <td>${e.weeks_worked?`<b>${p.hours.toFixed(1)}%</b><div class="muted small">${e.weeks_met} of ${e.weeks_worked} weeks</div>`:'<span class="muted small">No weeks</span>'}</td>
      <td><input class="perfIn" data-perf-touch="${e.employee_id}" type="number" min="0" step="1" inputmode="numeric" value="${e.touchups??''}" placeholder="0"/><div class="muted small">${p.touchups==null?'not entered':p.touchups+'%'}</div></td>
      <td><input class="perfIn" data-perf-abs="${e.employee_id}" type="number" min="0" step="1" inputmode="numeric" value="${e.absences??''}" placeholder="0"/><div class="muted small">${p.absences==null?'not entered':p.absences+'%'}</div></td>
      <td class="perfTotal">${perfBarHtml(e.total)}${e.missing.length&&e.worked?`<div class="notFinal">Not final: waiting for ${e.missing.map(m=>({evaluation:'evaluation',touchups:'touch-ups',absences:'absences'})[m]).join(', ')}</div><div class="muted small">${e.earned} of ${e.possible} points so far</div>`:''}</td></tr>`;}).join('')||'<tr><td colspan="7" class="muted">No employees.</td></tr>';
    const save=async id=>{const ev=document.querySelector(`[data-perf-eval="${id}"]`).value,tc=document.querySelector(`[data-perf-touch="${id}"]`).value,ab=document.querySelector(`[data-perf-abs="${id}"]`).value;const [a]=perfBar.range();
      try{const j=await api('/api/performance',{method:'PATCH',body:JSON.stringify({employeeId:Number(id),month:`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}`,evaluation:ev,touchups:tc,absences:ab})});const i=perfData.employees.findIndex(x=>x.employee_id===id);if(i>=0)perfData.employees[i]=j.employee;renderPerfMonth();toast('Saved.');}
      catch(e){toast(displayMessage(e.payload||e.message),'bad');}};
    document.querySelectorAll('[data-perf-eval]').forEach(i=>i.onchange=()=>save(i.dataset.perfEval));
    document.querySelectorAll('[data-perf-touch]').forEach(i=>i.onchange=()=>save(i.dataset.perfTouch));
    document.querySelectorAll('[data-perf-abs]').forEach(i=>i.onchange=()=>save(i.dataset.perfAbs));
  }
  function renderPerfYear(){
    const q=($('perfSearch').value||'').trim().toLowerCase(),months=perfData.months||[];
    $('perfYearHead').innerHTML=`<tr><th>Employee</th>${months.map(m=>`<th>${new Date(m+'-15T12:00:00').toLocaleDateString([], {month:'short'})}</th>`).join('')}<th>Year</th></tr>`;
    const rows=(perfData.employees||[]).filter(e=>(e.employment_status!=='terminated'||e.months_worked)&&(!q||String(e.name).toLowerCase().includes(q)));
    $('perfYearRows').innerHTML=rows.map(e=>`<tr><td><b>${esc(e.name)}</b></td>${months.map(m=>{const v=e.months[m];return `<td class="${v==null?'muted':v>=85?'perfGood':v<60?'perfLow':''}">${v==null?'—':v.toFixed(0)+'%'}</td>`;}).join('')}<td class="perfTotal">${perfBarHtml(e.average)}${e.final||e.average==null?'':'<div class="notFinal">Not final</div>'}</td></tr>`).join('')||`<tr><td colspan="${months.length+2}" class="muted">No data for this year yet.</td></tr>`;
  }
  function initPerf(){
    perfBar=makeDateBar('perfDates',loadPerf,{year:true,noCustom:true});
    $('perfSearch').oninput=()=>perfData&&(perfBar.mode()==='year'?renderPerfYear():renderPerfMonth());
    $('perfTz').onchange=async()=>{try{await api('/api/performance',{method:'PATCH',body:JSON.stringify({timezone:$('perfTz').value})});toast('Time zone saved.');loadPerf();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}};
  }

  /* ---- Manager: Help & Manual (searchable) ---- */
  const MGR_HELP=[
    {sec:'Getting started',items:[
      {id:'m-nav',t:'Getting around the manager portal',k:'menu sidebar sections navigation burger',b:['The menu has: Dashboard, Vacations, Supplies, Uniforms, Performance, Employees, Resources, Vehicles, Projects and Help. On a large screen the sections are links in the black header; on smaller screens tap ☰.','Red numbers on Supplies and Uniforms show new requests waiting for you. The browser tab title also shows the count, for example “(2)”.','Log Out is in the header (or at the bottom of the menu on a phone or tablet).']},
      {id:'m-dates',t:'Date filters: Monthly, Yearly, Custom dates',k:'date bar month year custom range filter',b:['Many sections have a date bar. Monthly shows one month; use ‹ › to move. Some sections also have Yearly.','Custom dates: pick a From and a To date, then tap Show.','Each card has its own date bar, so changing one does not change the others.']},
      {id:'m-notify',t:'How you get notified',k:'notification alert new request red badge pop-up',b:['While the portal is open, it checks every 30 seconds. When a painter sends a supply or uniform request, a message pops up and the red count on the menu goes up.','When any supply item runs low, a red notice appears at the top of the Dashboard.','Each week with uniform purchases, an orange notice on Weekly Paid Hours reminds you what to deduct.']}]},
    {sec:'Dashboard',page:'dashboard',items:[
      {id:'m-tiles',t:'Dashboard tiles',k:'tiles active employees paid hours payroll rejected live clocked in approval',b:['The six tiles show, for the selected week: active employees, paid hours, payroll, rejected clock-outs, who is clocked in right now, and shifts waiting for your approval.','Tap a tile to jump to the section it summarises.']},
      {id:'m-low',t:'Supplies running low notice',k:'low stock alert 20% minimum red notice',b:['A red notice appears on the Dashboard when a supply item drops below its “minimum to keep” or below 20% of its full stock.','Tap Open Supplies to restock or update the amounts.']},
      {id:'m-weekly',t:'Weekly Paid Hours & Earnings',k:'weekly hours earnings wage payroll week calendar',b:['Shows each employee’s paid hours per day, the week total and earnings. Use ‹ › or the calendar to change the week; the whole Dashboard follows the week you choose.','You can change an employee’s hourly wage right in the Wage box; it saves when you leave the box.','Terminated employees appear only in weeks they worked.']},
      {id:'m-deduct',t:'Uniform deductions on the weekly pay',k:'deduction uniform pay net owed weekly reminder',b:['When you deliver uniforms that a painter is buying, the cost is counted in the week you delivered them.','An orange notice lists who to deduct and how much. In the Earnings column you see the deduction and “Pay” (earnings minus the deduction).','If the deduction is more than that week’s earnings, it shows “Pay $0.00 · $X still owed”. Free uniforms are never deducted.']},
      {id:'m-shifts',t:'Shift Details',k:'shift details day clock-ins search review location open carried',b:['One row per employee for the selected week. Tap a day to see that day’s clock-ins, locations and notes.','Pick a single day or search an employee to narrow the list; Clear resets.','Small labels on a day: “review” needs your decision, “location” means the clock-out was outside the allowed area, “open” is a shift still running, “carried” is a shift that continues from the day before.']},
      {id:'m-approve',t:'Approving shifts (manager approval required)',k:'approve full actual adjust hours custom review pending early leave',b:['Some clock-outs need your decision, for example leaving early with an exception reason or clocking out outside the allowed area.','Approve full pays the full-day hours shown on the button (normally 8). Approve actual pays the hours really worked. Adjust hours lets you set the exact paid hours and add a note.','If a shift runs across more than one day (usually a missed clock-out), correct the clock-out in Adjust hours so the hours land on the right day.']},
      {id:'m-clockin',t:'Correcting a clock-in time',k:'correct clock-in start time late forgot to clock in',b:['If someone started work before they clocked in, find their running shift in Shift Details and tap “Edit clock-in time”.','Choose the actual start time (or a quick option) and save. The shift stays open and keeps running from the corrected time.']},
      {id:'m-rejected',t:'Rejected Clock-Out Attempts',k:'rejected clock out outside area distance location',b:['Lists clock-outs made outside the allowed area, with the distance and a map link.','The shift is stopped at that moment and sent to Shift Details for your review.']},
      {id:'m-force',t:'Manager Force Clock Out',k:'force clock out forgot open shift close',b:['Use this when an employee forgot to clock out. Choose the employee’s open shift, the real clock-out date and time, and how to pay: actual hours, 8 hours, or custom paid hours. Add a note, then tap Force Clock Out.']},
      {id:'m-people',t:'Employees list: add, edit, PIN, status',k:'add employee edit wage title email pin status active vacation terminated',b:['Search, filter by Active / On vacation / Terminated, and tap a person to edit their title, wage, email, status or PIN.','+ Add employee: enter the full name, wage and a 4-digit PIN. They sign in with that name and PIN.','Changing a PIN signs them out. Terminated employees cannot sign in, but all their shifts, hours and earnings stay on record.']},
      {id:'m-report',t:'Employee Report',k:'report employee history months days earnings range',b:['Type an employee’s name, choose a period (or custom dates) and tap View report to see month-by-month totals and every working day.']},
      {id:'m-settings',t:'Settings',k:'settings radius miles minimum paid hours max employees retention cleanup password',b:['Clock-out radius (miles): how far from the clock-in spot a clock-out is allowed. The default is 3 miles.','Minimum paid hours: a normal shift reaching 7 hours 45 minutes is paid as 8 hours; approved exception reasons can also be paid at 8 hours.','Maximum active employees limits how many can be active at once.','Data retention: shifts and records older than the number of months you choose are deleted each night. Earned vacation hours are saved first, so they are never lost. Use “Check what would be removed” before “Run cleanup now”.','Manager Password: enter your current password and the new one twice.']}]},
    {sec:'Vacations',page:'vacations',items:[
      {id:'m-vac',t:'How vacation is calculated',k:'vacation 2080 40 hours accrual earned balance formula',b:['Every 2,080 paid hours earns 40 hours of vacation (0.769 hours per 40-hour week). Paid hours come from Shift Details, so they match payroll.','Columns: start date and eligibility, paid hours and vacation earned in the chosen dates, earned in total, manager adjust, vacation (hours taken), and balance (earned in total plus adjustments minus vacation).','Use the date bar for a month, a year or custom dates. Employee names stay in place when the table slides sideways.']},
      {id:'m-elig',t:'First-year rule, start date and earlier hours',k:'eligible first full year start date joined before workclock opening hours',b:['Paid vacation can be used after the first full year from the job start date. Set start dates in Employees (open the person’s record).','If someone joined before WorkClock (for example September 2025), enter their start date and, if needed, “Vacation hours earned before WorkClock” in their record; those hours are added to the total.','Recording vacation for someone not yet eligible asks you to confirm.']},
      {id:'m-vactaken',t:'Recording vacation taken and the history',k:'record taken vacation history who when hours manager adjust correction mistake add minus',b:['Tap Record / adjust on a row. Under Vacation taken, enter the hours, the date and an optional note, then Save.','Under Manager adjust (+/−), fix a mistake: type 8 to add 8 hours or -8 to take 8 hours away, write the reason, then Save. The balance changes at once and the adjustment shows in the history with its reason.','Vacation History lists who took vacation, when and how many hours, with its own date bar. Entries cannot be undone from the app.']}]},
    {sec:'Supplies',page:'supplies',items:[
      {id:'m-supreq',t:'Supply requests: Requested, Approved, Delivered',k:'supply request approve deliver reject note custom item stock',b:['Requested: new requests from painters. Tap Approve to accept, or Reject (add a note the painter will see).','When you hand the supplies over, tap Mark delivered. You can lower the amounts in the Deliver boxes first. Only delivered amounts come off your stock.','Items marked “Not on the list” are things the painter typed in; they are not stocked, so delivering them does not change stock.','Requested and Approved always show everything open; the date bar chooses which Delivered and Rejected requests you see.']},
      {id:'m-supstock',t:'Supplies stock: add, edit, delete, minimum',k:'stock items add edit delete minimum full stock quantity show items',b:['Tap Show items to open the list. + Add item adds a new one; Edit changes the name, category, unit, quantity, minimum to keep, full stock, or hides it from painters; Delete removes it (past requests and history keep its name).','Minimum to keep and Full stock control the low-stock alert: you are alerted below the minimum or below 20% of full stock.','Each item shows its amount at the start of the chosen dates, what was added (+) and taken out (−), and the amount at the end.']},
      {id:'m-usage',t:'Supplies Usage Comparison',k:'usage comparison chart painter asked delivered month',b:['A monthly chart with one column per painter. Switch between Asked for and Delivered, and use ‹ › to change the month.']},
      {id:'m-suphist',t:'Stock History',k:'stock history log changes audit',b:['Every change to a stock amount: what you set and what was delivered to whom. Use the date bar to choose the period. Entries cannot be edited or deleted.']}]},
    {sec:'Uniforms',page:'uniforms',items:[
      {id:'m-unireq',t:'Free and paid uniform requests',k:'uniform request approve deliver buy free paid reject limit',b:['Painters request T-shirts (half or full sleeve), trousers and jackets in sizes XS–3XL, and choose Free or Paid when they send it.','Free Uniform Requests (first on the page) lists the free ones; Paid Uniform Requests (second) lists the paid ones. Approve, then Mark delivered when you hand it over. A paid delivery is deducted from that week’s pay; a free one is not.','Delivery is blocked if Uniform Inventory does not have enough of that item and size. Add stock first.','Requests sent before the Free/Paid choice existed show with the free ones, with both delivery buttons.']},
      {id:'m-uniinv',t:'Uniform Inventory',k:'uniform inventory stock size count receive',b:['A grid of items by size. Tap a number to add stock that arrived or to set an exact count. Delivered uniforms come off automatically.','Under each item: amount at the start of the dates, received (+), handed out (−) and amount at the end. “Inventory changes” lists every change.']},
      {id:'m-unifree',t:'Free uniforms given, purchases and giving a uniform',k:'free uniform company purchases history give uniform without request',b:['Under Free Uniform Requests, “Free uniforms given” lists everything given at no cost. Under Paid Uniform Requests, “Uniform purchases” lists what painters bought and how much was deducted. Each has its own date bar.','+ Give a uniform hands out a uniform without a request: choose the employee, item, size, how many, and Free or Bought. If a free one goes over the painter’s free limit you are asked to confirm.']},
      {id:'m-uniprice',t:'Uniform prices and free limits',k:'uniform prices cost change free limit maximum per month year blocked',b:['Prices & Free Limits (last on the page): change each item’s price for paid requests. A request keeps the price it had when it was sent.','Free per painter: the most of each item one painter can get free, per calendar month or per calendar year (choose at the top). Free requests already waiting count toward it. When a painter reaches the limit, free requests for that item are blocked until the next month or year, and the painter must send a paid request. Set 0 to never give that item free.','Tap Save prices & limits.']}]},
    {sec:'Performance',page:'performance',items:[
      {id:'m-perf',t:'Performance score and entering it',k:'performance evaluation on time hours touch-up complaint absent absence notice 85 perfect monthly yearly time zone',b:['Each month adds up to 100%: your evaluation (0–30), on-time clock-in at 8:10 am or earlier (share of days × 10), weeks with 38.5 or more paid hours, including over 40 (share of weeks × 10), customer touch-ups/complaints (0–1 = 30%, 2 = 10%, 3+ = 0%), and absences without notice (0 = 20%, 1 or more = 0%).','Type the evaluation, the touch-up count and the absences for each person; they save by themselves. Until all three are entered, the score leaves them out and shows as “Not final”: it is the share of the points possible so far.','Switch to Yearly to see every month and the year average. On-time is checked in the time zone shown on the page; change it if needed. 85% and above is perfect.']}]},
    {sec:'Employees, Resources, Vehicles, Projects',items:[
      {id:'m-records',page:'employees',t:'Employee records',k:'records personal details ssn licence license emergency start date termination reveal',b:['Each person’s hiring details: name, date of birth, address, phone, email, SSN, emergency contact, licence photo, job start date, termination date and reason. Painters fill in their own under My Info.','“Missing” shows what still needs to be filled in. Tap a person to view or edit.','The SSN shows only the last 4 digits; Reveal shows it in full and is logged, as is viewing the licence photo. SSNs and photos are stored encrypted with the app’s SESSION_SECRET in Cloudflare: never change that setting, or they can no longer be read.','Active / On vacation / Terminated is changed in the Employees list on the Dashboard.']},
      {id:'m-res',page:'resources',t:'Job Resources (Handbook and SOP)',k:'resources handbook sop pdf upload replace delete documents',b:['Enter a title, choose the type (Employee Handbook, SOP or Other), pick a PDF (8 MB at most) and tap Upload PDF.','Open, Replace or Delete each document. Painters see them under Job Resources.']},
      {id:'m-veh',page:'vehicles',t:'Company vehicles and maintenance',k:'vehicles truck van vin plate driver assign maintenance oil odometer registration inspection expire expiration notice accident incident photo crash insurance',b:['+ Add vehicle: year, make, model, plate, VIN, the assigned driver and the odometer at purchase. Edit changes them; Remove takes the vehicle out of use.','Registration: enter the current registration date and the date it expires. Inspection: enter the month and year of the current inspection and of its expiration (no days).','1 month before the registration or inspection expires, a notice shows at the top of the Dashboard and on the vehicle card. It turns red once the date has passed. Update the dates after you renew to clear it.','+ Maintenance records the date, what was done, mileage, cost and notes.','+ Accident note records the date and what happened, with up to 10 photos or files (pictures are made smaller automatically). Add more photos later with + Photo on the entry. Only you see accident notes.','The assigned driver sees the vehicle (My Vehicle), its dates and its maintenance; costs and accident notes are shown only to you.']},
      {id:'m-proj',page:'projects',t:'Assigned projects calendar',k:'projects calendar address crew assign start finish job',b:['+ New project: name, address, start and finish days, notes, and tick the employees assigned.','The calendar shows each project on the days it runs; tap it to edit or delete. The list below shows this month’s projects with a map link.','Each painter sees only the projects they are assigned to, with the address and crew.']}]},
    {sec:'Employee portal',items:[
      {id:'m-emp',t:'What painters see',k:'employee portal painters spanish help what they see',b:['Painters have Time Clock, Supplies, Uniforms, Vacation, Performance, My Projects, My Vehicle (only if assigned), Job Resources, My Info and Help, in English or Spanish.','They get a red dot when you answer a request and see uniform deductions and Week pay in their Weekly Summary.','Their employee link is the same address without “?manager=1”.']}]}
  ];
  let mHelpOpen=new Set();
  function renderMgrHelp(){
    const fold2=x=>String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const q=fold2($('mHelpSearch').value.trim()),words=q.split(/\s+/).filter(Boolean);
    const mark=txt=>{let out=esc(txt);for(const w of words){const i=fold2(txt).indexOf(w);if(i<0)continue;const raw=txt.slice(i,i+w.length);out=out.split(esc(raw)).join(`<mark>${esc(raw)}</mark>`);}return out;};
    let n=0;
    $('mHelpList').innerHTML=MGR_HELP.map(sec=>{const hits=sec.items.filter(h=>words.every(w=>fold2([sec.sec,h.t,h.k,...h.b].join(' ')).includes(w)));n+=hits.length;if(!hits.length)return '';
      return `<div class="helpSec">${esc(sec.sec)}</div>`+hits.map(h=>{const open=q||mHelpOpen.has(h.id),page=h.page||sec.page;return `<article class="helpItem${open?' open':''}"><button type="button" class="helpHead" data-mhelp="${h.id}" aria-expanded="${open}"><span>${mark(h.t)}</span><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="helpBody">${h.b.map(p=>`<p>${mark(p)}</p>`).join('')}${page?`<a class="mini secondary helpGo" href="#/${page}">Open this section</a>`:''}</div></article>`;}).join('');}).join('')||'<div class="dashEmpty">Nothing found. Try another word.</div>';
    $('mHelpCount').textContent=q?(n?`${n} topics found`:''):`${MGR_HELP.reduce((a,s)=>a+s.items.length,0)} topics`;
    document.querySelectorAll('[data-mhelp]').forEach(b=>b.onclick=()=>{const id=b.dataset.mhelp;mHelpOpen.has(id)?mHelpOpen.delete(id):mHelpOpen.add(id);b.closest('.helpItem').classList.toggle('open');b.setAttribute('aria-expanded',b.closest('.helpItem').classList.contains('open'));});
  }
  /* ---- Manager: Resources, Vehicles, Projects ---- */
  const RES_KIND={handbook:'Employee Handbook',sop:'SOP',other:'Other'};
  let resRows=[],vehRows=[],vehCurrent=null,projRows=[],projMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),projCurrent=null;
  async function loadResources(){try{resRows=(await api('/api/company?area=resources')).resources||[];renderResources();}catch(e){$('resList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}}
  // Some phones send Word/Excel files with no type: work it out from the name.
  const fileMime=f=>{const x=(f.name.split('.').pop()||'').toLowerCase();return ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain'})[x]||f.type||'application/octet-stream';};
  const RES_CATS=['Employee Handbook','SOP','Safety','Forms','Training','Other'];
  const fileTag=m=>/^image\//.test(m||'')?'IMG':/pdf/.test(m||'application/pdf')?'PDF':/sheet|excel/.test(m)?'XLS':/word/.test(m)?'DOC':'FILE';
  const resGroups=rows=>{const cats=[...new Set(rows.map(r=>r.category||'Other'))];return cats.map(c=>[c,rows.filter(r=>(r.category||'Other')===c)]);};
  function renderResources(){
    const cats=[...new Set([...RES_CATS,...resRows.map(r=>r.category||'Other')])];
    $('resCatList').innerHTML=cats.map(c=>`<option value="${esc(c)}"></option>`).join('');
    $('resList').innerHTML=resGroups(resRows).map(([c,rows])=>`<div class="supCat">${esc(c)} <span class="muted small">(${rows.length})</span></div>`+rows.map(r=>`<div class="resRow"><span class="resIcon">${fileTag(r.mime)}</span><div class="resMain"><b>${esc(r.title)}</b><span class="muted small">${esc(r.filename)} · ${fileSize(r.size)} · updated ${esc(supWhen(r.updated_at))}</span></div><a class="mini secondary resOpen" href="/api/company?file=${r.id}" target="_blank" rel="noopener">Open</a><button class="mini secondary" data-res-edit="${r.id}" type="button">Rename</button><label class="mini secondary resReplace">Replace<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx,.xls,.xlsx,.txt" data-res-replace="${r.id}" hidden/></label><button class="mini secondary supDel" data-res-del="${r.id}" type="button">Delete</button></div>`).join('')).join('')||'<div class="dashEmpty">No documents yet. Add the Employee Handbook, the SOP and anything else above.</div>';
    document.querySelectorAll('[data-res-del]').forEach(b=>b.onclick=async()=>{const r=resRows.find(x=>String(x.id)===b.dataset.resDel);if(!confirm(`Delete "${r.title}"? Employees will no longer see it.`))return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'resource_delete',id:Number(r.id)})});toast('Document deleted.');loadResources();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}});
    document.querySelectorAll('[data-res-replace]').forEach(inp=>inp.onchange=async()=>{const f=inp.files[0];if(!f)return;const r=resRows.find(x=>String(x.id)===inp.dataset.resReplace);await uploadPdf(f,r.title,r.category,Number(r.id));});
    document.querySelectorAll('[data-res-edit]').forEach(b=>b.onclick=async()=>{const r=resRows.find(x=>String(x.id)===b.dataset.resEdit);
      const title=prompt('Document name:',r.title);if(title===null)return;const category=prompt('Category (e.g. '+RES_CATS.join(', ')+'):',r.category||'Other');if(category===null)return;
      try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'resource_save',id:Number(r.id),title:title.trim(),category:category.trim()})});toast('Saved.');loadResources();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}});
  }
  async function uploadPdf(f,title,category,id){
    if(f.size>8*1048576)return toast('The file is too large (8 MB at most).','bad');
    $('resMsg').textContent='Uploading…';
    try{let data=await readAsDataURL(f);data=data.replace(/^data:[^;]*;/,'data:'+fileMime(f)+';');
      await api('/api/company',{method:'POST',body:JSON.stringify({action:'resource_save',id,title,category,filename:f.name,data})});$('resMsg').textContent='';toast(id?'Document replaced.':'Document added.');$('resFile').value='';$('resTitle').value='';$('resCat').value='';loadResources();}
    catch(e){$('resMsg').textContent=displayMessage(e.payload||e.message);}
  }
  async function loadVehicles(){try{vehRows=(await api('/api/company?area=vehicles')).vehicles||[];renderVehicles($('vehList'),vehRows,true);}catch(e){$('vehList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}}
  const fmtMonth=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString(document.documentElement.lang==='es'?'es':[],{month:'short',year:'numeric'});};
  const vehAlertText=(a,T)=>{const d=a.kind==='inspection'?fmtMonth(a.date):fmtYmd(a.date);return (T((a.expired?'expired':'exp')+(a.kind==='inspection'?'Insp':'Reg'))||'').replace('{d}',d);};
  async function loadVehAlerts(){
    try{const al=(await api('/api/company?area=vehicle_alerts')).alerts||[];const box=$('vehAlert');box.classList.toggle('hide',!al.length);if(!al.length)return;
      $('vehAlertTitle').textContent=al.some(a=>a.expired)?'Vehicle papers expired or expiring':'Vehicle papers expiring within a month';
      const T=k=>({expReg:'registration expires {d}',expInsp:'inspection expires {d}',expiredReg:'registration EXPIRED {d}',expiredInsp:'inspection EXPIRED {d}'}[k]);
      $('vehAlertList').innerHTML=al.map(a=>`<span class="lowChip">${esc(a.vehicle)}${a.plate?' ('+esc(a.plate)+')':''}: <b>${esc(vehAlertText(a,T))}</b></span>`).join('');}catch{}
  }
  function vehicleCard(v,manage,L){
    const T=L||(k=>({odo:'Odometer at purchase',reg:'Registration date',regExp:'Registration expires',insp:'Current inspection',inspExp:'Inspection expires',expReg:'Registration expires {d}',expInsp:'Inspection expires {d}',expiredReg:'Registration EXPIRED {d}',expiredInsp:'Inspection EXPIRED {d}',plate:'Plate',vin:'VIN',driver:'Driver',none:'Not assigned',mnt:'Maintenance history',noMnt:'No maintenance recorded yet.',date:'Date',what:'What was done',miles:'Mileage',cost:'Cost',notes:'Notes'}[k]));
    return `<article class="vehCard"><div class="vehHead"><span class="vehIcon">${'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4a1 1 0 0 1-1 1h-1M3 13v4a1 1 0 0 0 1 1h1M3 13h18"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>'}</span><div class="vehMain"><b>${esc([v.year,v.make,v.model].filter(Boolean).join(' '))}</b><span class="muted small">${esc(T('plate'))}: <b>${esc(v.plate||'—')}</b> · ${esc(T('vin'))}: ${esc(v.vin||'—')}</span><span class="small">${esc(T('driver'))}: <b>${esc(v.employee_name||T('none'))}</b></span>${v.notes?`<span class="muted small">${esc(v.notes)}</span>`:''}</div>${manage?`<div class="supItemBtns"><button class="mini secondary" data-veh-edit="${v.id}" type="button">Edit</button><button class="mini secondary" data-veh-mnt="${v.id}" type="button">+ Maintenance</button><button class="mini secondary" data-veh-inc="${v.id}" type="button">+ Accident note</button></div>`:''}</div>
      ${(v.alerts||[]).map(a=>`<div class="vehWarn${a.expired?' expired':''}">${esc(vehAlertText(a,T))}</div>`).join('')}
      <div class="vehFacts"><div><span>${esc(T('odo'))}</span><b>${v.odometer_purchase!=null?Number(v.odometer_purchase).toLocaleString()+' mi':'—'}</b></div><div><span>${esc(T('reg'))}</span><b>${v.reg_date?esc(fmtYmd(v.reg_date)):'—'}</b></div><div><span>${esc(T('regExp'))}</span><b>${v.reg_expires?esc(fmtYmd(v.reg_expires)):'—'}</b></div><div><span>${esc(T('insp'))}</span><b>${v.insp_month?esc(fmtMonth(v.insp_month)):'—'}</b></div><div><span>${esc(T('inspExp'))}</span><b>${v.insp_expires?esc(fmtMonth(v.insp_expires)):'—'}</b></div></div>
      ${manage?`<div class="recSection">Accidents / incidents</div>${(v.incidents||[]).length?v.incidents.map(i=>`<div class="incRow"><div><b>${esc(fmtYmd(i.date))}</b> <span>${esc(i.notes)}</span>${i.files.length?`<div class="incFiles">${i.files.map(f=>/^image\//.test(f.mime)?`<a href="/api/company?attachment=${f.id}" target="_blank" rel="noopener"><img alt="${esc(f.filename)}" src="/api/company?attachment=${f.id}" loading="lazy"/></a>`:`<a class="fileChip" href="/api/company?attachment=${f.id}" target="_blank" rel="noopener">${esc(f.filename)}</a>`).join('')}</div>`:''}</div><div class="supItemBtns"><label class="mini secondary resReplace">+ Photo<input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" data-inc-file="${i.id}" hidden/></label><button class="mini secondary supDel" data-inc-del="${i.id}" type="button">Delete</button></div></div>`).join(''):'<div class="muted small">No accidents or incidents recorded.</div>'}`:''}
      <div class="recSection">${esc(T('mnt'))}</div>${v.maintenance.length?`<div class="tableWrap"><table class="mntTable"><thead><tr><th>${esc(T('date'))}</th><th>${esc(T('what'))}</th><th>${esc(T('miles'))}</th>${manage?`<th>${esc(T('cost'))}</th>`:''}<th>${esc(T('notes'))}</th>${manage?'<th></th>':''}</tr></thead><tbody>${v.maintenance.map(m=>`<tr><td>${esc(fmtYmd(m.date))}</td><td><b>${esc(m.type)}</b></td><td>${m.mileage!=null?Number(m.mileage).toLocaleString():'—'}</td>${manage?`<td>${m.cost!=null?'$'+Number(m.cost).toFixed(2):'—'}</td>`:''}<td>${esc(m.notes||'')}</td>${manage?`<td><button class="mini secondary supDel" data-mnt-del="${m.id}" type="button">Delete</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:`<div class="muted small">${esc(T('noMnt'))}</div>`}</article>`;
  }
  function renderVehicles(el,rows,manage){
    el.innerHTML=rows.map(v=>vehicleCard(v,manage)).join('')||'<div class="dashEmpty">No vehicles yet. Add one with + Add vehicle.</div>';
    if(!manage)return;
    el.querySelectorAll('[data-veh-edit]').forEach(b=>b.onclick=()=>openVehicle(vehRows.find(v=>String(v.id)===b.dataset.vehEdit)));
    el.querySelectorAll('[data-veh-mnt]').forEach(b=>b.onclick=()=>{vehCurrent=vehRows.find(v=>String(v.id)===b.dataset.vehMnt);$('mntSub').textContent=[vehCurrent.year,vehCurrent.make,vehCurrent.model].filter(Boolean).join(' ');$('mDate').value=iso(new Date());['mType','mMiles','mCost','mNotes'].forEach(i=>$(i).value='');$('mntMsg').textContent='';$('mntPanel').classList.remove('hide');});
    el.querySelectorAll('[data-veh-inc]').forEach(b=>b.onclick=()=>{vehCurrent=vehRows.find(v=>String(v.id)===b.dataset.vehInc);$('incSub').textContent=[vehCurrent.year,vehCurrent.make,vehCurrent.model].filter(Boolean).join(' ')+(vehCurrent.plate?' · '+vehCurrent.plate:'');$('incDate').value=iso(new Date());$('incNotes').value='';$('incFiles').value='';$('incMsg').textContent='';$('incPanel').classList.remove('hide');});
    el.querySelectorAll('[data-inc-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this accident note and its photos? This cannot be undone.'))return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'incident_delete',id:Number(b.dataset.incDel)})});toast('Deleted.');loadVehicles();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}});
    el.querySelectorAll('[data-inc-file]').forEach(inp=>inp.onchange=async()=>{const f=inp.files[0];if(!f)return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'incident_file_add',id:Number(inp.dataset.incFile),...(await incFilePayload(f))})});toast('Added.');loadVehicles();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}});
    el.querySelectorAll('[data-mnt-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this maintenance entry?'))return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'maintenance_delete',id:Number(b.dataset.mntDel)})});loadVehicles();}catch(e){toast(displayMessage(e.payload||e.message),'bad');}});
  }
  function openVehicle(v){
    vehCurrent=v||null;$('vehTitle').textContent=v?'Edit vehicle':'Add vehicle';
    $('vhEmp').innerHTML='<option value="">Not assigned</option>'+(managerPeople||[]).filter(p=>(p.employment_status||'active')!=='terminated').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('vhYear').value=v?.year??'';$('vhMake').value=v?.make||'';$('vhModel').value=v?.model||'';$('vhPlate').value=v?.plate||'';$('vhVin').value=v?.vin||'';$('vhNotes').value=v?.notes||'';$('vhOdo').value=v?.odometer_purchase??'';$('vhRegDate').value=v?.reg_date||'';$('vhRegExp').value=v?.reg_expires||'';$('vhInspMonth').value=v?.insp_month||'';$('vhInspExp').value=v?.insp_expires||'';$('vhEmp').value=v?.employee_id?String(v.employee_id):'';
    $('vehRemove').classList.toggle('hide',!v);$('vehMsg').textContent='';$('vehPanel').classList.remove('hide');
  }
  // Pictures are shrunk before upload; other files go as they are (6 MB at most).
  async function incFilePayload(f){
    if(/^image\//.test(f.type)&&!/gif|svg/.test(f.type)){const data=await shrinkImage(f);return {name:f.name.replace(/\.\w+$/,'')+'.jpg',data};}
    if(f.size>6*1048576)throw new Error(`${f.name} is too large (6 MB at most).`);
    let data=await readAsDataURL(f);data=data.replace(/^data:[^;]*;/,'data:'+fileMime(f)+';');return {name:f.name,data};
  }
  async function saveIncident(){
    const msg=$('incMsg'),files=[...$('incFiles').files];
    if(!$('incDate').value)return msg.textContent='Choose the date.';if(!$('incNotes').value.trim())return msg.textContent='Write what happened.';
    if(files.length>10)return msg.textContent='Up to 10 photos or files.';
    msg.textContent='Saving…';$('incSave').disabled=true;
    try{const j=await api('/api/company',{method:'POST',body:JSON.stringify({action:'incident_add',vehicleId:Number(vehCurrent.id),date:$('incDate').value,notes:$('incNotes').value.trim()})});
      for(let i=0;i<files.length;i++){msg.textContent=`Uploading ${i+1} of ${files.length}…`;await api('/api/company',{method:'POST',body:JSON.stringify({action:'incident_file_add',id:j.id,...(await incFilePayload(files[i]))})});}
      $('incPanel').classList.add('hide');toast('Accident note saved.');loadVehicles();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);loadVehicles();}
    finally{$('incSave').disabled=false;}
  }
  async function saveVehicle(){
    $('vehMsg').textContent='Saving…';
    try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'vehicle_save',id:vehCurrent?Number(vehCurrent.id):null,year:$('vhYear').value.trim(),make:$('vhMake').value,model:$('vhModel').value,plate:$('vhPlate').value,vin:$('vhVin').value.replace(/\s/g,''),employeeId:$('vhEmp').value||null,notes:$('vhNotes').value,odometerPurchase:$('vhOdo').value.replace(/[,\s]/g,''),regDate:$('vhRegDate').value,regExpires:$('vhRegExp').value,inspMonth:$('vhInspMonth').value,inspExpires:$('vhInspExp').value})});$('vehPanel').classList.add('hide');toast('Vehicle saved.');loadVehicles();}
    catch(e){$('vehMsg').textContent=displayMessage(e.payload||e.message);}
  }
  async function loadProjects(){
    $('projMonth').textContent=projMonth.toLocaleDateString([], {month:'long',year:'numeric'});
    const s=new Date(projMonth.getFullYear(),projMonth.getMonth(),1),e=new Date(projMonth.getFullYear(),projMonth.getMonth()+1,0);
    try{projRows=(await api(`/api/company?area=projects&start=${iso(new Date(s.getTime()-7*864e5))}&end=${iso(new Date(e.getTime()+7*864e5))}`)).projects||[];}catch(err){projRows=[];toast(displayMessage(err.payload||err.message),'bad');}
    renderProjCal($('projCal'),projMonth,projRows,openProject);
    const inMonth=projRows.filter(p=>p.start_date<=iso(e)&&p.end_date>=iso(s));
    $('projList').innerHTML=inMonth.map(p=>projectRow(p,true)).join('')||'<div class="dashEmpty">No projects this month.</div>';
    $('projList').querySelectorAll('[data-proj-open]').forEach(b=>b.onclick=()=>openProject(projRows.find(p=>String(p.id)===b.dataset.projOpen)));
  }
  function projectRow(p,manage,L){
    const T=L||(k=>({crew:'Crew',none:'No one assigned yet',map:'Map'}[k]));
    return `<div class="projRow"><span class="projDot" style="background:${PROJ_COLORS[Number(p.id)%PROJ_COLORS.length]}"></span><div class="projMain"><b>${esc(p.name)}</b><span class="small">${esc(fmtYmd(p.start_date))} → ${esc(fmtYmd(p.end_date))}</span><a class="small" href="${mapsLink(p.address)}" target="_blank" rel="noopener">${esc(p.address)}</a><span class="muted small">${esc(T('crew'))}: ${p.employees.length?esc(p.employees.map(x=>x.name).join(', ')):esc(T('none'))}</span>${p.notes?`<span class="muted small">${esc(p.notes)}</span>`:''}</div>${manage?`<button class="mini secondary" data-proj-open="${p.id}" type="button">Edit</button>`:''}</div>`;
  }
  function openProject(p){
    projCurrent=p||null;$('projTitle').textContent=p?'Edit project':'New project';
    $('pName').value=p?.name||'';$('pAddr').value=p?.address||'';$('pStart').value=p?.start_date||iso(new Date());$('pEnd').value=p?.end_date||iso(new Date());$('pNotes').value=p?.notes||'';
    const chosen=new Set((p?.employees||[]).map(x=>String(x.id)));
    $('pEmps').innerHTML=(managerPeople||[]).filter(x=>(x.employment_status||'active')!=='terminated'||chosen.has(String(x.id))).map(x=>`<label class="pEmp"><input type="checkbox" value="${x.id}"${chosen.has(String(x.id))?' checked':''}/> ${esc(x.name)}</label>`).join('')||'<span class="muted small">No employees.</span>';
    $('projDelete').classList.toggle('hide',!p);$('projMsg').textContent='';$('projPanel').classList.remove('hide');
  }
  async function saveProject(){
    $('projMsg').textContent='Saving…';
    try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'project_save',id:projCurrent?Number(projCurrent.id):null,name:$('pName').value,address:$('pAddr').value,start_date:$('pStart').value,end_date:$('pEnd').value,notes:$('pNotes').value,employees:[...$('pEmps').querySelectorAll('input:checked')].map(i=>Number(i.value))})});$('projPanel').classList.add('hide');toast('Project saved.');loadProjects();}
    catch(e){$('projMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function initCompany(){
    $('resUploadBtn').onclick=()=>{const f=$('resFile').files[0],title=$('resTitle').value.trim()||(f&&f.name.replace(/\.pdf$/i,''));if(!f)return $('resMsg').textContent='Choose a file.';if(!$('resCat').value.trim())return $('resMsg').textContent='Choose or type a category.';uploadPdf(f,title,$('resCat').value.trim(),null);};
    $('vehAddBtn').onclick=()=>openVehicle(null);$('incCancel').onclick=()=>$('incPanel').classList.add('hide');$('incSave').onclick=saveIncident;$('vehCancel').onclick=()=>$('vehPanel').classList.add('hide');$('vehSave').onclick=saveVehicle;
    $('vehRemove').onclick=async()=>{if(!confirm('Remove this vehicle? Its maintenance history is kept in the database.'))return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'vehicle_remove',id:Number(vehCurrent.id)})});$('vehPanel').classList.add('hide');loadVehicles();}catch(e){$('vehMsg').textContent=displayMessage(e.payload||e.message);}};
    $('mntCancel').onclick=()=>$('mntPanel').classList.add('hide');
    $('mntSave').onclick=async()=>{try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'maintenance_add',vehicleId:Number(vehCurrent.id),date:$('mDate').value,type:$('mType').value,mileage:$('mMiles').value.replace(/[,\s]/g,''),cost:$('mCost').value,notes:$('mNotes').value})});$('mntPanel').classList.add('hide');toast('Maintenance added.');loadVehicles();}catch(e){$('mntMsg').textContent=displayMessage(e.payload||e.message);}};
    $('projAddBtn').onclick=()=>openProject(null);$('projCancel').onclick=()=>$('projPanel').classList.add('hide');$('projSave').onclick=saveProject;
    $('projDelete').onclick=async()=>{if(!confirm(`Delete "${projCurrent.name}"?`))return;try{await api('/api/company',{method:'POST',body:JSON.stringify({action:'project_delete',id:Number(projCurrent.id)})});$('projPanel').classList.add('hide');loadProjects();}catch(e){$('projMsg').textContent=displayMessage(e.payload||e.message);}};
    $('projPrev').onclick=()=>{projMonth=new Date(projMonth.getFullYear(),projMonth.getMonth()-1,1);loadProjects();};
    $('projNext').onclick=()=>{projMonth=new Date(projMonth.getFullYear(),projMonth.getMonth()+1,1);loadProjects();};
    $('projToday').onclick=()=>{projMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);loadProjects();};
  }
  /* ---- Manager: Tools & Supplies ---- */
  /* Date bar: a month with ‹ › or custom from/to dates. range() gives [start, end). */
  function makeDateBar(host,onChange,opts={}){
    const el=$(host);let mode=opts.initial||'month',month=new Date(new Date().getFullYear(),new Date().getMonth(),1),year=new Date().getFullYear(),from='',to='';
    el.classList.add('dateBar');
    el.innerHTML=`<div class="dbModes" role="tablist"><button type="button" class="dbMode" data-db="month">Monthly</button>${opts.year?'<button type="button" class="dbMode" data-db="year">Yearly</button>':''}${opts.noCustom?'':'<button type="button" class="dbMode" data-db="custom">Custom dates</button>'}</div><div class="dbMonth"><button type="button" class="dbPrev" aria-label="Previous month">&lsaquo;</button><b class="dbLabel"></b><button type="button" class="dbNext" aria-label="Next month">&rsaquo;</button></div><div class="dbCustom hide"><label>From<input type="date" class="dbFrom"/></label><label>To<input type="date" class="dbTo"/></label><button type="button" class="mini primary dbApply">Show</button></div>`;
    const q=c=>el.querySelector(c);
    const paint=()=>{el.querySelectorAll('.dbMode').forEach(b=>b.classList.toggle('on',b.dataset.db===mode));q('.dbMonth').classList.toggle('hide',mode==='custom');q('.dbCustom').classList.toggle('hide',mode!=='custom');q('.dbLabel').textContent=mode==='year'?String(year):month.toLocaleDateString([], {month:'long',year:'numeric'});};
    q('.dbPrev').onclick=()=>{if(mode==='year')year--;else month=new Date(month.getFullYear(),month.getMonth()-1,1);paint();onChange();};
    q('.dbNext').onclick=()=>{if(mode==='year')year++;else month=new Date(month.getFullYear(),month.getMonth()+1,1);paint();onChange();};
    el.querySelectorAll('.dbMode').forEach(b=>b.onclick=()=>{mode=b.dataset.db;if(mode==='custom'&&!q('.dbFrom').value){q('.dbFrom').value=iso(month);const e=new Date(month.getFullYear(),month.getMonth()+1,0);q('.dbTo').value=iso(e);}paint();if(mode!=='custom')onChange();});
    q('.dbApply').onclick=()=>{from=q('.dbFrom').value;to=q('.dbTo').value;if(!from||!to||to<from){toast('Choose a start date and an end date after it.','bad');return;}onChange();};
    paint();
    return{mode:()=>mode,range(){if(mode==='custom'&&from&&to){const a=new Date(from+'T00:00:00'),z=new Date(to+'T00:00:00');z.setDate(z.getDate()+1);return [a,z];}if(mode==='year')return [new Date(year,0,1),new Date(year+1,0,1)];return [new Date(month),new Date(month.getFullYear(),month.getMonth()+1,1)];},
      label(){const [a,z]=this.range();const e=new Date(z);e.setDate(e.getDate()-1);return mode==='month'?month.toLocaleDateString([], {month:'long',year:'numeric'}):mode==='year'?String(year):`${a.toLocaleDateString()} – ${e.toLocaleDateString()}`;}};
  }
  let supReqBar,supStockBar,supLogBar;

  let supData={items:[],requests:[],log:[],pending:0},supTab='pending',supKnownPending=null;
  const supWhen=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';};
  const supStatus={pending:'Requested',approved:'Approved',given:'Delivered',rejected:'Rejected',cancelled:'Cancelled by painter'};
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
    try{const q=(k,bar)=>{const [a,z]=bar.range();return `${k}Start=${encodeURIComponent(a.toISOString())}&${k}End=${encodeURIComponent(z.toISOString())}`;};supData=await api(`/api/supplies?${q('req',supReqBar)}&${q('stock',supStockBar)}&${q('log',supLogBar)}`);supKnownPending=Number(supData.pending||0);setSupBadge(supKnownPending);renderSupplies();}
    catch(e){$('supReqList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}
  }
  function renderSupplies(){
    // Requests: Requested -> Approved -> Delivered (or Rejected).
    document.querySelectorAll('[data-sup-tab]').forEach(b=>b.classList.toggle('on',b.dataset.supTab===supTab));
    if($('supCountApproved'))$('supCountApproved').textContent=supData.approved||0;
    const inRange=r=>{const [a,z]=supReqBar.range();const t=new Date(r.created_at);return t>=a&&t<z;};
    const reqs=supData.requests.filter(r=>supTab==='all'?(['pending','approved'].includes(r.status)||inRange(r)):supTab==='rejected'?(['rejected','cancelled'].includes(r.status)&&inRange(r)):supTab==='given'?(r.status==='given'&&inRange(r)):r.status===supTab);
    const empty={pending:'No new requests. New ones show up here and on the Supplies link.',approved:'Nothing approved and waiting to be delivered.',given:'Nothing delivered in these dates.',rejected:'No rejected or cancelled requests in these dates.',all:'No requests in these dates.'}[supTab];
    $('supReqList').innerHTML=reqs.map(r=>{
      const open=r.status==='pending'||r.status==='approved';
      const rows=r.lines.map(l=>{const dem=l.stock_mode==='demand',shelf=l.on_shelf??0,short=open&&!dem&&l.qty_requested>shelf;
        return `<tr><td><b>${esc(l.item_name)}</b></td><td>${l.qty_requested} <span class="muted">${esc(l.unit)}</span></td>`+(open?`<td class="${short?'supShort':''}">${dem?'<span class="demandTag">On demand</span>':`${shelf} <span class="muted">${esc(l.unit)}</span>`}${short?'<div class="supShortTxt">Not enough</div>':''}</td><td><input class="supGiveQty" data-sup-line="${l.id}" data-sup-req="${r.id}" inputmode="numeric" type="number" min="0" ${dem?'':`max="${shelf}"`} value="${dem?l.qty_requested:Math.min(l.qty_requested,shelf)}" aria-label="Deliver ${esc(l.item_name)}"/></td>`:`<td>${r.status==='given'?`<b>${l.qty_given??0}</b> <span class="muted">${esc(l.unit)}</span>`:'—'}</td>`)+`</tr>`;}).join('')
       +(r.custom||[]).map(c=>`<tr class="supCustomRow"><td><b>${esc(c.name)}</b> <span class="customTag">Not on the list</span></td><td>${c.qty}</td>`+(open?`<td class="muted small">Not stocked</td><td><input class="supGiveQty" data-sup-custom="${c.id}" data-sup-creq="${r.id}" inputmode="numeric" type="number" min="0" value="${c.qty}" aria-label="Deliver ${esc(c.name)}"/></td>`:`<td>${r.status==='given'?`<b>${c.qty_given??0}</b>`:'—'}</td>`)+`</tr>`).join('');
      const when=r.status==='approved'?` · approved ${esc(supWhen(r.approved_at))}`:'';
      const actions=r.status==='pending'
        ?`<button class="secondary" data-sup-reject="${r.id}" type="button">Reject</button><button class="secondary" data-sup-approve="${r.id}" type="button">Approve</button><button class="primary" data-sup-give="${r.id}" type="button">Mark delivered</button>`
        :`<button class="secondary" data-sup-reject="${r.id}" type="button">Reject</button><button class="primary" data-sup-give="${r.id}" type="button">Mark delivered</button>`;
      return `<article class="supReq st-${r.status}"><div class="supReqHead"><div class="who"><span class="avatar">${esc(initials(r.employee_name))}</span><div><b>${esc(r.employee_name)}</b><div class="muted small">${esc(r.employee_title||'')}${r.employee_title?' · ':''}asked ${esc(supWhen(r.created_at))}${when}</div></div></div><span class="supBadge ${r.status}">${esc(supStatus[r.status]||r.status)}</span></div>${r.note?`<div class="supNote">“${esc(r.note)}”</div>`:''}<div class="tableWrap"><table class="supLines"><thead><tr><th>Item</th><th>Asked for</th>${open?'<th>In stock</th><th>Deliver</th>':'<th>Delivered</th>'}</tr></thead><tbody>${rows}</tbody></table></div>${open?`<div class="supReqActions"><input class="supMgrNote" data-sup-note="${r.id}" maxlength="300" placeholder="Note to the painter (optional)"/>${actions}</div><div class="muted small" data-sup-msg="${r.id}"></div>`:`<div class="muted small supDone">${esc(supStatus[r.status]||r.status)} ${esc(supWhen(r.decided_at))}${r.manager_note?` · Your note: “${esc(r.manager_note)}”`:''}</div>`}</article>`;
    }).join('')||`<div class="dashEmpty">${esc(empty)}</div>`;
    document.querySelectorAll('[data-sup-give]').forEach(b=>b.onclick=()=>supDecide(b.dataset.supGive,'given',b));
    document.querySelectorAll('[data-sup-approve]').forEach(b=>b.onclick=()=>supDecide(b.dataset.supApprove,'approved',b));
    document.querySelectorAll('[data-sup-reject]').forEach(b=>b.onclick=()=>supDecide(b.dataset.supReject,'rejected',b));
    // Stock, with each item's amount at the start and end of the chosen dates.
    const cats=[...new Set(supData.items.map(i=>i.category))].sort();
    const cf=$('supCatFilter'),keep=cf.value;cf.innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');cf.value=cats.includes(keep)?keep:'';
    $('supCatList').innerHTML=cats.map(c=>`<option value="${esc(c)}"></option>`).join('');
    const q=($('supSearch').value||'').trim().toLowerCase(),lowOnly=$('supLowOnly').checked;
    const isLow=supIsLow;
    const items=supData.items.filter(i=>(!q||(i.name+' '+i.category).toLowerCase().includes(q))&&(!cf.value||i.category===cf.value)&&(!lowOnly||isLow(i)));
    const lowN=supData.items.filter(isLow).length,outN=supData.items.filter(i=>i.active&&i.stock_mode!=='demand'&&i.quantity===0).length,demN=supData.items.filter(i=>i.active&&i.stock_mode==='demand').length;
    $('supStockSummary').innerHTML=`<span><b>${supData.items.filter(i=>i.active).length}</b> items</span><span class="${lowN?'warn':''}"><b>${lowN}</b> low</span><span class="${outN?'warn':''}"><b>${outN}</b> at zero</span>${demN?`<span><b>${demN}</b> on demand</span>`:''}`;
    const shown=[...new Set(items.map(i=>i.category))];
    $('supItemList').innerHTML=shown.map(c=>`<div class="supCat">${esc(c)}</div><div class="supItems">`+items.filter(i=>i.category===c).map(i=>{
      const begin=i.begin_qty??0,end=i.end_qty??i.quantity;
      const dem=i.stock_mode==='demand';
      if(dem)return `<div class="supItem demand${i.active?'':' off'}"><div class="supItemName"><b>${esc(i.name)}</b><span class="muted small">${esc(i.unit)} · bought when asked${i.active?'':' · hidden from painters'}</span></div><div class="supQty"><span class="demandTag">On demand</span></div><div class="supItemBtns"><button class="mini secondary" data-sup-edit="${i.id}" type="button">Edit</button><button class="mini secondary supDel" data-sup-del="${i.id}" type="button" aria-label="Delete ${esc(i.name)}">Delete</button></div></div>`;
      return `<div class="supItem${isLow(i)?' low':''}${i.quantity===0&&i.active?' zero':''}${i.active?'':' off'}"><div class="supItemName"><b>${esc(i.name)}</b><span class="muted small">${esc(i.unit)}${i.low_at?` · keep at least ${i.low_at}`:''}${i.full_qty?` · full ${i.full_qty} · ${supPct(i)}%`:''}${i.active?'':' · hidden from painters'}</span><span class="supPeriod">Start <b>${begin}</b> · <span class="pos">+${i.added||0}</span> · <span class="neg">−${i.removed||0}</span> · End <b>${end}</b></span></div><div class="supQty"><b>${i.quantity}</b><span>${isLow(i)?'Low':i.quantity===0&&i.active?'None left':'in stock now'}</span></div><div class="supItemBtns"><button class="mini secondary" data-sup-edit="${i.id}" type="button">Edit</button><button class="mini secondary supDel" data-sup-del="${i.id}" type="button" aria-label="Delete ${esc(i.name)}">Delete</button></div></div>`;}).join('')+`</div>`).join('')||`<div class="dashEmpty">No items match.</div>`;
    document.querySelectorAll('[data-sup-edit]').forEach(b=>b.onclick=()=>openSupItem(supData.items.find(i=>String(i.id)===b.dataset.supEdit)));
    document.querySelectorAll('[data-sup-del]').forEach(b=>b.onclick=()=>deleteSupItem(supData.items.find(i=>String(i.id)===b.dataset.supDel)));
    renderLowAlert(supData.low||[]);
    // History
    $('supLogRows').innerHTML=supData.log.map(g=>`<tr><td>${esc(supWhen(g.created_at))}</td><td><b>${esc(g.item_name)}</b></td><td class="${g.change<0?'neg':'pos'}">${g.change>0?'+':''}${g.change}</td><td>${g.quantity_after}</td><td>${esc(g.reason==='Given to employee'?'Delivered to employee':g.reason)}${g.employee_name?` · ${esc(g.employee_name)}`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No changes in these dates.</td></tr>';
  }
  async function supDecide(id,decision,btn){
    const msg=document.querySelector(`[data-sup-msg="${id}"]`),note=(document.querySelector(`[data-sup-note="${id}"]`)?.value||'').trim();
    const lines=[...document.querySelectorAll(`[data-sup-req="${id}"]`)].map(inp=>({id:Number(inp.dataset.supLine),qty:Number(inp.value||0)}));
    const custom=[...document.querySelectorAll(`[data-sup-creq="${id}"]`)].map(inp=>({id:Number(inp.dataset.supCustom),qty:Number(inp.value||0)}));
    if(decision==='rejected'&&!confirm('Reject this request? The painter will see it as rejected'+(note?' with your note.':'.')))return;
    if(decision==='given'&&[...lines,...custom].some(l=>!Number.isInteger(l.qty)||l.qty<0)){msg.textContent='Enter whole numbers to deliver (0 or more).';return;}
    btn.disabled=true;msg.textContent='Saving…';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'decide',id:Number(id),decision,note,lines,custom})});toast(decision==='given'?'Marked as delivered. Stock updated.':decision==='approved'?'Approved. Mark it delivered when you hand it over.':'Request rejected.');await loadSupplies();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);btn.disabled=false;}
  }
  const supIsLow=i=>!!i.active&&i.stock_mode!=='demand'&&((i.full_qty>0&&i.quantity*5<i.full_qty)||(i.low_at>0&&i.quantity<i.low_at));
  const supPct=i=>i.full_qty?Math.round(i.quantity/i.full_qty*100):0;
  // Dashboard notice when any item is below 20% of its full stock.
  function renderLowAlert(low){
    const box=$('lowAlert');if(!box)return;
    box.classList.toggle('hide',!low.length);
    if(!low.length)return;
    $('lowAlertTitle').textContent=low.length===1?'1 supply item is running low':`${low.length} supply items are running low`;
    $('lowAlertList').innerHTML=low.slice(0,6).map(i=>`<span class="lowChip">${esc(i.name)} <b>${i.quantity}${i.full_qty?'/'+i.full_qty:''}</b>${i.low_at&&i.quantity<i.low_at?` (min ${i.low_at})`:''}</span>`).join('')+(low.length>6?`<span class="lowChip">+${low.length-6} more</span>`:'');
  }
  async function deleteSupItem(it){
    if(!it)return;
    if(!confirm(`Delete "${it.name}"?\n\nPainters will no longer see it. Past requests and Stock History keep its name.`))return;
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'item_delete',id:Number(it.id)})});$('supItemPanel').classList.add('hide');toast('Item deleted.');await loadSupplies();}
    catch(e){toast(displayMessage(e.payload||e.message),'bad');}
  }
  // Usage by painter, per month.
  let usageMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),usageMode='asked',usageRows=[];
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
    $('usageNote').textContent=rows.length?`${total} items ${usageMode==='given'?'delivered':'asked for'} in total. Counted in units (rolls, pieces, packs, boxes).`:'';
  }
  // Uniforms
  const UNI_NAMES={tshirt_half:'T-shirt, half sleeve',tshirt_full:'T-shirt, full sleeve',trousers:'Trousers',jacket:'Jacket'};
  const UNI_SIZES=['XS','S','M','L','XL','XXL','3XL'];
  let uniData={requests:[]},uniTab='pending',uniKnownPending=null;
  function setUniBadge(n){document.querySelectorAll('[data-uni-count]').forEach(el=>{el.textContent=n;el.classList.toggle('hide',!n);});}
  let uniReqBar,uniPReqBar,uniInvBar,uniFreeBar,uniBuyBar,uniStockCell=null;
  const uniItemsText=r=>r.lines.map(l=>`${l.qty} × ${esc(UNI_NAMES[l.item]||l.item)} ${esc(l.size)}`).join(', ');
  async function loadUniforms(){
    const q=(k,bar)=>{const [a,z]=bar.range();return `${k}Start=${encodeURIComponent(a.toISOString())}&${k}End=${encodeURIComponent(z.toISOString())}`;};
    // One request range covering both request lists' dates.
    const [fa,fz]=uniReqBar.range(),[pa,pz]=uniPReqBar.range(),ra=new Date(Math.min(fa,pa)),rz=new Date(Math.max(fz,pz));
    try{uniData=await api(`/api/supplies?uniforms=1&reqStart=${encodeURIComponent(ra.toISOString())}&reqEnd=${encodeURIComponent(rz.toISOString())}&${q('inv',uniInvBar)}&${q('free',uniFreeBar)}&${q('buy',uniBuyBar)}`);uniKnownPending=uniData.requests.filter(r=>r.status==='pending').length;setUniBadge(uniKnownPending);renderUniforms();renderUniPrices();}
    catch(e){$('uniReqList').innerHTML=`<div class="dashEmpty">${esc(displayMessage(e.payload||e.message))}</div>`;}
  }
  const uniTabs={free:'pending',paid:'pending'};
  const uniKindOf=r=>r.kind==='paid'?'paid':'free';// older requests without a choice show with the free ones
  function renderUniReqList(sec){
    const [ra,rz]=(sec==='paid'?uniPReqBar:uniReqBar).range(),inR=r=>{const t=new Date(r.created_at);return t>=ra&&t<rz;},tab=uniTabs[sec];
    document.querySelectorAll(`[data-uni-tab][data-uni-sec="${sec}"]`).forEach(b=>b.classList.toggle('on',b.dataset.uniTab===tab));
    const mine=uniData.requests.filter(r=>uniKindOf(r)===sec),suf=sec==='paid'?'Paid':'';
    $('uniCountPending'+suf).textContent=mine.filter(r=>r.status==='pending').length;$('uniCountApproved'+suf).textContent=mine.filter(r=>r.status==='approved').length;
    const reqs=mine.filter(r=>tab==='all'?(['pending','approved'].includes(r.status)||inR(r)):tab==='rejected'?(['rejected','cancelled'].includes(r.status)&&inR(r)):tab==='given'?(r.status==='given'&&inR(r)):r.status===tab);
    const inv=uniData.inventory||{},lim=uniData.freeLimits||{};
    $(sec==='paid'?'uniPReqList':'uniReqList').innerHTML=reqs.map(r=>{const open=r.status==='pending'||r.status==='approved';
      const lines=r.lines.map(l=>{const have=inv[l.item]?.[l.size]?.qty??0,short=open&&l.qty>have;return `<div class="uniLine"><span class="uniIcon">${UNI_ICONS[l.item]||''}</span><b>${esc(UNI_NAMES[l.item]||l.item)}</b><span class="uniSize">${esc(l.size)}</span><span class="muted">× ${l.qty}</span>${open?`<span class="uniHave${short?' short':''}">${have} in stock</span>`:''}<span class="uniAmt">$${Number(l.amount||0).toFixed(2)}</span></div>`;}).join('');
      const status=r.status==='given'?(r.free?'Delivered · free':'Delivered · bought'):(supStatus[r.status]||r.status);
      const deliver=r.kind==='free'?`<button class="primary" data-uni-free="${r.id}" type="button">Mark delivered (free)</button>`:r.kind==='paid'?`<button class="primary" data-uni-give="${r.id}" type="button">Mark delivered (deduct from pay)</button>`:`<button class="secondary" data-uni-free="${r.id}" type="button">Deliver free</button><button class="primary" data-uni-give="${r.id}" type="button">Deliver: employee buys</button>`;
      const actions=`${r.status==='pending'?`<button class="secondary" data-uni-approve="${r.id}" type="button">Approve</button>`:''}<button class="secondary" data-uni-reject="${r.id}" type="button">Reject</button>${deliver}`;
      const kindTag=r.kind?'':' <span class="customTag">Sent before Free/Paid choice</span>';
      const totalTxt=sec==='free'?`Value given free: <b>$${Number(r.total||0).toFixed(2)}</b>`:(r.status==='given'&&r.free?`Free from the company (value <b>$${Number(r.total||0).toFixed(2)}</b>)`:`Total to deduct: <b>$${Number(r.total||0).toFixed(2)}</b>${open?' <span class="muted small">· deducted the week you deliver it</span>':''}`);
      return `<article class="supReq st-${r.status}"><div class="supReqHead"><div class="who"><span class="avatar">${esc(initials(r.employee_name))}</span><div><b>${esc(r.employee_name)}</b>${kindTag}<div class="muted small">${esc(r.employee_title||'')}${r.employee_title?' · ':''}asked ${esc(supWhen(r.created_at))}${r.status==='approved'?` · approved ${esc(supWhen(r.approved_at))}`:''}</div></div></div><span class="supBadge ${r.status}">${esc(status)}</span></div>${r.note?`<div class="supNote">“${esc(r.note)}”</div>`:''}<div class="uniLines">${lines}<div class="uniTotal">${totalTxt}</div></div>${open?`<div class="supReqActions"><input class="supMgrNote" data-uni-note="${r.id}" maxlength="300" placeholder="Note to the painter (optional)"/>${actions}</div><div class="muted small" data-uni-msg="${r.id}"></div>`:`<div class="muted small supDone">${esc(status)} ${esc(supWhen(r.decided_at))}${r.manager_note?` · Your note: “${esc(r.manager_note)}”`:''}</div>`}</article>`;}).join('')||`<div class="dashEmpty">${tab==='pending'?(sec==='paid'?'No new paid requests.':'No new free requests.'):'Nothing here for these dates.'}</div>`;
  }
  function renderUniforms(){
    renderUniReqList('free');renderUniReqList('paid');
    const inv=uniData.inventory||{};
    document.querySelectorAll('[data-uni-approve]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniApprove,'approved',b));
    document.querySelectorAll('[data-uni-give]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniGive,'given',b,false));
    document.querySelectorAll('[data-uni-free]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniFree,'given',b,true));
    document.querySelectorAll('[data-uni-reject]').forEach(b=>b.onclick=()=>uniDecide(b.dataset.uniReject,'rejected',b));
    // Inventory grid
    $('uniInvRows').innerHTML=Object.keys(UNI_NAMES).map(k=>{const row=inv[k]||{};let tq=0,tb=0,ta=0,tr=0,te=0;
      const cells=UNI_SIZES.map(z=>{const c=row[z]||{qty:0,begin:0,end:null,added:0,removed:0};tq+=c.qty;tb+=c.begin||0;ta+=c.added||0;tr+=c.removed||0;te+=(c.end??c.qty);return `<td><button type="button" class="invCell${c.qty?'':' zero'}" data-inv="${k}|${z}" aria-label="${esc(UNI_NAMES[k])} ${z}: ${c.qty}">${c.qty}</button></td>`;}).join('');
      return `<tr><td><span class="uniIcon sm">${UNI_ICONS[k]}</span><b>${esc(UNI_NAMES[k])}</b><div class="supPeriod">Start <b>${tb}</b> · <span class="pos">+${ta}</span> · <span class="neg">−${tr}</span> · End <b>${te}</b></div></td>${cells}<td><b>${tq}</b></td></tr>`;}).join('');
    document.querySelectorAll('[data-inv]').forEach(b=>b.onclick=()=>openUniStock(...b.dataset.inv.split('|')));
    $('uniLogRows').innerHTML=(uniData.inventoryLog||[]).map(g=>`<tr><td>${esc(supWhen(g.created_at))}</td><td><b>${esc(UNI_NAMES[g.item]||g.item)}</b></td><td>${esc(g.size)}</td><td class="${g.change<0?'neg':'pos'}">${g.change>0?'+':''}${g.change}</td><td>${g.qty_after}</td><td>${esc(g.reason)}${g.employee_name?` · ${esc(g.employee_name)}`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">No changes in these dates.</td></tr>';
    // Free and bought history
    const hist=(rows,el,sumEl,word)=>{const tot=rows.reduce((a,r)=>a+Number(r.total||0),0),pieces=rows.reduce((a,r)=>a+r.lines.reduce((x,l)=>x+l.qty,0),0);
      $(sumEl).innerHTML=`<span><b>${rows.length}</b> deliveries</span><span><b>${pieces}</b> pieces</span><span><b>$${tot.toFixed(2)}</b> ${word}</span>`;
      $(el).innerHTML=rows.map(r=>`<tr><td><b>${esc(r.employee_name)}</b></td><td>${esc(supWhen(r.decided_at))}</td><td>${uniItemsText(r)}${r.manager_note?`<div class="muted small">“${esc(r.manager_note)}”</div>`:''}</td><td><b>$${Number(r.total||0).toFixed(2)}</b></td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nothing in these dates.</td></tr>';};
    hist(uniData.freeGiven||[],'uniFreeRows','uniFreeSum','value given free');
    hist(uniData.bought||[],'uniBuyRows','uniBuySum','deducted from pay');
  }
  function openUniStock(item,size){
    const c=uniData.inventory?.[item]?.[size]||{qty:0};uniStockCell=[item,size];
    $('uniStockTitle').textContent=`${UNI_NAMES[item]} · ${size}`;$('uniStockSub').textContent=`${c.qty} in stock now.`;
    $('usMode').value='add';$('usQtyLbl').textContent='How many arrived';$('usQty').value='';$('usMsg').textContent='';
    $('uniStockPanel').classList.remove('hide');$('usQty').focus();
  }
  async function saveUniStock(){
    const n=Number($('usQty').value);if(!Number.isInteger(n)||n<0)return $('usMsg').textContent='Enter a whole number, 0 or more.';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_stock',item:uniStockCell[0],size:uniStockCell[1],qty:n,add:$('usMode').value==='add'})});$('uniStockPanel').classList.add('hide');toast('Uniform stock updated.');await loadUniforms();}
    catch(e){$('usMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function openUniGive(){
    $('ugEmp').innerHTML=(managerPeople||[]).filter(p=>(p.employment_status||'active')!=='terminated').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('ugQty').value='1';$('ugNote').value='';$('ugFree').value='1';$('ugMsg').textContent='';$('uniGivePanel').classList.remove('hide');
  }
  async function saveUniGive(){
    const qty=Number($('ugQty').value);if(!Number.isInteger(qty)||qty<1||qty>20)return $('ugMsg').textContent='How many must be 1 to 20.';
    $('ugMsg').textContent='Saving…';
    const body={action:'uniform_give',employeeId:Number($('ugEmp').value),free:$('ugFree').value==='1',note:$('ugNote').value.trim(),lines:[{item:$('ugItem').value,size:$('ugSize').value,qty}]};
    try{try{await api('/api/supplies',{method:'POST',body:JSON.stringify(body)});}
      catch(e){if(e.payload?.code!=='UNIFORM_FREE_LIMIT'||!confirm(displayMessage(e.payload)+'\n\nGive it free anyway?'))throw e;await api('/api/supplies',{method:'POST',body:JSON.stringify({...body,overLimit:true})});}$('uniGivePanel').classList.add('hide');toast($('ugFree').value==='1'?'Free uniform recorded.':'Uniform recorded; it will be deducted from this week\'s pay.');await loadUniforms();loadWeeklyPaidHours().catch(()=>{});}
    catch(e){$('ugMsg').textContent=displayMessage(e.payload||e.message);}
  }
  function renderUniPrices(){
    const pr=uniData.prices||{},lim=uniData.freeLimits||{};$('uniFreePeriod').value=uniData.freePeriod||'year';
    $('uniPriceGrid').innerHTML=Object.keys(UNI_NAMES).map(k=>`<tr><td><span class="uniIcon sm">${UNI_ICONS[k]}</span><b>${esc(UNI_NAMES[k])}</b></td><td><span class="uniPriceIn">$<input data-uni-price="${k}" type="number" min="0" max="1000" step="0.01" value="${Number(pr[k]??20).toFixed(2)}" aria-label="${esc(UNI_NAMES[k])} price"/></span></td><td><input class="uniLimitIn" data-uni-limit="${k}" type="number" min="0" max="50" step="1" inputmode="numeric" value="${lim[k]??1}" aria-label="${esc(UNI_NAMES[k])} free limit"/></td></tr>`).join('');
  }
  async function saveUniPrices(){
    const prices={},limits={};for(const i of document.querySelectorAll('[data-uni-price]')){const v=Number(i.value);if(!Number.isFinite(v)||v<0||v>1000)return $('uniPriceMsg').textContent='Prices must be between $0 and $1,000.';prices[i.dataset.uniPrice]=v;}
    for(const i of document.querySelectorAll('[data-uni-limit]')){const v=Number(i.value);if(!Number.isInteger(v)||v<0||v>50)return $('uniPriceMsg').textContent='Free limits must be whole numbers from 0 to 50.';limits[i.dataset.uniLimit]=v;}
    $('uniPriceMsg').textContent='Saving…';
    try{const j=await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_prices',prices})});const k=await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_free_limits',limits,period:$('uniFreePeriod').value})});
      uniData.prices=j.prices;uniData.freeLimits=k.freeLimits;uniData.freePeriod=k.freePeriod;renderUniPrices();$('uniPriceMsg').textContent='Saved. New requests use these prices and limits.';toast('Prices and free limits saved.');}
    catch(e){$('uniPriceMsg').textContent=displayMessage(e.payload||e.message);}
  }
  async function uniDecide(id,decision,btn,free=false){
    const msg=document.querySelector(`[data-uni-msg="${id}"]`),note=(document.querySelector(`[data-uni-note="${id}"]`)?.value||'').trim();
    if(decision==='rejected'&&!confirm('Reject this uniform request?'))return;
    if(decision==='given'&&free&&!confirm('Deliver as FREE from the company? Nothing will be deducted from pay.'))return;
    btn.disabled=true;msg.textContent='Saving…';
    try{await api('/api/supplies',{method:'POST',body:JSON.stringify({action:'uniform_decide',id:Number(id),decision,note,free})});toast(decision==='given'?(free?'Delivered free from the company.':'Delivered. The cost shows as a deduction on this week\'s Weekly Paid Hours.'):decision==='approved'?'Approved. Mark it delivered when you hand it over.':'Uniform request rejected.');await loadUniforms();loadWeeklyPaidHours().catch(()=>{});}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);btn.disabled=false;}
  }
  // Vacations
  let vacRows=[],vacBar,vacHistBar;
  async function loadVacations(){
    const [a,z]=vacBar.range();document.querySelectorAll('.vacRangeH').forEach(el=>el.textContent=`(${vacBar.label()})`);
    try{vacRows=(await api(`/api/manager?view=vacations&start=${encodeURIComponent(a.toISOString())}&end=${encodeURIComponent(z.toISOString())}`)).employees||[];renderVacations();}
    catch(e){$('vacRows').innerHTML=`<tr><td colspan="8">${esc(displayMessage(e.payload||e.message))}</td></tr>`;}
    loadVacHistory();
  }
  async function loadVacHistory(){
    const [a,z]=vacHistBar.range();
    try{const h=(await api(`/api/manager?view=vacation_history_all&start=${encodeURIComponent(a.toISOString())}&end=${encodeURIComponent(z.toISOString())}`)).history||[];
      const tot=h.filter(r=>r.kind!=='adjust').reduce((x,r)=>x+Number(r.hours||0),0),adjN=h.filter(r=>r.kind==='adjust').length;
      $('vacHistSum').innerHTML=`<span><b>${h.length}</b> entries</span><span><b>${tot.toFixed(2)}</b> hours taken</span><span><b>${new Set(h.map(r=>r.employee_id)).size}</b> employees</span>${adjN?`<span><b>${adjN}</b> adjustments</span>`:''}`;
      $('vacHistRows').innerHTML=h.map(r=>`<tr><td><b>${esc(r.employee_name)}</b></td><td>${esc(fmtYmd(r.taken_on))}</td><td>${r.kind==='adjust'?`<span class="adjTag">Adjust</span> <b>${r.hours>0?'+':''}${Number(r.hours).toFixed(2)} h</b>`:`<b>${Number(r.hours).toFixed(2)} h</b>`}</td><td>${esc(r.note||'')}</td><td class="muted small">${esc(supWhen(r.created_at))}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No vacation taken in these dates.</td></tr>';
    }catch(e){$('vacHistRows').innerHTML=`<tr><td colspan="5">${esc(displayMessage(e.payload||e.message))}</td></tr>`;}
  }
  const hd=h=>{const d=Math.round(Number(h)/8*10)/10;return `${Number(h).toFixed(2)} h<small>${(Object.is(d,-0)?0:d).toFixed(1)} days (8 h)</small>`;};
  function renderVacations(){
    const q=($('vacSearch').value||'').trim().toLowerCase(),all=$('vacShowAll').checked;
    const rows=vacRows.filter(r=>(all||r.employment_status!=='terminated')&&(!q||String(r.name).toLowerCase().includes(q)));
    $('vacRows').innerHTML=rows.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.employment_status!=='active'?` <span class="statusBadge ${r.employment_status}">${esc(statusText(r.employment_status))}</span>`:''}<div class="muted small">${esc(r.title||'')}</div></td><td>${r.start_date?`${esc(fmtYmd(r.start_date))}<small class="${r.eligible?'eligOk':'eligNo'}">${r.eligible?'Eligible':'Eligible from '+esc(fmtYmd(r.eligible_from))}</small>`:'<span class="muted small">Not set</span>'}</td><td>${Number(r.range_paid_hours).toFixed(2)}</td><td class="vacNum">${hd(r.range_earned)}</td><td class="vacNum">${hd(r.all_earned)}${r.opening_hours?`<small>incl. ${Number(r.opening_hours).toFixed(2)} h before WorkClock</small>`:''}</td><td class="vacNum">${r.adjust_hours?`${r.adjust_hours>0?'+':''}${Number(r.adjust_hours).toFixed(2)} h`:'<span class="muted">—</span>'}</td><td class="vacNum">${hd(r.used_hours)}</td><td class="vacNum vacBal${r.balance<0?' neg':''}">${hd(r.balance)}</td><td><button class="mini secondary" data-vac-rec="${r.employee_id}" type="button">Record / adjust</button></td></tr>`).join('')||'<tr><td colspan="9" class="muted">No employees match.</td></tr>';
    document.querySelectorAll('[data-vac-rec]').forEach(b=>b.onclick=()=>openVacPanel(vacRows.find(r=>r.employee_id===b.dataset.vacRec)));
  }
  async function openVacPanel(r){
    $('vacPanel').dataset.id=r.employee_id;$('vacPanelSub').textContent=`${r.name} · balance ${Number(r.balance).toFixed(2)} hours`;
    setVacMode('taken');$('vacAdjHours').value='';$('vacAdjNote').value='';$('vacHours').value='';$('vacDate').value=iso(new Date());$('vacNoteIn').value='';$('vacPanelMsg').textContent='';$('vacHistory').textContent='Loading…';
    $('vacPanel').classList.remove('hide');$('vacHours').focus();
    try{const h=(await api(`/api/manager?view=vacation_history&employeeId=${encodeURIComponent(r.employee_id)}`)).history||[];
      $('vacHistory').innerHTML=h.length?h.map(x=>`<div class="vacHist">${x.kind==='adjust'?`<span class="adjTag">Adjust</span> <b>${x.hours>0?'+':''}${Number(x.hours).toFixed(2)} h</b>`:`<b>${Number(x.hours).toFixed(2)} h</b>`} <span class="muted">· ${esc(x.taken_on)}${x.note?' · '+esc(x.note):''}</span></div>`).join(''):'<span class="muted">No vacation recorded yet.</span>';}catch{$('vacHistory').textContent='';}
  }
  function setVacMode(m){$('vacPanel').dataset.mode=m;document.querySelectorAll('[data-vac-mode]').forEach(b=>b.classList.toggle('on',b.dataset.vacMode===m));$('vacTakenForm').classList.toggle('hide',m!=='taken');$('vacAdjForm').classList.toggle('hide',m!=='adjust');$('vacPanelMsg').textContent='';}
  async function saveVacAdjust(){
    const id=$('vacPanel').dataset.id,hours=Number($('vacAdjHours').value),note=$('vacAdjNote').value.trim(),msg=$('vacPanelMsg'),r=vacRows.find(x=>x.employee_id===id)||{};
    if(!hours||!Number.isFinite(hours))return msg.textContent='Enter the hours: 8 adds, -8 takes away.';if(!note)return msg.textContent='Write a short reason.';
    if(!confirm(`${hours>0?'Add':'Take away'} ${Math.abs(hours)} vacation hours ${hours>0?'to':'from'} ${r.name}'s balance?`))return;
    msg.textContent='Saving…';
    try{await api('/api/manager',{method:'POST',body:JSON.stringify({action:'vacation_adjust',employeeId:Number(id),hours,note})});$('vacPanel').classList.add('hide');toast('Balance adjusted.');await loadVacations();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  async function saveVac(){
    if($('vacPanel').dataset.mode==='adjust')return saveVacAdjust();
    const id=$('vacPanel').dataset.id,hours=Number($('vacHours').value),day=$('vacDate').value,msg=$('vacPanelMsg');
    if(!(hours>0))return msg.textContent='Enter the hours taken.';if(!day)return msg.textContent='Choose the date.';
    {const r=vacRows.find(x=>x.employee_id===id);if(r&&!r.eligible&&!confirm(r.start_date?`${r.name} is not eligible for paid vacation until ${fmtYmd(r.eligible_from)} (first full year). Record it anyway?`:`${r.name} has no start date in Employees, so eligibility can't be checked. Record it anyway?`))return;}
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
    $('siQty').value=it?it.quantity:'';$('siFull').value=it&&it.full_qty?it.full_qty:'';$('siMin').value=it&&it.low_at?it.low_at:'';setSiMode(it?.stock_mode==='demand'?'demand':'min');$('supItemDelete').classList.toggle('hide',isNew);$('siActive').value=!it||it.active?'1':'0';
    $('supItemMsg').textContent='';$('supItemSave').textContent=isNew?'Add item':'Save';
    $('supItemPanel').classList.remove('hide');(isNew?$('siName'):$('siQty')).focus();
  }
  function setSiMode(m){
    document.querySelectorAll('[data-si-mode]').forEach(b=>{const on=b.dataset.siMode===m;b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false');});
    $('siMode').dataset.mode=m;document.querySelectorAll('.siStockF').forEach(l=>l.classList.toggle('hide',m==='demand'));$('siAlertHint').classList.toggle('hide',m==='demand');
    $('siModeHint').textContent=m==='demand'?'Not kept on the shelf: you buy it when a painter asks. No stock count, no minimum and no low alert.':'Kept on the shelf. You get an alert when it drops below the minimum.';
  }
  document.querySelectorAll('[data-si-mode]').forEach(b=>b.onclick=()=>setSiMode(b.dataset.siMode));
  async function saveSupItem(){
    const id=$('supItemPanel').dataset.id,isNew=!id,msg=$('supItemMsg');
    const body={action:'item',name:$('siName').value.trim(),category:$('siCat').value.trim(),unit:$('siUnit').value.trim(),quantity:Number($('siQty').value||0),full_qty:$('siFull').value===''?'':Number($('siFull').value),low_at:Number($('siMin').value||0),active:$('siActive').value==='1',stock_mode:$('siMode').dataset.mode||'min'};
    if(body.stock_mode==='demand'){body.quantity=0;body.low_at=0;body.full_qty='';}
    if(!body.name)return msg.textContent='Enter an item name.';
    if(!Number.isInteger(body.quantity)||body.quantity<0)return msg.textContent='Quantity must be a whole number, 0 or more.';
    if(!Number.isInteger(body.low_at)||body.low_at<0)return msg.textContent='Minimum to keep must be a whole number, 0 or more.';
    if(body.full_qty!==''&&(!Number.isInteger(body.full_qty)||body.full_qty<0))return msg.textContent='Full stock must be a whole number, 0 or more.';
    if(body.full_qty!==''&&body.full_qty>0&&body.quantity>body.full_qty)body.full_qty=body.quantity;
    if(!isNew)body.id=Number(id);
    msg.textContent='Saving…';
    try{await api('/api/supplies',{method:isNew?'POST':'PATCH',body:JSON.stringify(body)});$('supItemPanel').classList.add('hide');toast(isNew?'Item added.':'Item updated.');await loadSupplies();}
    catch(e){msg.textContent=displayMessage(e.payload||e.message);}
  }
  function initSupplies(){
    supReqBar=makeDateBar('supReqDates',loadSupplies);supStockBar=makeDateBar('supStockDates',loadSupplies);supLogBar=makeDateBar('supLogDates',loadSupplies);
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
    document.querySelectorAll('[data-uni-tab]').forEach(b=>b.onclick=()=>{uniTabs[b.dataset.uniSec]=b.dataset.uniTab;renderUniReqList(b.dataset.uniSec);renderUniforms();});
    uniReqBar=makeDateBar('uniReqDates',loadUniforms);uniPReqBar=makeDateBar('uniPReqDates',loadUniforms);uniInvBar=makeDateBar('uniInvDates',loadUniforms);uniFreeBar=makeDateBar('uniFreeDates',loadUniforms);uniBuyBar=makeDateBar('uniBuyDates',loadUniforms);
    $('uniRefresh').onclick=loadUniforms;
    $('usCancel').onclick=()=>$('uniStockPanel').classList.add('hide');$('usSave').onclick=saveUniStock;
    $('usMode').onchange=()=>{$('usQtyLbl').textContent=$('usMode').value==='add'?'How many arrived':'Exact number on the shelf';};
    $('uniGiveBtn').onclick=openUniGive;$('ugCancel').onclick=()=>$('uniGivePanel').classList.add('hide');$('ugSave').onclick=saveUniGive;
    const tu=$('toggleUniLog'),bu=$('uniLogBody');tu.onclick=()=>setSection(tu,bu,bu.classList.contains('hide'));
    $('uniPriceSave').onclick=saveUniPrices;
    vacBar=makeDateBar('vacDates',loadVacations,{year:true,initial:'year'});vacHistBar=makeDateBar('vacHistDates',loadVacHistory,{year:true,initial:'year'});
    $('vacSearch').oninput=renderVacations;$('vacShowAll').onchange=renderVacations;
    document.querySelectorAll('[data-vac-mode]').forEach(b=>b.onclick=()=>setVacMode(b.dataset.vacMode));
    $('vacCancel').onclick=()=>$('vacPanel').classList.add('hide');$('vacSave').onclick=saveVac;
    $('vacPanel').onclick=e=>{if(e.target===$('vacPanel'))$('vacPanel').classList.add('hide');};
    pollSupplies();setInterval(pollSupplies,30000);loadVehAlerts();setInterval(loadVehAlerts,600000);
  }
  // Section menu: Dashboard, Employees, Supplies, Settings. Each section shows
  // its own cards (tagged data-page) in the original layout; the address keeps
  // the section (#/employees) so refresh and the back button stay put.
  const MGR_PAGES=['dashboard','vacations','supplies','uniforms','performance','employees','resources','vehicles','projects','help'];
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
    ['clockInEdit','customReview','empPanel','supItemPanel','vacPanel','uniStockPanel','uniGivePanel','recPanel','vehPanel','mntPanel','projPanel'].forEach(id=>{const m=$(id);if(m)m.classList.add('hide');});
    const open=(btn,body)=>{if($(body)&&$(body).classList.contains('hide'))setSection($(btn),$(body),true);};
    if(pg==='supplies'){loadSupplies();loadUsage();}
    if(pg==='uniforms')loadUniforms();
    if(pg==='vacations')loadVacations();
    if(pg==='employees'){open('toggleEmployees','employeesBody');renderPeople();loadRecords();}
    if(pg==='performance')loadPerf();
    if(pg==='resources')loadResources();
    if(pg==='vehicles')loadVehicles();
    if(pg==='projects')loadProjects();
    if(pg==='help')renderMgrHelp();
    document.title=({dashboard:'Dashboard',vacations:'Vacations',supplies:'Supplies',uniforms:'Uniforms',performance:'Performance',employees:'Employees',resources:'Job Resources',vehicles:'Vehicles',projects:'Projects',help:'Help'})[pg]+' · WorkClock Manager';if($('mgrSectionName'))$('mgrSectionName').textContent=document.title.split(' · ')[0];{const n=(supKnownPending||0)+(uniKnownPending||0);if(n)document.title=`(${n}) `+document.title;}
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
    $('empPanelDelete').onclick=deleteEmpPanel;
    $('empPanel').onclick=e=>{if(e.target===$('empPanel'))closeEmpPanel();};
    $('epPin').oninput=()=>{$('epPin').value=$('epPin').value.replace(/\D/g,'').slice(0,4);};
    initSupplies();
    initRecords();
    initPerf();
    initCompany();
    $('mHelpSearch').oninput=renderMgrHelp;
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
