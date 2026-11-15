/* Madar v4.52 — at-a-glance command center for the existing local-first learning app.
 * Presentation only: never grants mastery, uploads a source, changes permissions,
 * or mutates learner data. All counters come from recorded local state/localhost. */
(()=>{
 'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=s=>document.querySelector(s);
 const safeInt=n=>Math.max(0,Number.isFinite(Number(n))?Math.floor(Number(n)):0);
 const arabic=n=>new Intl.NumberFormat('fa-IR').format(safeInt(n));
 const pct=(done,total)=>total?Math.min(100,Math.round(safeInt(done)*100/safeInt(total))):0;
 const fmtDate=()=>new Intl.DateTimeFormat('fa-IR-u-ca-persian',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
 function source(){
  try{
   const x=JSON.parse(localStorage.getItem('madar-last-pdf-v450')||'null');
   if(x&&['books','vault'].includes(x.kind)&&typeof x.name==='string'&&x.name.length<260)return x;
  }catch{}return null;
 }
 function data(){
  const subjects=Array.isArray(state.subjects)?state.subjects:[];
  const completed=state.completed||{};
  const basicDone=['python','math'].reduce((n,t)=>n+(Array.isArray(completed[t])?completed[t].length:0),0);
  const subjectDone=subjects.reduce((n,s)=>n+(Array.isArray(state.subjectProgress?.[s.id])?state.subjectProgress[s.id].length:0),0);
  const lessonsTotal=['python','math'].reduce((n,t)=>n+(COURSE[t]?.lessons?.length||0),0)+subjects.reduce((n,s)=>n+(s.lessons?.length||0),0);
  const accepted=basicDone+subjectDone;
  const verifiedBuiltIn=Object.values(state.assessments||{}).filter(a=>a?.scientificVerification==='ai-reviewed'&&a?.passed&&a?.total===5).length;
  const verifiedSubjects=Object.values(state.subjectDrafts||{}).filter(d=>d?.aiReviewStatus==='passed'&&d?.passed).length;
  const verified=Math.min(accepted,verifiedBuiltIn+verifiedSubjects);
  const cards=Array.isArray(state.flashcards)?state.flashcards:[];
  const due=cards.filter(c=>!c.dueAt||String(c.dueAt).slice(0,10)<=today()).length;
  const sessions=Array.isArray(state.sessions)?state.sessions:[];
  const todaySessions=sessions.filter(s=>s?.date===today());
  const todayMinutes=todaySessions.reduce((n,s)=>n+Math.max(0,Number(s.minutes)||0),0);
  const latestObserver=state.observerCurrent&&typeof state.observerCurrent.title==='string'?state.observerCurrent.title.trim():'';
  const graphLinks=Array.isArray(state.scienceLinks)?state.scienceLinks.length:0;
  return {subjects,lessonsTotal,accepted,verified,due,cards:cards.length,graphLinks,todayMinutes,todaySessions:todaySessions.length,
    pythonDone:safeInt(completed.python?.length),pythonTotal:COURSE.python.lessons.length,
    mathDone:safeInt(completed.math?.length),mathTotal:COURSE.math.lessons.length,
    latestObserver,book:source(),overall:pct(accepted,lessonsTotal)};
 }
 function progressRail(label,done,total,nav,icon){
  const percent=pct(done,total);
  return `<button type="button" class="m452-course-row" data-nav="${nav}" aria-label="${escape(label)}؛ ${arabic(done)} از ${arabic(total)} درس">
    <span class="m452-course-icon" aria-hidden="true">${icon}</span>
    <span class="m452-course-body"><span class="m452-course-title">${escape(label)}<small>${arabic(done)} از ${arabic(total)} مرحله</small></span>
      <span class="m452-rail"><span style="width:${percent}%"></span></span></span>
    <strong class="m452-percent">${arabic(percent)}٪</strong></button>`;
 }
 function badge(text,cls=''){return `<span class="m452-tag ${cls}">${escape(text)}</span>`}
 function markup(){
  const d=data();
  const current=d.book?escape(d.book.name):'هنوز کتابی برای ادامهٔ مطالعه ثبت نشده';
  const lesson=state.lastPlace?.track&&COURSE[state.lastPlace.track]
    ?COURSE[state.lastPlace.track].lessons.find(x=>x.id===state.lastPlace.id):null;
  const active=lesson?escape(lesson.title):'از مسیرهای آموزشی یکی را انتخاب کن';
  const subjectRows=d.subjects.slice(0,2).map(s=>{
   const done=state.subjectProgress?.[s.id]?.length||0,total=s.lessons?.length||0;
   return `<div class="m452-subject"><span title="${escape(s.title)}">${escape(s.title)}</span><strong>${arabic(done)} / ${arabic(total)}</strong></div>`;
  }).join('');
  return `<section class="m452-dashboard" aria-label="داشبورد لحظه‌ای مَدار">
   <div class="m452-hero">
    <div class="m452-hero-main"><div class="m452-eyebrow">⛩️ مرکز یادگیری مَدار <span class="m452-hero-date">${escape(fmtDate())}</span></div>
     <h2>مسیر یادگیری، یک نگاه.</h2><p>وضعیت منابع، درس‌ها، پیش‌نیازها و مرورهای امروز در یک صفحه؛ بدون جست‌وجو در منوها.</p>
     <div class="m452-hero-buttons"><button type="button" class="m452-btn m452-btn-primary" data-madar-pdf-select="1">📖 انتخاب PDF</button>
      <button type="button" class="m452-btn m452-btn-quiet" data-nav="observer">✦ مربی دوره <small>آزمایشی</small></button></div></div>
    <div class="m452-health" aria-label="وضعیت اجرای مَدار">
     <div><span class="m452-light" id="m452-local-light"></span><strong>مغز داخلی</strong><span id="m452-local-status">در حال بررسی…</span></div>
     <div><span class="m452-light" id="m452-ai-light"></span><strong>مربی AI</strong><span id="m452-ai-status">در حال بررسی…</span></div>
     <div><span class="m452-light m452-light-warm"></span><strong>چرخهٔ PDF</strong><span>نمایش آماده؛ اتصال به آموزش تأییدنشده</span></div>
    </div>
   </div>
   <div class="m452-kpis" aria-label="شاخص‌های واقعی پیشرفت">
    <button type="button" data-nav="review" class="m452-kpi"><span class="m452-kpi-symbol">◷</span><span class="m452-kpi-label">مرورهای موعددار</span><strong>${arabic(d.due)}</strong><small>${d.due?'نیازمند مرور':'فعلاً مرور موعددار ثبت نشده'}</small></button>
    <button type="button" data-nav="skills" class="m452-kpi"><span class="m452-kpi-symbol">◈</span><span class="m452-kpi-label">قبولی ثبت‌شده</span><strong>${arabic(d.accepted)}<em>/${arabic(d.lessonsTotal)}</em></strong><small>نه تأیید قطعی تسلط علمی</small></button>
    <button type="button" data-nav="skills" class="m452-kpi"><span class="m452-kpi-symbol">✓</span><span class="m452-kpi-label">ارزیابی AI ثبت‌شده</span><strong>${arabic(d.verified)}</strong><small>طبق سوابق ذخیره‌شده</small></button>
    <button type="button" data-nav="history" class="m452-kpi"><span class="m452-kpi-symbol">☀</span><span class="m452-kpi-label">مطالعهٔ ثبت‌شده امروز</span><strong>${arabic(d.todayMinutes)}<em> دقیقه</em></strong><small>${arabic(d.todaySessions)} جلسهٔ ثبت‌شده</small></button>
   </div>
   <div class="m452-main-grid">
    <section class="m452-panel m452-reading"><div class="m452-panel-head"><div><small>ادامه از همان‌جا</small><h3>منبع آموزشی جاری</h3></div>${badge('ذخیرهٔ محلی','teal')}</div>
     <div class="m452-source"><div class="m452-source-image" aria-hidden="true">📘</div><div class="m452-source-data"><span>آخرین PDF</span><h4>${current}</h4><p id="m452-books-caption">در حال بررسی کتاب‌های روی D…</p></div></div>
     ${d.latestObserver?`<div class="m452-observer-note"><span>▶ دورهٔ ویدئویی اخیر:</span> ${escape(d.latestObserver)} <button type="button" data-nav="observer">ادامه در ناظر</button></div>`:''}
     <div class="m452-action-row"><button type="button" class="m452-btn m452-btn-primary" data-madar-pdf-last="1">ادامهٔ مطالعه</button>
      <button type="button" class="m452-btn m452-btn-outline" data-madar-pdf-library="1">کتاب‌های من</button></div>
     <div class="m452-next"><span class="m452-next-ico" aria-hidden="true">✧</span><div><strong>گام بعدی درس‌های داخلی</strong><p>${active}</p></div>
      <button type="button" data-nav="${state.lastPlace?.track==='math'?'math':'python'}" aria-label="بازکردن دورهٔ داخلی">↖</button></div>
    </section>
    <section class="m452-panel"><div class="m452-panel-head"><div><small>نقشهٔ پیشرفت</small><h3>دوره‌ها و مهارت‌ها</h3></div>${badge(arabic(d.overall)+'٪ ثبت‌شده')}</div>
     <p class="m452-hint">پیشرفت بر اساس قبولی‌های ذخیره‌شده است؛ شواهد ۷ و ۳۰ روزه جداگانه سنجیده می‌شوند.</p>
     <div class="m452-courses">
      ${progressRail('پایتون پژوهشی',d.pythonDone,d.pythonTotal,'python','⌘')}
      ${progressRail('ریاضی بنیادی',d.mathDone,d.mathTotal,'math','∑')}
     </div>
     <div class="m452-subjects">${subjectRows||'<span class="m452-muted">هنوز حوزهٔ علمی شخصی ثبت نشده است.</span>'}</div>
     <div class="m452-network-status">${arabic(d.subjects.length)} حوزهٔ شخصی · ${arabic(d.graphLinks)} پیوند ثبت‌شده در شبکه (از جمله نمونه‌های آموزشی)</div>
     <div class="m452-links"><button type="button" data-nav="skills">نقشهٔ مهارت ←</button><button type="button" data-nav="knowledgeGraph">شبکهٔ انسجام علمی ←</button></div>
    </section>
   </div>
   <div class="m452-footer-grid">
    <section class="m452-mini-panel"><span class="m452-mini-icon">🧠</span><div><h3>مربی هوشمند و پروتکل</h3><p>ناظر ویدئو آزمایشی است. درس‌های داخلی، آزمون و مرور موجودند؛ اتصال سرتاسری PDF/ویدئو هنوز تأیید نشده.</p></div><button type="button" data-nav="observer">بازکردن ناظر ←</button></section>
    <section class="m452-mini-panel"><span class="m452-mini-icon">⛩</span><div><h3>مسیر علمی و معبد دانش</h3><p>درخت پیش‌نیازها، پیوند علوم و مسیرهای شخصی بدون حذف یا بازنویسی سوابق قبلی در دسترس‌اند.</p></div><button type="button" data-nav="sciences">علوم شخصی من ←</button></section>
    <section class="m452-mini-panel"><span class="m452-mini-icon">↻</span><div><h3>آمادگی امروز</h3><p>${d.due?`${arabic(d.due)} فلش‌کارت موعددار داری.`:'مرور عقب‌افتادهٔ ثبت‌شده‌ای نداری.'} آزمون تأخیری ۷/۳۰ روزه جداگانه نیاز به بررسی دارد.</p></div><button type="button" data-nav="review">رفتن به مرور ←</button></section>
   </div>
  </section>`;
 }
 function fillRemote(){
  const local=$('#m452-local-status'),ai=$('#m452-ai-status'),books=$('#m452-books-caption');
  const token=Date.now();const dash=$('.m452-dashboard');if(!dash)return;dash.dataset.request=String(token);
  const active=()=>dash.isConnected&&dash.dataset.request===String(token);
  fetch('/api/health',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('health');return r.json()}).then(h=>{
   if(!active())return;
   if(h.applicationId!=='madar-local')throw Error('other service');
   local.textContent='سرور پاسخ می‌دهد · نسخه '+String(h.version||'نامشخص');$('#m452-local-light')?.classList.add('is-on');
   const c=h.chatgptPlan||{};
   if(c.connected&&c.permission){ai.textContent='مجوز حساب گزارش‌شده · درخواست واقعی آزموده‌نشده';$('#m452-ai-light')?.classList.add('is-warm')}
   else if(c.connected){ai.textContent='ورود گزارش‌شده؛ مجوز استفاده تأیید نشده'}
   else if(h.onlineAIConfigured){ai.textContent='تنظیم AI گزارش‌شده؛ اجرای زنده آزموده‌نشده'}
   else{ai.textContent='اتصال فعال تأیید نشده'}
  }).catch(()=>{if(active()){local.textContent='سرور پاسخ نداد';ai.textContent='وضعیت نامشخص'}});
  fetch('/api/local-pdf/list',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('books');return r.json()}).then(x=>{
   if(!active())return;
   const n=Array.isArray(x.books)?x.books.length:0;
   books.textContent=arabic(n)+' کتاب محلی شناسایی شد · مسیر D';
  }).catch(()=>{if(active())books.textContent='فهرست کتاب‌ها در دسترس نیست';});
 }
 function mount(){
  if(view!=='dashboard')return;
  const root=$('#page-root');if(!root)return;
  const original=root.querySelector('.madar-fast-start');
  if(original)original.outerHTML=markup();
  else if(!root.querySelector('.m452-dashboard'))root.insertAdjacentHTML('afterbegin',markup());
  fillRemote();
  const eyebrow=$('#page-eyebrow'),title=$('#page-title');
  if(eyebrow)eyebrow.textContent='نمای کلی آموزش';if(title)title.textContent='داشبورد من';
 }
 function simplifySidebar(){
  const quick=$('.madar-nav-quick'),extra=$('.madar-more .madar-nav-items');if(!quick||!extra)return;
  for(const name of ['python','math','review']){const button=quick.querySelector(`[data-nav="${name}"]`);if(button)extra.append(button)}
  const first=quick.querySelector('[data-nav="dashboard"]');if(first)first.innerHTML='<span class="nav-ico">◫</span> داشبورد من';
  if(!quick.querySelector('[data-nav="observer"]')){
   const coach=document.createElement('button');coach.type='button';coach.className='nav-item';coach.dataset.nav='observer';
   coach.innerHTML='<span class="nav-ico">✦</span> مربی آموزشی <small class="m452-nav-caption">آزمایشی</small>';quick.append(coach);
  }
  if(!quick.querySelector('[data-nav="skills"]')){
   const skills=document.createElement('button');skills.type='button';skills.className='nav-item';skills.dataset.nav='skills';
   skills.innerHTML='<span class="nav-ico">◈</span> پیشرفت و مهارت';quick.append(skills);
  }
  // No module or data is removed; the technical navigation remains discoverable.
  const more=$('.madar-more>summary');if(more)more.innerHTML='⚙ نقشهٔ علمی، درس‌ها و تنظیمات <span class="madar-chevron">⌄</span>';
  const version=$('.build-inline');if(version){version.title='v4.52 14050824 SU GPT-6 LEARNING_OVERVIEW_D';version.textContent='v4.52'}
 }
 simplifySidebar();
 const previous=render;
 render=function(){previous();mount()};
 render();
 window.MadarDashboard452={refresh:()=>{if(view==='dashboard')render()}};
})();
