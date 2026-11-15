'use strict';
/* v4.20 Installed disk vault. Starts automatically with Windows after one-time install; no direct file:// disk access.
   Copies files into Madar-managed data folder; originals are NEVER deleted. */
(function(){
  let snapshot={projects:[],files:[],links:[],audit:[],importRootEnabled:false,serverVault:false};
  let busy=false, preview=null, outline=null, ocrInfo=null, currentProject='', fullOcr=null, ocrPage=null, ocrTarget='', aiJobsSummary=[], aiProviderSummary=null;
  const esc=s=>cleanText(String(s??''));
  const size=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB';
  const isServer=()=>location.protocol==='http:' && ['localhost','127.0.0.1'].includes(location.hostname);
  async function api(path,opt={}){
    const r=await fetch('/api/vault/'+path,{cache:'no-store',...opt});
    let d;try{d=await r.json()}catch{throw Error('پاسخ سرور پروژه معتبر نیست.')}if(!r.ok)throw Error(d.error||'خطای سرور '+r.status);return d;
  }
  const post=(name,data)=>api(name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  async function refresh(silent=false){
    if(!isServer()){snapshot.serverVault=false;if(!silent)render();return}
    try{snapshot=await api('list');
      if(isServer()){
        const candidates=ocrTarget?[snapshot.files.find(f=>f.id===ocrTarget)].filter(Boolean):snapshot.files.filter(f=>f.name.toLowerCase().endsWith('.pdf')).slice(0,8);
        for(const f of candidates){
          try{
            const job=await api('ocr-status?id='+encodeURIComponent(f.id));
            if(job.status!=='not_started'){
              ocrTarget=f.id;fullOcr=job;break;
            }
          }catch(e){}
        }
      }
      if(!silent)render();}catch(e){snapshot.serverVault=false;if(!silent){render();showToast('سرور فایل‌ها در دسترس نیست: '+e.message)}}
  }
  function projectSelect(id){return `<select aria-label="انتخاب پروژه" class="select-field vault-select" data-for="${esc(id)}"><option value="">انتخاب پروژه...</option>${snapshot.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select>`}
  function fileRow(f){const links=snapshot.links.filter(l=>l.file_id===f.id).map(l=>snapshot.projects.find(p=>p.id===l.project_id)).filter(Boolean);
    return `<article class="vault-file"><div class="vault-file-title"><strong>${esc(f.name)}</strong><span class="mini muted">${esc(size(f.size))} · SHA-256: ${esc(f.sha256?.slice(0,12))}…</span></div><div class="mini muted">${links.length?'متصل به: '+links.map(p=>esc(p.title)).join('، '):'هنوز به پروژه‌ای متصل نشده'}</div><div class="vault-actions"><label class="mini muted">زبان متن <select aria-label="زبان متن فایل" class="select-field vault-language" data-for="${esc(f.id)}"><option value="fa">فارسی</option><option value="en">انگلیسی</option><option value="mixed">چندزبانه</option></select></label><button class="button button-outline button-sm" data-vault="preview" data-id="${esc(f.id)}">خواندن متن</button>${f.name.toLowerCase().endsWith('.pdf')?`<button class="button button-primary button-sm" data-vault="ocr-start" data-id="${esc(f.id)}">پردازش کامل PDF فارسی</button>`:''}<button class="button button-outline button-sm" data-vault="outline" data-id="${esc(f.id)}">بررسی فصل‌ها</button><button class="button button-outline button-sm" data-vault="download" data-id="${esc(f.id)}">دریافت</button><button class="button button-outline button-sm" data-vault="project-file" data-id="${esc(f.id)}">تبدیل به پروژه</button>${projectSelect(f.id)}<button class="button button-outline button-sm" data-vault="attach" data-id="${esc(f.id)}">افزودن به پروژه</button><button class="button button-outline button-sm" data-vault="learn" data-id="${esc(f.id)}">ورود به چرخهٔ آموزش</button><button class="button button-outline button-sm danger-text" data-vault="delete" data-id="${esc(f.id)}">حذف از دیسک مَدار</button></div></article>`}
  function renderVault(){if(!isServer())return `<div class="intro"><div><h2>پروژه‌ها و فایل‌های واقعی</h2><p>این فایل HTML مستقل است و به دلایل امنیتی نمی‌تواند فایل‌های دیسک را بخواند یا حذف کند.</p></div></div><div class="notice warning">برای استفادهٔ خودکار، کافی است بستهٔ کامل ویندوز را <strong>فقط یک‌بار نصب</strong> کنی؛ بعد از آن سرویس هنگام ورود به ویندوز خودکار اجرا می‌شود و مَدار را از میان‌بر روی دسکتاپ باز می‌کنی. هیچ فرمان یا BAT روزانه لازم نیست.</div>`;
    return `<div class="intro"><div><h2>پروژه‌ها و فایل‌های دیسکی</h2><p>بارگذاری فایل، ورود از مسیر محلی مجاز، تبدیل فایل به پروژه و ساخت پیش‌نویس درس از محتوا. فایل‌ها به پوشهٔ اختصاصی مَدار کپی می‌شوند.</p><p class="small muted">سرویس محلی با میان‌بر ویندوز خودکار اجرا می‌شود؛ نیاز به اجرای دستی در هر نوبت نیست.</p></div><div>${badge(snapshot.files.length+' فایل · '+snapshot.projects.length+' پروژه','green')}</div></div>
    ${!snapshot.serverVault?'<div class="notice warning">اتصال به مخزن دیسکی برقرار نشده؛ سرور محلی را اجرا کن.</div>':''}
    <section class="card"><div class="card-title"><h3>۱. افزودن فایل</h3>${badge('ذخیرهٔ واقعی روی دیسک','green')}</div><div class="form-grid"><div class="form-full"><label class="form-label">انتخاب از رایانه (تا ۴۰ مگابایت برای هر فایل)</label><input class="field" type="file" multiple id="vault-picker" ${busy?'disabled':''}></div><div class="form-full"><label class="form-label">یا واردکردن آدرس فایل در رایانه</label><input class="field" id="vault-path" dir="ltr" placeholder="D:\\Study\\notes.pdf" ${!snapshot.importRootEnabled?'disabled':''}><p class="small muted">${snapshot.importRootEnabled?'پوشهٔ مجاز ذخیره‌شده: '+esc(snapshot.importRoot||'—')+'؛ دفعهٔ بعد هم خودکار برقرار است.':'برای افزودن با آدرس، یک‌بار پوشهٔ ورودی را مجاز کن؛ انتخاب فایل در بالا بدون این تنظیم کار می‌کند.'}</p></div><div class="form-full"><button class="button button-outline button-sm" data-vault="set-import-root">⚙ ${snapshot.importRootEnabled?'تغییر پوشهٔ مجاز':'تنظیم یک‌بارهٔ پوشهٔ مجاز'}</button></div></div><button class="button button-outline" data-vault="import-path" ${!snapshot.importRootEnabled||busy?'disabled':''}>افزودن از آدرس محلی</button><div class="form-actions"><button class="button button-outline" data-vault="migrate-legacy">کپی فایل‌های کتابخانهٔ قبلی به پوشهٔ دیسکی</button></div><div class="notice">فایل انتخابی در <code>${esc(snapshot.dataFolder||"پوشهٔ دادهٔ مَدار")}/files</code> ذخیره می‌شود. حذف فایل از این صفحه نسخهٔ داخل پوشهٔ مَدار را هم حذف می‌کند، اما فایل اصلی در محل بیرونی را پاک نمی‌کند.</div></section>
    <section class="card"><div class="card-title"><h3>۲. پروژه‌های آموزشی</h3><button class="button button-primary" data-vault="new-project">＋ پروژهٔ جدید</button></div>${snapshot.projects.length?snapshot.projects.map(p=>{const ls=snapshot.links.filter(x=>x.project_id===p.id);return `<div class="vault-project"><div><strong>${esc(p.title)}</strong><div class="mini muted">${ls.length} فایل · ${esc(p.description||'پروژهٔ یادگیری')}</div></div><button class="button button-outline button-sm" data-vault="filter-project" data-id="${esc(p.id)}">مشاهدهٔ فایل‌ها</button>${ls.map(l=>{const f=snapshot.files.find(x=>x.id===l.file_id);return f?`<button class="button button-outline button-sm" data-vault="unlink" data-pid="${esc(p.id)}" data-id="${esc(f.id)}" title="حذف پیوند، بدون حذف فایل">قطع پیوند: ${esc(f.name.slice(0,25))}</button>`:''}).join('')}</div>`}).join(''):'<p class="muted">هنوز پروژه‌ای وجود ندارد؛ می‌توانی پروژه بسازی یا از یک فایل پروژه ایجاد کنی.</p>'}</section>
    <section class="card"><div class="card-title"><h3>۳. کتابخانهٔ دیسکی</h3><button class="button button-outline button-sm" data-vault="refresh">بازخوانی</button></div>${currentProject?`<div class="notice">فیلتر روی پروژهٔ انتخابی <button data-vault="clear-filter" class="subaction">نمایش همه</button></div>`:''}${(currentProject?snapshot.files.filter(f=>snapshot.links.some(l=>l.project_id===currentProject&&l.file_id===f.id)):snapshot.files).map(fileRow).join('')||'<p class="muted">هنوز فایلی در این بخش ذخیره نشده است.</p>'}</section>
    ${preview?`<section class="card" id="vault-preview"><div class="card-title"><h3>۴. پیش‌نمایش منبع: ${esc(preview.name)}</h3>${badge(preview.safeForLearning?'متن احتمالا خوانا':'هشدار: متن نامعتبر',preview.safeForLearning?'green':'amber')}</div><p class="small muted">${esc(preview.message)} ${preview.totalCharacters} نویسه استخراج شده است.</p>${!preview.safeForLearning?`<div class="notice warning"><strong>تولید محتوای آموزشی متوقف شد.</strong> ${esc((preview.qualityReasons||[]).join(' '))} برای متن فارسی مخدوش، از بخش «اتصال AI و خواندن PDF» استفاده کن؛ مدل بینایی صفحه‌ها را مستقیم می‌خواند و نتیجهٔ اصلاح‌شده جدا از متن خام نمایش داده می‌شود. فایل اصلی در کتابخانه محفوظ است.</div>`:`<div class="notice">تشخیص خوانایی جایگزین اعتبارسنجی علمی نیست. قبل از پذیرش، متن را با PDF اصلی مقایسه کن.</div>`}<textarea class="textarea" rows="11" readonly dir="auto">${esc(preview.text)}</textarea><div class="form-actions">${preview.safeForLearning?`<button class="button button-primary" data-vault="learn" data-id="${esc(preview.sourceFileId)}">ساخت پیش‌نویس درس در چرخهٔ آموزش</button><button class="button button-outline" data-vault="studio" data-id="${esc(preview.sourceFileId)}">ارسال متن به کارت‌ساز آفلاین</button>`:`<button class="button button-outline" data-vault="ocr" data-id="${esc(preview.sourceFileId)}">تلاش برای OCR فارسیِ آفلاین (۴ صفحهٔ اول)</button><button class="button button-primary" data-aipdf="jump">خواندن فارسی با AI متصل</button><button class="button button-outline" data-vault="ocr-check">بررسی آمادگی OCR</button>`}</div>${ocrInfo?`<div class="notice">${esc(ocrInfo.message)} · موتور: ${ocrInfo.engineAvailable?'دارد':'ندارد'} · نمایش PDF: ${ocrInfo.rendererAvailable?'دارد':'ندارد'} · زبان فارسی: ${ocrInfo.persianLanguageAvailable?'دارد':'ندارد'}</div>`:''}</section>`:''}
    ${outline?`<section class="card" id="vault-outline"><div class="card-title"><h3>۵. نقشهٔ منبع و بررسی فصل‌ها</h3>${badge(outline.safeForOutlineImport?'نیازمند تأیید':'ورود آموزشی مسدود',outline.safeForOutlineImport?'amber':'grey')}</div>
    <p class="small muted">${esc(outline.name)} · ${outline.inspectedPages} صفحه بررسی‌شده از ${outline.pageCount} صفحه · ${outline.readablePages} صفحهٔ خوانا · ${outline.suspectPages} صفحهٔ مشکوک</p>
    <div class="notice ${outline.safeForOutlineImport?'':'warning'}">${esc(outline.message)} ${esc((outline.qualityReasons||[]).join(' '))}</div>
    ${outline.chapters?.length?`<div class="vault-outline-list">${outline.chapters.map((ch,i)=>`<div class="vault-project"><strong>${i+1}. ${esc(ch.title)}</strong><span class="small muted">صفحهٔ ${ch.page} · پیش‌نویس نیازمند بازبینی</span></div>`).join('')}</div><div class="form-actions"><button class="button button-primary" data-vault="import-outline" ${!outline.safeForOutlineImport?'disabled':''}>افزودن فصل‌ها به علوم من (فقط پیش‌نویس)</button></div>`:''}
    <p class="small muted">در این مرحله هیچ سؤال، فلش‌کارت یا قبولی خودکاری ساخته نمی‌شود. عنوان‌ها فقط از متن PDF و با شمارهٔ صفحهٔ منبع به‌دست آمده‌اند.</p></section>`:''}
    <section class="card"><h3>۶. گزارش عملیات دیسک</h3>${snapshot.audit.slice(0,9).map(a=>`<div class="mini vault-log">${esc(a.at.slice(0,19))} | ${esc(a.event)} | ${esc(a.details)}</div>`).join('')||'<p class="muted">هنوز رویدادی ثبت نشده است.</p>'}<div class="notice warning">حذف قطعی تنها پس از واردکردن نام دقیق فایل انجام می‌شود؛ از محتوای دیسکِ مَدار خارج می‌شود و با پشتیبان قبلی قابل بازیابی است. این عملیات فایل منبع بیرون مَدار را دست‌کاری نمی‌کند.</div></section>`;
  }
  const originalRenderVault=renderVault;
  renderVault=function(){
    let html=originalRenderVault();
    if(!isServer())return html;
    if(fullOcr){
      const x=fullOcr;
      const label={'queued':'در صف','running':'در حال پردازش','paused':'مکث شده','completed':'تمام صفحات پردازش شد','error':'خطای پردازش','not_started':'هنوز آغاز نشده'}[x.status]||x.status;
      html+=`<section class="card" id="full-ocr-progress" aria-live="polite"><div class="card-title"><h3>پردازش کامل کتاب فارسی</h3>${badge(esc(label),x.status==='completed'?'green':'amber')}</div>
      <p class="small muted">${esc(x.name||'منبع منتخب')} · ${esc(x.processed||0)} از ${esc(x.pageCount||'؟')} صفحه · ${esc(x.percent||0)}٪</p>
      <progress value="${Number(x.processed||0)}" max="${Number(x.pageCount||1)}" style="width:100%;height:14px"></progress>
      ${x.error?`<div class="notice warning">${esc(x.error)}</div>`:''}
      <p class="small muted">هر صفحه جداگانه ذخیره می‌شود. اگر برنامه بسته شود، از صفحات ذخیره‌شده ادامه پیدا می‌کند. داده‌ها فقط روی این دستگاه‌اند.</p>
      <div class="form-actions">${x.status==='running'||x.status==='queued'?`<button class="button button-outline" data-vault="ocr-pause">مکث پس از صفحهٔ فعلی</button>`:`<button class="button button-outline" data-vault="ocr-resume">${x.status==='completed'?'بررسی وضعیت':'ادامهٔ پردازش'}</button>`}
      <button class="button button-outline" data-vault="ocr-read-page">نمایش متن صفحات</button>
      ${x.status==='completed'?`<button class="button button-primary" data-vault="ocr-outline">استخراج فصل‌ها از تمام صفحات</button>`:''}</div>
      ${ocrPage?.pages?.length?`<div class="notice"><strong>نمونهٔ متن با شمارهٔ صفحه:</strong><div class="form-actions"><button class="button button-outline button-sm" data-vault="ocr-next-page">صفحات بعدی</button></div>${ocrPage.pages.map(pg=>`<p class="small">صفحه ${pg.page} · ${esc(pg.qualityStatus)}</p><textarea class="textarea" rows="5" readonly dir="auto">${esc(pg.text)}</textarea>`).join('')}</div>`:''}
      <div class="notice warning">OCR فقط بازیابی متن است، نه تأیید علمی. درس‌ها و پنج سؤال پس از بررسی منبع و ارزیابی AI معتبر می‌شوند.</div></section>`;
    }
    return html;
  };
  async function updateOcr(){if(!ocrTarget)return;try{fullOcr=await api('ocr-status?id='+encodeURIComponent(ocrTarget));if(view==='vault')render();}catch(e){showToast('وضعیت OCR: '+e.message)}}
  setInterval(()=>{if(view==='vault'&&ocrTarget&&fullOcr&&['running','queued'].includes(fullOcr.status))updateOcr()},3500);
  const originalRender=render;
  render=function(){
    if(view==='vault'){document.querySelector('#page-eyebrow').textContent='کتابخانه و پروژه‌ها';document.querySelector('#page-title').textContent='مدیریت فایل روی دیسک';document.querySelector('#page-root').innerHTML=renderVault();document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.nav==='vault'));return}
    originalRender();
    if(view==='dashboard'&&isServer()){
      const cloud=Object.entries(aiProviderSummary?.providers||{}).filter(([p,st])=>p!=='ollama'&&st.configured).map(([p,st])=>p+' / '+(st.model||'')).join('، ');
      const recent=aiJobsSummary[0];
      const tag=recent?'آخرین بازخوانی PDF: '+recent.done+' از '+recent.total+' صفحه ('+recent.percent+'٪)، '+recent.status:'هنوز کار چندصفحه‌ای ثبت نشده';
      document.querySelector('#page-root')?.insertAdjacentHTML('afterbegin',`<section class="card" id="madar-project-status" style="margin-block-end:18px"><div class="card-title"><h3>مرکز وضعیت پروژه و AI مَدار</h3>${badge('گزارش نسخهٔ v4.48','grey')}</div>
        <div class="notice"><strong>پذیرش مسیر اصلی محصول: ۰ از ۵ معیار P0</strong> — این عدد درصد کدنویسی نیست؛ تا آزمون واقعی و مستقلِ منبع، تدریس و سنجش کامل نشود افزایش نمی‌یابد.</div>
        <p class="small">اتصال AI ابری: ${esc(cloud||'مدل دارای اعتبار ثبت‌شده شناسایی نشد')} <span class="muted">(پیکربندی‌شده؛ نه الزاماً آزمایش‌شدهٔ زنده)</span></p>
        <p class="small">${esc(tag)}</p>
        <p class="small muted">مانع فعال: تأیید زندهٔ بازخوانی فارسیِ کتاب و کیفیت متن. اولویت‌های بعد: دورهٔ مستند ← تدریس پنج‌سؤالی ← سنجش AI ← مرور پایدار.</p>
        <div class="form-actions"><button class="button button-primary button-sm" data-nav="vault">رفتن به اتصال AI و کتابخانه</button></div></section>`);
    }
    if(view==='library')document.querySelector('#page-root')?.insertAdjacentHTML('afterbegin','<section class="notice success"><strong>برای نگهداری فایل در پوشهٔ اصلی مَدار و اتصال آن به پروژه:</strong> <button class="button button-primary button-sm" data-nav="vault">پروژه‌ها و فایل‌های دیسکی</button></section>');
  };
  const nav=document.createElement('button');nav.className='nav-item';nav.dataset.nav='vault';nav.innerHTML='<span class="nav-ico">▣</span> پروژه‌ها و فایل‌های دیسکی';document.querySelector('[data-nav="library"]')?.after(nav);
  const lib=document.querySelector('[data-nav="library"]');if(lib)lib.title='فایل‌های ذخیره‌شده در مرورگر؛ برای فایل‌های واقعی دیسکی بخش کناری را باز کن';
  document.addEventListener('click',e=>{if(e.target.closest('[data-nav="vault"]'))refresh(true).then(()=>{if(view==='vault')render()});});
  async function upload(file){if(!file||!file.size)throw Error('فایل خالی است.');if(file.size>40*1024*1024)throw Error('حجم «'+file.name+'» بیش از ۴۰ مگابایت است.');return api('upload?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})}
  document.addEventListener('change',async e=>{if(e.target.id!=='vault-picker')return;let files=[...e.target.files],count=0; e.target.value='';
    for(const f of files){try{await upload(f);count++}catch(err){alert('بارگذاری «'+f.name+'» ناموفق بود: '+err.message)}}
    await refresh();if(count)showToast(count+' فایل در پوشهٔ اصلی مَدار ذخیره شد.');
  });
  async function learn(id,toStudio=false){const item=preview?.sourceFileId===id?preview:await api('preview?id='+encodeURIComponent(id)+'&language=fa');if(!item.safeForLearning || item.ocrPartial){preview=item;render();document.querySelector('#vault-preview')?.scrollIntoView();showToast(item.ocrPartial?'OCR فقط پیش‌نمایش چند صفحه است؛ برای ساخت دوره باید کل منبع بررسی شود.':'متن مخدوش است؛ درس و فلش‌کارت ساخته نشد.');return;}if(toStudio){navigate('cardStudio');document.querySelector('#studio-text').value=item.text;document.querySelector('#studio-topic').value=item.name;showToast('متن در کارت‌ساز قرار گرفت؛ صحت کارت‌ها را بررسی کن.');return}
    const linked=snapshot.links.find(x=>x.file_id===id),project=snapshot.projects.find(p=>p.id===linked?.project_id);
    const subjectTitle=project?.title||item.name.replace(/\.[^.]+$/,'');
    if(!confirm('پیش‌نویس درس با نام «'+subjectTitle+'» ساخته شود؟ متن هنوز آموزش تأییدشده نیست؛ پنج سؤال تا زمان بازبینی قفل می‌ماند.'))return;
    let subject=state.subjects.find(s=>s.title===subjectTitle);
    if(!subject){subject={id:uid(),title:subjectTitle,description:'پروژهٔ علمی برگرفته از فایل: '+item.name,goal:'فهم بنیادی، تحلیل منبع و تبدیل آن به درس گام‌به‌گام',lessons:[]};state.subjects.push(subject)}
    if(subject.lessons.some(l=>l.sourceFileId===id)){navigate('sciences');showToast('این فایل قبلاً وارد مسیر آموزشی شده است؛ از فهرست علوم باز کن.');return}
    subject.lessons.push({id:uid(),title:'مطالعه و بازبینی منبع: '+item.name.slice(0,90),goal:'استخراج پیش‌نیازها، چرایی و چگونگی، مثال و پنج سؤال از منبع',concept:'[پیش‌نویس استخراج‌شده؛ هنوز از نظر علمی بازبینی نشده]\n'+item.text.slice(0,6500),steps:'۱. مفاهیم بنیادین را از منبع استخراج کن\n۲. روابط و پیش‌نیازها را بررسی کن\n۳. مثال‌ها را گام‌به‌گام حل کن\n۴. پنج سؤال از آسان تا سخت تهیه و اعتبارسنجی کن',example:'برای این سند هنوز مثال حل‌شده و تأییدشده تولید نشده است.',exercise:'پس از تأیید منبع، پنج سؤال چندزاویه‌ای تهیه کن.',quiz:[],cards:[],sources:[],minutes:35,sourceFileId:id,reviewStatus:'needs-review',createdAt:new Date().toISOString()});
    if(!state.subjectProgress[subject.id])state.subjectProgress[subject.id]=[];
    save();navigate('sciences');showToast('منبع به چرخهٔ آموزش افزوده شد؛ برای ساخت آزمون پنج‌مرحله‌ای ویرایش درس را باز کن.');
  }
  document.addEventListener('click',async e=>{const el=e.target.closest('[data-vault]');if(!el)return;e.preventDefault();const act=el.dataset.vault,id=el.dataset.id;
    try{
      if(act==='refresh'){await refresh();return}
      if(act==='migrate-legacy'){
        const bridge=window.MADAR_LEGACY_FILE_BRIDGE;
        const list=bridge?.list()||[];
        if(!list.length){showToast('کتابخانهٔ قبلی فایلی ندارد.');return}
        if(!confirm('از '+list.length+' فایلِ ذخیره‌شده در مرورگر، یک نسخه در پوشهٔ اصلی دیسکی مَدار بسازیم؟ فایل‌های قبلی دست‌نخورده باقی می‌مانند.'))return;
        let done=0,failed=[];
        for(const meta of list){try{const blob=await bridge.getBlob(meta.id);if(!blob)throw Error('محتوای فایل در IndexedDB نیست.');await upload(new File([blob],meta.name,{type:meta.type||'application/octet-stream'}));done++}catch(error){failed.push(meta.name+': '+error.message)}}
        await refresh();alert(done+' فایل منتقل شد.'+(failed.length?'\n'+failed.length+' فایل ناموفق: '+failed.slice(0,8).join('؛ '):''));return;
      }
      if(act==='filter-project'){currentProject=id;render();return}
      if(act==='clear-filter'){currentProject='';render();return}
      if(act==='new-project'){const title=prompt('نام پروژهٔ علمی جدید:');if(!title)return;const p=await post('project',{title});await refresh();showToast('پروژهٔ «'+p.title+'» ساخته شد.');return}
      if(act==='set-import-root'){
        const path=prompt('پوشه‌ای را که اجازهٔ خواندن فایل‌هایش را به مَدار می‌دهی وارد کن. فقط همین پوشه و زیرپوشه‌هایش مجاز خواهند بود:',snapshot.importRoot||'');
        if(path===null||!path.trim())return;
        if(!confirm('اجازهٔ خواندن فایل‌های زیر این پوشه در دفعات بعد ذخیره شود؟\n'+path+'\n\nهیچ فایل خارج از آن بدون انتخاب مستقیم تو خوانده نمی‌شود.'))return;
        const result=await post('set-import-root',{path});await refresh();showToast(result.message);return;
      }
      if(act==='import-path'){const path=document.querySelector('#vault-path')?.value.trim();if(!path){showToast('آدرس فایل را وارد کن.');return}await post('import-path',{path});await refresh();showToast('فایل از پوشهٔ مجاز به پوشهٔ مدیریت‌شدهٔ مَدار کپی شد.');return}
      if(act==='project-file'){const name=snapshot.files.find(x=>x.id===id)?.name||'';const title=prompt('نام پروژه‌ای که از این فایل ساخته شود:',name.replace(/\.[^.]+$/,''));if(!title)return;await post('from-file',{fileId:id,title});await refresh();showToast('پروژه ساخته شد و فایل به آن متصل شد.');return}
      if(act==='attach'){const pid=document.querySelector(`.vault-select[data-for="${id}"]`)?.value;if(!pid){showToast('ابتدا پروژه را انتخاب کن.');return}await post('link',{projectId:pid,fileId:id});await refresh();showToast('فایل به پروژهٔ انتخابی متصل شد.');return}
      if(act==='unlink'){if(!confirm('فقط اتصال فایل به این پروژه قطع شود؟ خود فایل حذف نمی‌شود.'))return;await post('unlink',{projectId:el.dataset.pid,fileId:id});await refresh();showToast('پیوند فایل با پروژه حذف شد؛ فایل روی دیسک باقی ماند.');return}
      if(act==='outline'){
        const language=document.querySelector(`.vault-language[data-for="${id}"]`)?.value||'fa';
        outline=await api('source-outline?id='+encodeURIComponent(id)+'&language='+encodeURIComponent(language));
        render();document.querySelector('#vault-outline')?.scrollIntoView({behavior:'smooth'});return;
      }
      if(act==='import-outline'){
        const data=outline;
        if(!data||!data.safeForOutlineImport||!Array.isArray(data.chapters)||data.chapters.length<2)
          throw Error('فصل‌بندی منبع هنوز قابل ورود به آموزش نیست.');
        const meta=snapshot.files.find(f=>f.id===data.sourceFileId);
        if(!meta||meta.sha256!==data.sha256)throw Error('شناسه یا نسخهٔ فایل تغییر کرده است؛ دوباره بررسی کن.');
        if(!confirm('عنوان‌های استخراج‌شده فقط پیش‌نویس هستند و برای درس کامل نیاز به بررسی منبع و پنج سؤال دارند. '+data.chapters.length+' عنوان به مسیر آموزشی افزوده شود؟'))return;
        const linked=snapshot.links.find(x=>x.file_id===meta.id);
        const project=snapshot.projects.find(p=>p.id===linked?.project_id);
        const title=project?.title||meta.name.replace(/\.[^.]+$/,'');
        let subject=state.subjects.find(s=>s.title===title);
        if(!subject){subject={id:uid(),title,description:'دورهٔ پیشنهادی بر مبنای فصل‌های واقعی منبع: '+meta.name,
                         goal:'بازبینی منابع و آموزش بنیادی؛ هیچ قبولی خودکاری ندارد.',lessons:[]};state.subjects.push(subject)}
        let added=0;
        for(const ch of data.chapters){
          if(subject.lessons.some(l=>l.sourceFileId===meta.id && l.sourcePage===ch.page && l.title===ch.title))continue;
          subject.lessons.push({id:uid(),title:ch.title,goal:'بازبینی پیش‌نیازها و محتوای فصل در صفحهٔ '+ch.page,
             concept:'[فقط عنوان فصل استخراج شده؛ متن درس و صحت آن هنوز بررسی نشده است.]',
             steps:'۱. متن فصل را با PDF اصلی تطبیق بده\n۲. پیش‌نیازها را از پایه تعیین کن\n۳. مثال حل‌شده و شبیه‌سازی بساز\n۴. پنج سؤال معتبر تهیه کن',
             example:'هنوز مثال علمی تأییدشده‌ای وجود ندارد.',exercise:'پس از تهیه و تأیید محتوای درس، آزمون تعیین کن.',
             quiz:[],cards:[],sources:[],minutes:35,sourceFileId:meta.id,sourcePage:ch.page,
             sourceSha256:meta.sha256,reviewStatus:'needs-review',createdAt:new Date().toISOString()});
          added++;
        }
        state.subjectProgress[subject.id]=state.subjectProgress[subject.id]||[];
        save();navigate('sciences');showToast(added+' فصل به‌عنوان پیش‌نویس وارد شد؛ بدون تأیید علمی هیچ پیشرفتی ثبت نمی‌شود.');return;
      }
      if(act==='ocr-start'||act==='ocr-resume'){
        const fid=id||ocrTarget;
        if(!fid){showToast('ابتدا فایل PDF را انتخاب کن.');return}
        ocrTarget=fid;ocrPage=null;
        fullOcr=await post('ocr-start',{fileId:fid,language:'fas+eng'});
        render();document.querySelector('#full-ocr-progress')?.scrollIntoView({behavior:'smooth'});
        showToast('پردازش کامل PDF در پس‌زمینه آغاز شد؛ صفحه‌های انجام‌شده ذخیره می‌شوند.');return;
      }
      if(act==='ocr-pause'){fullOcr=await post('ocr-pause',{fileId:ocrTarget});render();showToast('درخواست مکث ثبت شد.');return}
      if(act==='ocr-read-page'||act==='ocr-next-page'){
        let next=act==='ocr-next-page' && ocrPage?.pages?.length ? ocrPage.pages[ocrPage.pages.length-1].page+1:1;
        ocrPage=await api('ocr-pages?id='+encodeURIComponent(ocrTarget)+'&page='+next+'&limit=3');
        render();document.querySelector('#full-ocr-progress')?.scrollIntoView({behavior:'smooth'});return;
      }
      if(act==='ocr-outline'){
        if(fullOcr?.status!=='completed')throw Error('OCR کامل نشده است.');
        outline=await api('source-outline?id='+encodeURIComponent(ocrTarget)+'&language=fa');
        render();document.querySelector('#vault-outline')?.scrollIntoView({behavior:'smooth'});return;
      }
      if(act==='preview'){
        ocrInfo=null;
        const language=document.querySelector(`.vault-language[data-for="${id}"]`)?.value||'fa';
        preview=await api('preview?id='+encodeURIComponent(id)+'&language='+encodeURIComponent(language));
        if(preview && !preview.safeForLearning && !preview.ocrComplete && language==='fa' &&
          snapshot.files.some(f=>f.id===id && f.name.toLowerCase().endsWith('.pdf'))){
          try{
            const caps=await api('ocr-capabilities');
            if(caps.ready){ocrTarget=id;fullOcr=await post('ocr-start',{fileId:id,language:'fas+eng'});}
          }catch(e){/* Bad PDF remains blocked; no unsafe auto-fallback. */}
        }
        render();document.querySelector('#vault-preview')?.scrollIntoView({behavior:'smooth'});return;
      }
      if(act==='ocr-check'){ocrInfo=await api('ocr-capabilities');render();document.querySelector('#vault-preview')?.scrollIntoView();return;}
      if(act==='ocr'){const result=await post('ocr-preview',{fileId:id,language:'fas'});preview=result;render();document.querySelector('#vault-preview')?.scrollIntoView({behavior:'smooth'});if(!result.safeForLearning)showToast('OCR متن خوانای کافی نداد؛ وارد آموزش نشد.');return} 
      if(act==='download'){window.location.href='/api/vault/download?id='+encodeURIComponent(id);return}
      if(act==='learn'){await learn(id);return}
      if(act==='studio'){await learn(id,true);return}
      if(act==='delete'){const file=snapshot.files.find(f=>f.id===id);if(!file)return;
        if(!confirm('حذف دائمی نسخهٔ مدیریت‌شدهٔ «'+file.name+'» از پوشهٔ اصلی مَدار و همهٔ پروژه‌ها؟ فایل بیرونیِ اصلی حذف نمی‌شود.'))return;
        const typed=prompt('برای تأیید نهایی نام فایل را دقیقاً وارد کن:\n'+file.name);
        if(typed===null)return;
        const result=await post('delete',{fileId:id,confirmName:typed});preview=preview?.sourceFileId===id?null:preview;await refresh();alert(result.message);return;
      }
    }catch(error){showToast('عملیات انجام نشد: '+error.message)}
  });
  // P0-01: REAL AI connection and one-page visual PDF reading.
  // These fields are transient UI state; no keys are persisted in JS/localStorage.
  let aiSelectedProvider='openai', aiStatus=null, aiPdfFile='', aiPage=1, aiSavedPages=null, aiWorking=false, aiBatchJobs=[], aiFileInfo=null;
  async function aiRefresh(silent=false){
    if(!isServer())return;
    try{
      aiStatus=await api('ai-status');aiProviderSummary=aiStatus;
      if(aiPdfFile){
        aiSavedPages=await api('ai-pages?id='+encodeURIComponent(aiPdfFile));
        const batches=await api('ai-batch-status?id='+encodeURIComponent(aiPdfFile));
        aiBatchJobs=batches.jobs||[];
      }
      if(!silent && view==='vault')render();
    }catch(ex){if(!silent)showToast('اتصال AI: '+ex.message)}
  }
  const safeOption=f=>`<option value="${esc(f.id)}" ${f.id===aiPdfFile?'selected':''}>${esc(f.name)}</option>`;
  function batchMarkup(){
    const live=aiBatchJobs[0];
    if(!live)return '<p class="small muted">هنوز کاری برای بازخوانی چندصفحه‌ای آغاز نشده است.</p>';
    const stateLabels={queued:'در صف',running:'در حال خواندن',paused:'مکث‌شده',paused_error:'متوقف به‌علت خطا',interrupted:'قطع‌شده؛ آمادهٔ ادامه',completed:'تمام‌شده'};
    const active=['queued','running'].includes(live.status);
    const allowResume=['paused','paused_error','interrupted'].includes(live.status) && live.requestsUsed<live.requestCap;
    return `<div class="vault-file"><strong>پردازش ${esc(stateLabels[live.status]||live.status)} · ${esc(live.percent)}٪</strong>
      <p class="small muted">${esc(live.done)} از ${esc(live.total)} صفحه · صفحهٔ بعد: ${esc(live.nextPage)} · ${esc(live.requestsUsed)} از ${esc(live.requestCap)} درخواست مجاز</p>
      <progress style="width:100%;height:14px" value="${Number(live.done)}" max="${Number(live.total)}"></progress>
      ${live.lastError?`<div class="notice warning">${esc(live.lastError)}</div>`:''}
      <div class="form-actions">${active?`<button class="button button-outline" data-aipdf="batch-pause" data-job="${esc(live.jobId)}">مکث بعد از صفحهٔ جاری</button>`:''}
      ${allowResume?`<button class="button button-primary" data-aipdf="batch-resume" data-job="${esc(live.jobId)}">ادامه با همان سقف مجاز</button>`:''}
      <button class="button button-outline" data-aipdf="batch-refresh">نوسازی وضعیت</button></div>
      <p class="small muted">نتایج به‌صورت پیش‌نویسِ قابل بازبینی ثبت می‌شوند، نه درس یا قبولی تأییدشده. هزینهٔ واقعی سرویس در این بخش قابل تخمین قطعی نیست.</p>
    </div>`;
  }
  async function aiLoadBook(fid){
    aiPdfFile=fid;aiSavedPages=null;aiBatchJobs=[];aiFileInfo=null;
    if(!fid)return;
    const [info,saved,batch]=await Promise.all([
      api('ai-pdf-info?id='+encodeURIComponent(fid)),
      api('ai-pages?id='+encodeURIComponent(fid)),
      api('ai-batch-status?id='+encodeURIComponent(fid))]);
    aiFileInfo=info;aiSavedPages=saved;aiBatchJobs=batch.jobs||[];
  }
  const aiRender=()=>{
    const pdfs=snapshot.files.filter(f=>f.name.toLowerCase().endsWith('.pdf'));
    const cfg=aiStatus?.providers||{};
    const statuses=Object.entries(cfg).map(([p,st])=>`<span class="mini" style="margin-inline-start:12px">${esc(p)}: ${st.configured?'● اطلاعات اتصال ثبت‌شده (تأیید زنده نشده)':'○ تنظیم نشده'} ${esc(st.model||'')}</span>`).join('');
    const pages=aiSavedPages?.pages||[];
    const selected=pages.find(p=>p.page===aiPage);
    return `<section class="card" id="vault-ai-reader" aria-live="polite">
      <div class="card-title"><h3>۷. اتصال واقعی AI و خواندن PDF فارسی</h3>${badge('P0-01 · نیازمند آزمون زنده','amber')}</div>
      <p class="small muted">برای PDF فارسی با متن خراب، تصویر هر صفحهٔ منبع به مدل بینایی متصل ارسال می‌شود؛ بدون Tesseract. آیکون AI به‌تنهایی به معنی اتصال نیست.</p>
      <div class="notice">وضعیت مدل‌ها: ${statuses||'هنوز بررسی نشده است.'} <button class="button button-outline button-sm" data-aipdf="refresh">بررسی اتصال</button></div>
      <div class="form-grid">
        <div><label class="form-label">ارائه‌دهندهٔ AI</label><select id="ai-vault-provider" class="field"><option value="openai" ${aiSelectedProvider==='openai'?'selected':''}>OpenAI</option><option value="google" ${aiSelectedProvider==='google'?'selected':''}>Gemini</option><option value="anthropic" ${aiSelectedProvider==='anthropic'?'selected':''}>Claude</option><option value="ollama" ${aiSelectedProvider==='ollama'?'selected':''}>Ollama (محلی؛ برای PDF به رندرکننده نیاز دارد)</option></select></div>
        <div><label class="form-label">شناسهٔ دقیق مدل دارای بینایی</label><input class="field" id="ai-vault-model" dir="ltr" value="${esc(cfg[aiSelectedProvider]?.model||'')}" placeholder="نام مدل از حساب خودت"></div>
        <div class="form-full"><label class="form-label">کلید API (فقط برای اتصال ابری؛ در مرورگر ذخیره نمی‌شود)</label><input class="field" id="ai-vault-key" type="password" autocomplete="off" placeholder="برای تغییر کلید وارد کن؛ برای حفظ کلید قبلی خالی بگذار"></div>
      </div><div class="form-actions"><button class="button button-outline" data-aipdf="connect" ${aiWorking?'disabled':''}>ثبت امن اتصال در ویندوز</button></div>
      <div class="notice">کلید در سرورِ محلی با Windows DPAPI رمزگذاری می‌شود. برای استفاده از سرویس ابری، اینترنت و اعتبار حساب API لازم است؛ اشتراک عادی ChatGPT جای کلید API را نمی‌گیرد.</div>
      <div class="form-grid"><div><label class="form-label">PDF موجود در کتابخانه</label><select id="ai-vault-file" class="field"><option value="">انتخاب کتاب...</option>${pdfs.map(safeOption).join('')}</select></div>
      <div><label class="form-label">شمارهٔ صفحهٔ واقعی PDF</label><input type="number" min="1" max="3000" class="field" id="ai-vault-page" value="${aiPage}"></div></div>
      <div class="form-actions"><button class="button button-primary" data-aipdf="read" ${aiWorking?'disabled':''}>خواندن همین صفحه با AI بینایی (با اجازهٔ من)</button><button class="button button-outline" data-aipdf="list">نمایش صفحه‌های خوانده‌شده</button></div>
      <section class="card" style="margin-block:15px" aria-label="پردازش خودکار کتاب با هوش مصنوعی">
        <h4>پردازش خودکار محدودهٔ صفحات با AI — قابل توقف و ادامه</h4>
        <p class="small muted">${aiFileInfo?'این PDF '+esc(aiFileInfo.pageCount)+' صفحه دارد.':''} یک‌بار محدوده و سقف درخواست‌ها را تأیید کن؛ مَدار صفحه‌ها را به ترتیب می‌خواند و نتایج را ذخیره می‌کند. صفحات موجود دوباره ارسال نمی‌شوند.</p>
        <div class="form-grid">
          <div><label class="form-label">از صفحه</label><input id="ai-batch-start" class="field" type="number" min="1" max="3000" value="1"></div>
          <div><label class="form-label">تا صفحه</label><input id="ai-batch-end" class="field" type="number" min="1" max="3000" value="${Math.min(20,aiFileInfo?.pageCount||20)}"></div>
          <div><label class="form-label">سقف کل درخواست‌های این کار (نه سقف ریالی/دلاری)</label><input id="ai-batch-max" class="field" type="number" min="1" max="3000" value="${Math.min(20,aiFileInfo?.pageCount||20)}"></div>
        </div>
        <div class="form-actions"><button class="button button-primary" data-aipdf="batch-start">شروع خواندن محدوده با رضایت من</button><button class="button button-outline" data-aipdf="batch-all">انتخاب تمام صفحات کتاب</button></div>
        <div class="notice warning">محتوای این محدوده به ارائه‌دهندهٔ انتخابی ارسال می‌شود و ممکن است هزینهٔ قابل‌توجه داشته باشد. با این ابزار نمی‌توان هزینهٔ دلاری را تضمین کرد. شروع پردازش به‌صورت پیش‌فرض ۲۰ صفحه است.</div>
        <div id="ai-batch-status" aria-live="polite">${batchMarkup()}</div>
      </section>
      <div class="notice warning">هر ارسال ابری ممکن است هزینه داشته باشد. متن خروجی «پیش‌نویس نیازمند تطبیق با تصویر» است؛ هیچ تسلط یا فلش‌کارتی خودکار ثبت نمی‌شود. قبل از ارسال، فقط همان یک صفحه را انتخاب کن.</div>
      ${selected?`<div class="vault-file"><strong>صفحهٔ ${selected.page} · ${esc(selected.review_state)} · ${esc(selected.provider)} / ${esc(selected.model)}</strong>
        <p class="mini muted">منبع: ${esc((selected.source_sha256||'').slice(0,16))} · اطمینان مدل: ${esc(selected.confidence)} · شناسه پاسخ: ${esc(selected.request_id)}</p>
        <textarea id="ai-vault-reviewed-text" class="textarea" rows="12" dir="auto">${esc(selected.text)}</textarea>
        <p class="small muted">ابهام‌ها: ${esc((selected.uncertainties||[]).join('؛ ')||'گزارش نشده')}</p>
        <button class="button button-outline" data-aipdf="approve">پس از مقایسه با PDF، تأیید متن اصلاح‌شدهٔ این صفحه</button>
      </div>`:`<p class="small muted">هنوز صفحهٔ انتخابی در مخزن بازخوانی AI ثبت نشده است.</p>`}
      <div class="form-actions"><button class="button button-outline" data-aipdf="ai-outline">نمایش فصل‌های استخراج‌شده از بازخوانی AI</button></div>
      <p class="small muted">صفحات خوانده‌شده: ${aiSavedPages?.readCount||0} · تأییدشده: ${aiSavedPages?.approvedCount||0}. تا تأیید محتوای منبع، قفل درس‌ها باز نمی‌شود.</p>
    </section>`;
  };
  const vaultBeforeAI=renderVault;
  renderVault=function(){return vaultBeforeAI()+aiRender()};
  document.addEventListener('click',async e=>{
    const target=e.target.closest('[data-aipdf]');if(!target)return;
    e.preventDefault();const action=target.dataset.aipdf;
    if(aiWorking)return;
    aiWorking=true;
    try{
      if(action==='jump'){document.querySelector('#vault-ai-reader')?.scrollIntoView({behavior:'smooth'});return}
      if(action==='refresh'){await aiRefresh();return}
      if(action==='connect'){
        const provider=document.querySelector('#ai-vault-provider')?.value;
        aiSelectedProvider=provider;
        const model=document.querySelector('#ai-vault-model')?.value.trim();
        const key=document.querySelector('#ai-vault-key')?.value||'';
        if(!model)throw Error('ابتدا مدل دارای قابلیت بینایی را انتخاب کن.');
        if(!confirm('اتصال مدل «'+model+'» ثبت شود؟ کلید فقط به سرور محلی مَدار ارسال و در ویندوز رمزگذاری می‌شود.'))return;
        try{await post('ai-connect',{provider,model,key,confirm:true})}finally{const el=document.querySelector('#ai-vault-key');if(el)el.value=''}
        await aiRefresh();showToast('تنظیمات اتصال ذخیره شد؛ برای تأیید کارکرد واقعی یک صفحهٔ PDF را آزمایش کن.');return;
      }
      if(action==='list'){
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||aiPdfFile;
        if(!aiPdfFile)throw Error('ابتدا یک PDF انتخاب کن.');
        aiPage=Math.max(1,Number(document.querySelector('#ai-vault-page')?.value||1));
        await aiLoadBook(aiPdfFile);render();return;
      }
      if(action==='read'){
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||'';
        aiPage=Number(document.querySelector('#ai-vault-page')?.value||1);
        const provider=document.querySelector('#ai-vault-provider')?.value||'openai';aiSelectedProvider=provider;
        if(!aiPdfFile || !Number.isInteger(aiPage)||aiPage<1)throw Error('PDF و صفحهٔ معتبر را مشخص کن.');
        const f=snapshot.files.find(x=>x.id===aiPdfFile);
        if(!confirm('آیا اجازه می‌دهی فقط صفحهٔ '+aiPage+' از «'+f?.name+'» برای بررسی تصویری به '+provider+' ارسال شود؟ ممکن است هزینهٔ API داشته باشد.'))return;
        const result=await post('ai-pdf-page',{fileId:aiPdfFile,page:aiPage,provider,confirm:true});
        await aiLoadBook(aiPdfFile);
        render();showToast('صفحه خوانده و به‌صورت پیش‌نویس ذخیره شد؛ با تصویر PDF تطبیق بده.');return;
      }
      if(action==='ai-outline'){
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||aiPdfFile;
        if(!aiPdfFile)throw Error('فایل PDF را انتخاب کن.');
        outline=await api('ai-pdf-outline?id='+encodeURIComponent(aiPdfFile));
        render();document.querySelector('#vault-outline')?.scrollIntoView({behavior:'smooth'});return;
      }
      if(action==='batch-refresh'){
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||aiPdfFile;
        if(aiPdfFile)await aiLoadBook(aiPdfFile);
        render();return;
      }
      if(action==='batch-all'){
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||'';
        if(!aiPdfFile)throw Error('ابتدا PDF را انتخاب کن.');
        if(!aiFileInfo||aiFileInfo.fileId!==aiPdfFile)await aiLoadBook(aiPdfFile);
        const n=aiFileInfo.pageCount;
        document.querySelector('#ai-batch-end').value=n;
        document.querySelector('#ai-batch-start').value=1;
        document.querySelector('#ai-batch-max').value=n;
        showToast('همهٔ '+n+' صفحه انتخاب شد. پیش از شروع، سقف هزینهٔ احتمالی را بررسی کن.');return;
      }
      if(action==='batch-start'){
        const fid=document.querySelector('#ai-vault-file')?.value||'';
        const provider=document.querySelector('#ai-vault-provider')?.value||'openai';
        const a=Number(document.querySelector('#ai-batch-start')?.value);
        const b=Number(document.querySelector('#ai-batch-end')?.value);
        const max=Number(document.querySelector('#ai-batch-max')?.value);
        if(!fid||!Number.isInteger(a)||!Number.isInteger(b)||!Number.isInteger(max)||a<1||b<a||max<b-a+1)
          throw Error('PDF، محدوده و سقف درخواست را درست تنظیم کن.');
        if(!confirm(`مجوز می‌دهی صفحه‌های ${a} تا ${b} (حداکثر ${max} درخواست) از PDF انتخابی به ${provider} ارسال شود؟ هزینهٔ API ممکن است قابل‌توجه باشد. هر صفحهٔ قبلاً ثبت‌شده مجدداً ارسال نمی‌شود.`))return;
        if(b-a+1>30&&!confirm('این پردازش بیش از ۳۰ صفحه دارد و ممکن است پرهزینه باشد. سقف دلاری قابل تضمین نیست. ادامه با مجوز آگاهانهٔ تو؟'))return;
        aiSelectedProvider=provider;
        await post('ai-batch-start',{fileId:fid,provider,startPage:a,endPage:b,maxCalls:max,confirm:true});
        await aiLoadBook(fid);render();showToast('کار ثبت شد و پردازش صفحه‌به‌صفحه آغاز شد.');return;
      }
      if(action==='batch-pause'||action==='batch-resume'){
        const job=target.dataset.job;
        if(!job)throw Error('شناسهٔ کار پیدا نشد.');
        if(action==='batch-resume'&&!confirm('ارسال صفحه‌های باقی‌مانده با همان سقف درخواست قبلی ادامه پیدا کند؟'))return;
        await post(action==='batch-pause'?'ai-batch-pause':'ai-batch-resume',
           {jobId:job,confirm:action==='batch-resume'});
        aiPdfFile=document.querySelector('#ai-vault-file')?.value||aiPdfFile;
        if(aiPdfFile)await aiLoadBook(aiPdfFile);
        render();return;
      }
      if(action==='approve'){
        const text=document.querySelector('#ai-vault-reviewed-text')?.value||'';
        if(!aiPdfFile||!confirm('تأیید می‌کنی که متن این صفحه را با تصویر اصلی PDF تطبیق داده‌ای؟'))return;
        await post('ai-pdf-review',{fileId:aiPdfFile,page:aiPage,text,confirm:true});
        aiSavedPages=await api('ai-pages?id='+encodeURIComponent(aiPdfFile));
        render();showToast('فقط متن این صفحه تأیید شد؛ تسلط آموزشی ثبت نشد.');return;
      }
    }catch(ex){showToast('مَدار AI: '+ex.message)}finally{aiWorking=false}
  });
  document.addEventListener('change',e=>{
    if(e.target?.id==='ai-vault-provider'){
      aiSelectedProvider=e.target.value;
      const field=document.querySelector('#ai-vault-model');
      if(field)field.value=aiStatus?.providers?.[aiSelectedProvider]?.model||'';
    }
  });
  document.addEventListener('change',async e=>{
    if(e.target?.id!=='ai-vault-file')return;
    try{await aiLoadBook(e.target.value);render();}catch(ex){showToast('منبع PDF: '+ex.message)}
  });
  setInterval(async()=>{
    if(view!=='vault'||!aiPdfFile||!aiBatchJobs.some(j=>['running','queued'].includes(j.status)))return;
    try{
      const response=await api('ai-batch-status?id='+encodeURIComponent(aiPdfFile));
      aiBatchJobs=response.jobs||[];
      const node=document.querySelector('#ai-batch-status');
      if(node)node.innerHTML=batchMarkup();
    }catch(ex){const n=document.querySelector('#ai-batch-status');if(n)n.textContent='اتصال وضعیت پردازش قطع شد: '+ex.message;}
  },3000);
  const aiNav=document.createElement('button');
  aiNav.className='nav-item'; aiNav.type='button'; aiNav.dataset.aiPdfNav='1';
  aiNav.innerHTML='<span class="nav-ico">◈</span> اتصال AI و خواندن PDF';
  document.querySelector('[data-nav="vault"]')?.after(aiNav);
  aiNav.addEventListener('click',()=>{
    document.querySelector('[data-nav="vault"]')?.click();
    setTimeout(()=>document.querySelector('#vault-ai-reader')?.scrollIntoView({behavior:'smooth'}),90);
  });
  if(isServer())aiRefresh(true).then(()=>{if(view==='dashboard')render()});
  if(isServer())api('ai-batch-status').then(data=>{aiJobsSummary=data.jobs||[];if(view==='dashboard')render()}).catch(()=>{});
  if(isServer())refresh(true);
})();
