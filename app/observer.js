'use strict';
/* MADAR Learning Observer. Screen sharing requires an explicit browser picker;
   no cloud upload is made except when the user presses 'Generate with AI'. */
(function(){
const PREV_RENDER=render;
const ACTIVE={stream:null,video:null,started:0,timer:null,images:[],draft:null,loading:false,health:null,audioRecorder:null,audioInterval:null,audioPartStart:0,audioParts:[],audioSending:0,audioMime:'',audioConsent:false,visionInterval:null,visionBusy:false,visionAuto:false,visionCount:0,visionVideo:null,visionPrefs:null,monitorTimer:null,monitorStats:{scanned:0,changes:0,analyzed:0,failed:0,skipped:0},lastSignature:null,lastAnalyzedAt:0,lastCandidateAt:0,monitorEpoch:0,visionAbort:null,audioAbort:new Set(),audioQueue:Promise.resolve(),monitorPauseReason:'',autoMinGap:35,autoMaxGap:130,autoThreshold:0.15,perSessionLimit:12,monitorStarting:false,autoDraftConsent:false,autoDraftPrefs:null,draftSource:null};
const $=s=>document.querySelector(s);
function esc(s){return cleanText(String(s??''));}
function ensure(){if(!Array.isArray(state.observerSessions))state.observerSessions=[]; if(!state.observerCurrent||typeof state.observerCurrent!=='object')state.observerCurrent={title:'',url:'',transcript:'',segments:[],bookmarks:[],createdAt:new Date().toISOString(),sourceType:'video',visualObservations:[]};if(!Array.isArray(state.observerCurrent.visualObservations))state.observerCurrent.visualObservations=[];}
function ts(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function seconds(v){const x=String(v||'').replace(',','.').split(':').map(Number);if(x.length<2||x.some(n=>!Number.isFinite(n)))return null;return x.reduce((p,n)=>p*60+n,0);}
function parseCaptions(raw){const out=[]; const s=String(raw||'').replace(/^\uFEFF/,'').replace(/\r/g,'');
 const blocks=s.split(/\n\s*\n/);
 for(const b of blocks){const lines=b.split('\n').map(x=>x.trim()).filter(Boolean); const idx=lines.findIndex(x=>/\b\d{1,2}:\d{2}(?::\d{2})?[.,]\d+\s*-->\s*\d{1,2}:\d{2}/.test(x));
  if(idx<0)continue;const start=seconds(lines[idx].split('-->')[0].trim());const txt=lines.slice(idx+1).join(' ').replace(/<[^>]{0,100}>/g,'').replace(/\s+/g,' ').trim();if(start!==null&&txt)out.push({at:Math.round(start),text:txt.slice(0,800)});
 }
 if(!out.length){ // Plain transcript text also accepted, but cannot claim exact timestamps.
  const text=s.replace(/^WEBVTT\s*/,'').trim();if(text)out.push({at:null,text:text.slice(0,18000)});
 }
 return out.slice(0,2000);
}
function current(){ensure();return state.observerCurrent;}
function persist(){ensure();save();}
function activity(agent,detail){ensure();state.observerActivity=Array.isArray(state.observerActivity)?state.observerActivity:[];state.observerActivity.push({at:new Date().toISOString(),agent,detail:String(detail).slice(0,190)});state.observerActivity=state.observerActivity.slice(-50);persist();const e=document.getElementById('obs-activity');if(e)e.innerHTML=activityMarkup();}
function activityMarkup(){return (state.observerActivity||[]).slice(-12).reverse().map(x=>`<div class="resource-line"><div><strong>${esc(x.agent==='ai'?'AI متصل':'مغز داخلی')}</strong> · <small>${esc(x.at.replace('T',' ').slice(0,19))}</small><div class="mini muted">${esc(x.detail)}</div></div></div>`).join('')||'<p class="muted">هنوز اقدامی ثبت نشده است.</p>';}

function keepMeta(){const c=current();c.title=($('#obs-title')?.value||c.title||'').slice(0,160);c.url=($('#obs-url')?.value||c.url||'').slice(0,600);c.transcript=($('#obs-transcript')?.value||c.transcript||'').slice(0,35000);c.sourceType='video';persist();}
function status(txt,kind=''){const e=$('#obs-status');if(e){e.textContent=txt;e.dataset.kind=kind;}}
function attachVideo(){if(!ACTIVE.stream||view!=='observer')return;const v=$('#obs-preview');if(v){v.srcObject=ACTIVE.stream;v.play().catch(()=>{});}}
function visualMarkup(){const list=(current().visualObservations||[]).slice(-10).reverse();return list.length?list.map(v=>
 `<div class="resource-line ob-vision-result"><div><strong>زمان مشاهده ${esc(ts(v.elapsedSec))} · ${esc(v._provenance?.providerId||'AI')} / ${esc(v._provenance?.model||'مدل')}</strong>
 <div>${esc(v.scene)}</div><div class="mini muted">متن قابل رؤیت: ${esc((v.visibleText||[]).join(' | ')||'ثبت نشده')}</div>
 <div class="mini muted">فرمول/نمودار: ${esc((v.formulasAndDiagrams||[]).join(' | ')||'ثبت نشده')}</div>
 <div class="mini muted">عدم قطعیت: ${esc((v.uncertainties||[]).join(' | ')||'گزارش نشده')}</div></div></div>`).join(''):'<p class="small muted">هنوز فریمی توسط AI تحلیل نشده است.</p>';}
function renderObserver(){ensure();const c=current();const sessions=state.observerSessions.slice(-8).reverse();const online=ACTIVE.health;
 return `<div class="intro"><div><h2>ناظر آموزشی — از ویدیو تا درس</h2><p>برای مشاهدهٔ تب، پنجره یا نمایشگر، خودت منبع را انتخاب و اشتراک‌گذاری را شروع کن. تا زمانی که مجوز جداگانهٔ ارسال صوت، تصویر و درخواست تولید درس لازم است؛ اشتراک تب به‌تنهایی چیزی به AI نمی‌فرستد.</p></div><span class="badge">آزمایشی؛ بدون نظارت پنهانی</span></div>
 <section class="card ob-card"><div class="card-title"><h3>۱. انتخاب منبع و مشاهدهٔ مجاز</h3><span id="obs-status" role="status" aria-live="polite">${ACTIVE.stream?'اشتراک‌گذاری فعال است':'غیرفعال — برای شروع اجازه بده'}</span></div>
 <div class="form-grid"><div class="form-full"><label class="form-label" for="obs-title">نام ویدیو یا درس</label><input id="obs-title" class="field" maxlength="160" value="${esc(c.title)}" placeholder="مثلاً تاریخ تمدن، جلسهٔ ۱"></div>
 <div class="form-full"><label class="form-label" for="obs-url">پیوند منبع (اختیاری)</label><input id="obs-url" class="field" maxlength="600" value="${esc(c.url)}" placeholder="https://www.youtube.com/watch?v=..." dir="ltr"></div></div>
 <label class="choice"><input type="checkbox" id="obs-audio-consent" ${ACTIVE.audioConsent?'checked':''}> <strong>اجازهٔ مستقل صوت:</strong> اگر مرورگر صدای تب را ارائه کرد، قطعه‌ها فقط برای تبدیل گفتار به متن به OpenAI API ارسال شوند. امکان استفادهٔ آفلاین از زیرنویس ذخیره‌شده همچنان وجود دارد.</label>
 <div class="form-actions"><button class="button button-primary" type="button" data-obs="start" ${ACTIVE.stream?'disabled':''}>◉ فعال‌کردن ناظر و انتخاب تب</button><button class="button button-outline" type="button" data-obs="bookmark" ${!ACTIVE.stream?'disabled':''}>＋ ثبت لحظهٔ مهم</button><button class="button button-outline" type="button" data-obs="stop" ${!ACTIVE.stream?'disabled':''}>■ پایان مشاهده</button></div>
 <video id="obs-preview" autoplay muted playsinline class="ob-preview" aria-label="نمایش پنجرهٔ انتخاب‌شده"></video>
 <p class="small muted">اشتراک‌گذاری فقط با انتخاب صریح تو انجام می‌شود. اجازهٔ صوت و تصویر جداست؛ اگر مدل محلی Ollama با توانایی بینایی نصب و پیکربندی شده باشد، تحلیل تصویر بدون کلید API ابری ممکن است. صوت فقط در صورت فعال‌سازی و با OpenAI API قابل تبدیل است. مجوز اشتراک‌گذاری برای هر جلسه دوباره درخواست می‌شود.</p>
 <div class="ob-vision"><h4>تحلیل فریم‌های تصویری توسط AI متصل</h4>
 <p class="small muted">فهم علمی تصویر فقط توسط مدل انتخاب‌شدهٔ دارای قابلیت بینایی انجام می‌شود. مغز داخلی صرفاً فریم را انتخاب، کوچک و با اجازه ارسال می‌کند. زمان‌ها، مدت سپری‌شده از آغاز اشتراک‌گذاری‌اند، نه زمان واقعی ویدیو.</p>
 <label class="choice"><input type="checkbox" id="obs-vision-consent" ${ACTIVE.stream&&ACTIVE.visionPrefs?.consent?'checked':''}> اجازهٔ ارسال فریم‌های انتخاب‌شده و حداکثر ۱۴۰۰ نویسهٔ زیرنویس اخیر را به مدل بینایی انتخابی می‌دهم. هزینهٔ API ممکن است اعمال شود.</label>
 <label class="choice"><input type="checkbox" id="obs-vision-auto" ${ACTIVE.stream&&ACTIVE.visionPrefs?.auto?'checked':''}> <strong>ناظر هوشمند پیوسته:</strong> بررسی تغییرات صحنه در همین دستگاه و ارسال انتخابی تصاویر مهم به AI؛ بدون ضبط دائمی</label>
 <div class="form-grid ob-monitor-grid">
 <div><label class="form-label" for="obs-gap">حداقل فاصلهٔ تحلیل‌های AI</label><select id="obs-gap" class="select-field"><option value="20" ${ACTIVE.autoMinGap===20?'selected':''}>۲۰ ثانیه</option><option value="35" ${ACTIVE.autoMinGap===35?'selected':''}>۳۵ ثانیه (متعادل)</option><option value="60" ${ACTIVE.autoMinGap===60?'selected':''}>۶۰ ثانیه</option><option value="90" ${ACTIVE.autoMinGap===90?'selected':''}>۹۰ ثانیه (کم‌هزینه)</option></select></div>
 <div><label class="form-label" for="obs-limit">بودجهٔ این جلسه (درخواست تصویری)</label><select id="obs-limit" class="select-field">${[4,8,12,20,40].map(n=>`<option value="${n}" ${ACTIVE.perSessionLimit===n?'selected':''}>${n} فریم</option>`).join('')}<option value="0" ${ACTIVE.perSessionLimit===0?'selected':''}>بدون سقف جلسه (فقط مدل محلی)</option></select></div>
 </div>
 <p class="small muted">تشخیص تغییر صحنه با پویش سبک هر ۲ ثانیه انجام می‌شود. سقف جلسه قابل تنظیم است؛ حالت نامحدود فقط برای مدل محلی است. درخواست‌های ابری سقف و هزینهٔ جداگانه دارند. برای تحلیل ویدیوی طولانی، گفتار و تصاویر با زمان نسبی ثبت می‌شوند؛ هیچ تضمینی برای مشاهدهٔ تمام فریم‌ها وجود ندارد.</p>
 <div class="ob-monitor-dashboard" aria-label="وضعیت زندهٔ ناظر"><span>پویش محلی: <b id="obs-scan-count">${ACTIVE.monitorStats.scanned}</b></span><span>تغییرات: <b id="obs-change-count">${ACTIVE.monitorStats.changes}</b></span><span>تحلیل AI: <b id="obs-ai-count">${ACTIVE.monitorStats.analyzed}</b></span><span>خطا: <b id="obs-error-count">${ACTIVE.monitorStats.failed}</b></span><span>درخواست‌های ابری امروز: <b id="obs-server-budget">${online?`${online.requestsUsed}/${online.dailyRequestLimit}`:'نامشخص'}</b></span></div>
 <div class="form-grid"><div><label class="form-label" for="obs-vision-provider">مدل تحلیل تصویر</label><select id="obs-vision-provider" class="select-field"><option value="openai" ${ACTIVE.visionPrefs?.provider==='openai'?'selected':''}>OpenAI</option><option value="anthropic" ${ACTIVE.visionPrefs?.provider==='anthropic'?'selected':''}>Claude</option><option value="google" ${ACTIVE.visionPrefs?.provider==='google'?'selected':''}>Gemini</option><option value="ollama" ${ACTIVE.visionPrefs?.provider==='ollama'?'selected':''}>مدل محلی دارای بینایی</option></select></div>
 <div><label class="form-label" for="obs-vision-model">شناسه مدل بینایی</label><input id="obs-vision-model" class="field" maxlength="96" value="${esc(ACTIVE.visionPrefs?.model||'')}" placeholder="مدل تنظیم‌شده در سرور یا مدل انتخابی"></div></div>
 <div class="form-actions"><button class="button button-outline" type="button" data-obs="vision-now" ${!ACTIVE.stream?'disabled':''}>تحلیل همین تصویر با AI</button><button class="button button-primary" type="button" data-obs="vision-auto">${ACTIVE.visionAuto?'به‌روزرسانی تنظیمات ناظر':'فعال‌سازی پایش پیوسته'}</button><button class="button button-outline" type="button" data-obs="vision-pause" ${!ACTIVE.visionAuto?'disabled':''}>مکث پایش تصویری</button></div>
 <div class="mini muted" role="status" aria-live="polite" id="obs-vision-status">${ACTIVE.monitorPauseReason|| (ACTIVE.visionBusy?'تحلیل تصویر در حال اجراست':'تصویر خام ذخیره نمی‌شود. فقط تحلیل، منبع، زمان و نام مدل ثبت می‌شوند.')}</div>
 <div id="obs-vision-results">${visualMarkup()}</div></div>
 <div class="ob-marks">${(c.bookmarks||[]).map(b=>`<span class="ob-mark">${esc(ts(b.sec))} · ${esc(b.label||'نکته')}</span>`).join('')||'<small class="muted">هنوز نشانکی ثبت نشده است.</small>'}</div></section>
 <section class="card ob-card"><div class="card-title"><h3>۲. زیرنویس و متن قابل استناد</h3><span class="small muted">SRT / VTT / TXT</span></div>
 <p>اگر زیرنویس را به‌صورت فایل داری، وارد کن؛ یا متن گفتار و یادداشت‌های خودت را بنویس. شمارهٔ زمان‌ها در صورت وجود حفظ می‌شود.</p>
 <label class="form-label" for="obs-captions">انتخاب زیرنویس یا متن</label><input class="field" id="obs-captions" type="file" accept=".srt,.vtt,.txt,text/plain,text/vtt"/>
 <label class="form-label" for="obs-transcript">متن منبع (حداکثر ۳۵ هزار نویسه برای ذخیرهٔ محلی)</label><textarea id="obs-transcript" class="textarea" rows="10" placeholder="00:00:12 --> 00:00:25\nتعریف مفهوم ...">${esc(c.transcript)}</textarea>
 <div class="form-actions"><button class="button button-outline" data-obs="save" type="button">ذخیرهٔ محلی</button><button class="button button-outline" data-obs="store" type="button">بایگانی جلسه در مَدار</button><button class="button button-outline" data-obs="export" type="button">خروجی جلسه و فعالیت‌ها (JSON)</button></div>
 <div class="notice">تصویر ویدیو فقط هنگام اشتراک‌گذاری انتخاب‌شده پویش می‌شود؛ نسخهٔ کامل فایل ویدیو کپی یا دانلود نمی‌شود. برای ویدیوی اشخاص دیگر، اجازهٔ دسترسی و شرایط استفادهٔ منبع را رعایت کن. فقط نکته‌ها، متن مجاز و نشانی/زمان منبع در برنامه ذخیره می‌شوند.</div></section>
 <section class="card ob-card"><div class="card-title"><h3>۳. ساخت پیش‌نویس آموزش با هوش مصنوعی</h3><span id="obs-ai-status" class="small muted">${online?(online.onlineAIConfigured?'یک سرویس AI آنلاین دارای کلید است':'کلید سرویس آنلاین ثبت نشده'):'وضعیت اتصال بررسی نشده'}</span></div>
 <p>AI از متن و توصیف تصویری ثبت‌شده، اولین گام آموزشیِ قابل بررسی را تهیه می‌کند: «چرایی و چگونگی»، مثال حل‌شده، دقیقاً پنج سؤال +۱ و کارت‌های پیشنهادی. این محتوا تا تأیید تو قفل می‌ماند.</p>
 <div class="form-grid"><div><label class="form-label" for="obs-provider">ارائه‌دهنده</label><select class="select-field" id="obs-provider"><option value="openai">OpenAI</option><option value="anthropic">Claude / Anthropic</option><option value="google">Gemini / Google</option><option value="ollama">Ollama محلی</option></select></div>
 <div><label class="form-label" for="obs-model">شناسهٔ دقیق مدل</label><input id="obs-model" class="field" placeholder="مدل تنظیم‌شده در سرور؛ اگر خالی باشد پیش‌فرض" maxlength="96"/></div></div>
 <label class="choice"><input id="obs-consent" type="checkbox"> متن و نتایج تحلیل فریم‌ها (نه تصویر خام) برای تولید درس به مدل انتخاب‌شده فرستاده شود.</label>
 <label class="choice"><input id="obs-auto-draft" type="checkbox" ${ACTIVE.autoDraftConsent?'checked':''}> <strong>ساخت خودکار پیش‌نویس پس از پایان مشاهده:</strong> به AI انتخابی اجازه می‌دهم با متن/تحلیل‌های ثبت‌شده یک درس قفل‌شده شامل پنج سؤال و کارت‌های پیشنهادی بسازد؛ افزودن به علوم شخصی فقط با تأیید من.</label>
 <div class="form-actions"><button class="button button-primary" data-obs="generate" type="button" ${ACTIVE.loading?'disabled':''}>${ACTIVE.loading?'در حال بررسی...':'ساخت درس پیشنهادی با AI'}</button><button class="button button-outline" data-obs="connection" type="button">بررسی اتصال</button></div>
 <div id="obs-result">${ACTIVE.draft?draftMarkup(ACTIVE.draft):'<div class="notice">هنوز پیش‌نویسِ تولیدشده با AI وجود ندارد.</div>'}</div></section>
 <section class="card ob-card"><h3>فعالیت مغز داخلی و AI</h3><div id="obs-activity" role="log" aria-live="polite">${activityMarkup()}</div></section>
 <section class="card ob-card"><h3>جلسه‌های بایگانی‌شده</h3>${sessions.length?sessions.map((s,i)=>`<div class="resource-line"><div><strong>${esc(s.title||'بدون عنوان')}</strong><div class="mini muted">${esc(s.savedAt)} · ${s.transcript?.length||0} نویسه · ${(s.bookmarks||[]).length} نشانک</div></div><button class="button button-outline button-sm" data-obs="load" data-i="${state.observerSessions.length-1-i}">بازکردن</button></div>`).join(''):'<p class="muted">هنوز جلسه‌ای بایگانی نشده است.</p>'}</section>`;
}
function draftMarkup(d){return `<div class="notice">${esc(d._provenance?.providerId||'مدل')} · ${esc(d._provenance?.model||'نامشخص')} · ${esc(d._provenance?.generatedAt||'')} · پیش‌نویس در انتظار بررسی</div>
 <h3>${esc(d.title||'گام آغازین')}</h3><p>${esc(d.concept||'')}</p><h4>مثال حل‌شده</h4><p>${esc(d.example||'')}</p><h4>پنج سؤال از آسان تا سخت</h4><ol>${(d.quiz||[]).map(q=>`<li>${esc(q.q)}</li>`).join('')}</ol><h4>فلش‌کارت‌های پیشنهادی (پس از قبولی)</h4><p>${(d.cards||[]).map(x=>esc(x.front)).join(' · ')}</p><button class="button button-primary" data-obs="approve">افزودن به علوم شخصی به‌صورت درس قفل‌شده</button>`}
render=function(){if(view==='observer'){document.getElementById('page-eyebrow').textContent='آموزش از ویدیو';document.getElementById('page-title').textContent='ناظر آموزشی';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav==='observer'));$('#page-root').innerHTML=renderObserver();attachVideo();}else PREV_RENDER();};
const nav=$('.side-nav');if(nav){const button=document.createElement('button');button.className='nav-item';button.dataset.nav='observer';button.innerHTML='<span class="nav-ico">◉</span> ناظر آموزشی';nav.insertBefore(button,nav.querySelector('[data-nav="library"]'));}
const floating=document.createElement('div');floating.id='observer-float';floating.hidden=true;floating.innerHTML='<span>◉ ناظر آموزشی فعال</span><button type="button" data-nav="observer">مشاهده</button><button type="button" data-obs="stop">توقف</button>';document.body.appendChild(floating);
function updateFloat(){floating.hidden=!ACTIVE.stream;}
function audioSupported(){return typeof MediaRecorder !== 'undefined' && !!(ACTIVE.stream?.getAudioTracks().length);}
function startRecorder(){
 if(!ACTIVE.stream||!audioSupported())return;
 try{
  const audioStream=new MediaStream(ACTIVE.stream.getAudioTracks());
  const options=ACTIVE.audioMime?{mimeType:ACTIVE.audioMime}:{};
  const recorder=new MediaRecorder(audioStream,options);
  const parts=[];ACTIVE.audioPartStart=Math.round((Date.now()-ACTIVE.started)/1000);
  recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
  recorder.onstop=()=>{
   const blob=new Blob(parts,{type:recorder.mimeType||ACTIVE.audioMime||'audio/webm'});
   if(blob.size>=3000&&ACTIVE.audioConsent&&ACTIVE.stream)void sendAudio(blob,ACTIVE.audioPartStart); // only with active opt-in
   if(ACTIVE.stream && ACTIVE.audioConsent) startRecorder();
  };
  recorder.onerror=()=>activity('local','ضبط صدای تب در مرورگر دچار خطا شد؛ زیرنویس را دستی وارد کن.');
  recorder.start();ACTIVE.audioRecorder=recorder;
 }catch(e){activity('local','امکان ثبت صدای انتخاب‌شده وجود ندارد: '+e.message);}
}
async function sendAudio(blob,offset){
 if(blob.size>12*1024*1024){activity('local','قطعهٔ صوتی بیش از سقف ۱۲ مگابایت بود؛ ارسال نشد.');return;}
 if(!ACTIVE.audioConsent||!ACTIVE.stream)return;const ctl=new AbortController();ACTIVE.audioAbort.add(ctl);ACTIVE.audioSending++;
 try{
  const r=await fetch('/api/observer/transcribe',{method:'POST',headers:{'Content-Type':blob.type.startsWith('audio/ogg')?'audio/ogg':'audio/webm','X-Observer-Offset':String(offset)},body:blob});
  const d=await r.json();if(!r.ok)throw Error(d.error||'سرویس تبدیل گفتار پاسخ نداد');
  if(!ACTIVE.audioConsent||!ACTIVE.stream)return;const txt=String(d.text||'').trim();if(!txt){activity('ai','صوت در این قطعه گفتار قابل تشخیصی نداشت.');return;}
  const c=current();c.transcript=((c.transcript||'')+'\n'+ts(offset)+'  '+txt).trim().slice(-35000);persist();
  if(view==='observer'){const t=document.getElementById('obs-transcript');if(t)t.value=c.transcript;}
  activity('ai','دریافت '+txt.length+' نویسهٔ گفتار از gpt-transcribe، حوالی '+ts(offset));
 }catch(e){activity('ai','تبدیل گفتار انجام نشد: '+e.message);}
 finally{ACTIVE.audioSending--;ACTIVE.audioAbort.delete(ctl);}
}
function startAudioCapture(){
 ACTIVE.audioConsent=!!document.getElementById('obs-audio-consent')?.checked;
 if(!ACTIVE.audioConsent)return;
 if(!audioSupported()){activity('local','مرورگر از تب انتخابی صدایی برنگرداند. هنگام اشتراک‌گذاری گزینهٔ Share tab audio را فعال کن.');return;}
 ACTIVE.audioMime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
 startRecorder();
 ACTIVE.audioInterval=setInterval(()=>{const r=ACTIVE.audioRecorder;if(r?.state==='recording')try{r.stop()}catch{}},120000);
 activity('local','ضبط قطعه‌های صوت با اجازهٔ جداگانه شروع شد؛ ارسال به OpenAI gpt-transcribe.');
}
function monitorSummary(message){ACTIVE.monitorPauseReason=message;const el=$('#obs-vision-status');if(el)el.textContent=message;}
function renderMonitorCounters(){const vals={'obs-scan-count':ACTIVE.monitorStats.scanned,'obs-change-count':ACTIVE.monitorStats.changes,'obs-ai-count':ACTIVE.monitorStats.analyzed,'obs-error-count':ACTIVE.monitorStats.failed};for(const [id,value] of Object.entries(vals)){const el=document.getElementById(id);if(el)el.textContent=String(value);}const quota=document.getElementById('obs-server-budget');if(quota&&ACTIVE.health)quota.textContent=`${ACTIVE.health.requestsUsed}/${ACTIVE.health.dailyRequestLimit}`;}
function stopVisionAuto(){if(ACTIVE.monitorTimer){clearInterval(ACTIVE.monitorTimer);ACTIVE.monitorTimer=null;}if(ACTIVE.visionInterval){clearInterval(ACTIVE.visionInterval);ACTIVE.visionInterval=null;}ACTIVE.visionAuto=false;ACTIVE.monitorEpoch++;}
function visionSettings(){if(!$('#obs-vision-consent')&&ACTIVE.visionPrefs)return {...ACTIVE.visionPrefs};return {consent:!!$('#obs-vision-consent')?.checked,auto:!!$('#obs-vision-auto')?.checked,
 provider:$('#obs-vision-provider')?.value||'openai',model:($('#obs-vision-model')?.value||'').trim()};}
function probeScene(){const v=ACTIVE.visionVideo;if(!v||v.readyState<2||!v.videoWidth)return null;const cv=document.createElement('canvas');cv.width=48;cv.height=27;const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(v,0,0,48,27);const d=ctx.getImageData(0,0,48,27).data;const out=new Uint8Array(48*27);for(let i=0;i<out.length;i++)out[i]=(d[i*4]*3+d[i*4+1]*6+d[i*4+2])/10|0;return out;}
function changedFraction(a,b){if(!a||!b)return 1;let changed=0,total=0;for(let i=0;i<a.length;i+=3){total++;if(Math.abs(a[i]-b[i])>26)changed++;}return changed/Math.max(total,1);}
function readMonitorPreferences(){const min=Number($('#obs-gap')?.value||35),lim=Number($('#obs-limit')?.value||12);ACTIVE.autoMinGap=[20,35,60,90].includes(min)?min:35;ACTIVE.perSessionLimit=([4,8,12,20,40].includes(lim)|| (lim===0&&visionSettings().provider==='ollama'))?lim:12;ACTIVE.autoMaxGap=Math.max(130,ACTIVE.autoMinGap*2.4);}
function scanScene(){if(!ACTIVE.stream||!ACTIVE.visionAuto)return;const now=Date.now(),sig=probeScene();if(!sig)return;ACTIVE.monitorStats.scanned++;const diff=changedFraction(sig,ACTIVE.lastSignature);ACTIVE.lastSignature=sig;if(diff>=ACTIVE.autoThreshold)ACTIVE.monitorStats.changes++;if(ACTIVE.visionBusy){ACTIVE.monitorStats.skipped++;renderMonitorCounters();return;}
 const secondsSince=(now-ACTIVE.lastAnalyzedAt)/1000;const elapsed=(now-ACTIVE.started)/1000;
 const needCheck=ACTIVE.lastAnalyzedAt===0 || (secondsSince>=ACTIVE.autoMinGap && diff>=ACTIVE.autoThreshold) || secondsSince>=ACTIVE.autoMaxGap;
 if(needCheck&&elapsed>2){
  if(ACTIVE.perSessionLimit>0&&ACTIVE.visionCount>=ACTIVE.perSessionLimit){stopVisionAuto();monitorSummary('بودجهٔ درخواست تصویری این جلسه تمام شد؛ برای ادامه خودت تنظیمات را تغییر بده.');activity('local','ناظر تصویری به سقف جلسه رسید و ارسال را متوقف کرد.');return;}
  ACTIVE.lastAnalyzedAt=now;void visionNow(ACTIVE.visionPrefs,{auto:true,changeScore:diff});
 }
 renderMonitorCounters();}
function applyVisionAuto(){const settings=visionSettings();stopVisionAuto();ACTIVE.visionPrefs={...settings};if(!ACTIVE.stream){showToast('ابتدا تب یا پنجره را به اشتراک بگذار.');return;}
 if(!settings.consent){showToast('بدون اجازهٔ ارسال تصویر، AI نمی‌تواند تصاویر را تحلیل کند.');return;}
 readMonitorPreferences();if(!settings.auto){monitorSummary('پایش تصویری خاموش است؛ تحلیل دستی با اجازه فعال است.');activity('local','پایش تصویری متوقف شد.');return;}
 if(settings.model&&!/^[a-zA-Z0-9._:-]{1,96}$/.test(settings.model)){showToast('شناسهٔ مدل نامعتبر است.');return;}
 ACTIVE.visionAuto=true;ACTIVE.lastSignature=null;ACTIVE.lastAnalyzedAt=0;
 ACTIVE.monitorTimer=setInterval(scanScene,2000);scanScene();
 monitorSummary('پایش محلی پیوسته فعال است؛ فریم‌ها فقط هنگام نیاز و با اجازه به AI فرستاده می‌شوند.');
 activity('local',`پایش تغییرات تصویر با فاصلهٔ بررسی ۲ ثانیه؛ حداقل فاصلهٔ AI ${ACTIVE.autoMinGap} ثانیه، سقف جلسه ${ACTIVE.perSessionLimit===0?'بدون سقف برای مدل محلی':ACTIVE.perSessionLimit+' فریم'}.`);renderMonitorCounters();}
async function visionNow(lockedSettings,meta={}){if(!ACTIVE.stream){showToast('ابتدا اشتراک‌گذاری تب را شروع کن.');return;}
 const settings=lockedSettings||visionSettings();if(!settings.consent){showToast('مجوز ارسال این فریم به AI را فعال کن.');return;}ACTIVE.visionPrefs={...settings};
 if(ACTIVE.visionBusy){showToast('درخواست تحلیل قبلی هنوز تکمیل نشده است.');return;}
 if(ACTIVE.perSessionLimit>0&&ACTIVE.visionCount>=ACTIVE.perSessionLimit){monitorSummary('بودجهٔ فریم این جلسه تکمیل شده است.');return;}
 if(settings.model&&!/^[a-zA-Z0-9._:-]{1,96}$/.test(settings.model)){showToast('شناسهٔ مدل بینایی معتبر نیست.');return;}
 const v=ACTIVE.visionVideo;if(!v||v.readyState<2||!v.videoWidth){showToast('هنوز تصویری از تب در دسترس نیست.');return;}
 const scale=Math.min(1,960/v.videoWidth,720/v.videoHeight);
 const cv=document.createElement('canvas');cv.width=Math.round(v.videoWidth*scale);cv.height=Math.round(v.videoHeight*scale);
 if(!cv.width||!cv.height)return;
 const ctx=cv.getContext('2d',{alpha:false});ctx.drawImage(v,0,0,cv.width,cv.height);
 const frame=cv.toDataURL('image/jpeg',0.68);if(frame.length>1_850_000){showToast('فریم برای ارسال بزرگ است؛ درخواست ارسال نشد.');return;}
 const elapsedSec=Math.round((Date.now()-ACTIVE.started)/1000), source=current(),epoch=ACTIVE.monitorEpoch,consentSnapshot=!!settings.consent;
 ACTIVE.visionBusy=true;ACTIVE.visionCount++;const ctl=new AbortController();ACTIVE.visionAbort=ctl;
 activity('local','انتخاب و آماده‌سازی یک فریم مجاز در زمان '+ts(elapsedSec)+'؛ موتور داخلی آن را تفسیر نمی‌کند.');
 const label=$('#obs-vision-status');if(label)label.textContent='فریم برای تحلیل به مدل انتخابی ارسال شد؛ نتیجه در انتظار است.';
 try{const r=await fetch('/api/observer/vision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frame,
 elapsedSec,title:source.title,transcriptContext:(source.transcript||'').slice(-1400),providerId:settings.provider,model:settings.model,sourceChangeScore:Math.round((meta.changeScore||0)*100)/100}) ,signal:ctl.signal});
 const d=await r.json();if(!r.ok)throw Error(d.error||'مدل بینایی پاسخ نداد');
 if(source!==current() || epoch!==ACTIVE.monitorEpoch || !ACTIVE.stream || !consentSnapshot){activity('local','نتیجهٔ قدیمی/لغوشده پس از توقف یا تغییر مجوز کنار گذاشته شد.');return;}
 source.visualObservations=Array.isArray(source.visualObservations)?source.visualObservations:[];
 source.visualObservations.push(d);source.visualObservations=source.visualObservations.slice(-120);ACTIVE.monitorStats.analyzed++;if(ACTIVE.health&&settings.provider!=='ollama')ACTIVE.health.requestsUsed++;persist();renderMonitorCounters();
 const area=$('#obs-vision-results');if(area)area.innerHTML=visualMarkup();
 activity('ai','تحلیل واقعی فریم توسط '+(d._provenance?.model||settings.provider)+' در '+ts(elapsedSec)+' ثبت شد.');
 if(label)label.textContent='فریم با AI تحلیل شد؛ نتیجه همراه با عدم قطعیت و شناسنامهٔ مدل ذخیره شد.';
 }catch(e){if(e.name!=='AbortError'){ACTIVE.monitorStats.failed++;activity('ai','تحلیل فریم ناموفق بود: '+e.message);monitorSummary('تحلیل ناموفق: '+e.message);if(/429|کلید|پیکربندی|model|سقف|provider/i.test(String(e.message))&&ACTIVE.visionAuto){stopVisionAuto();monitorSummary('پایش تصویری برای جلوگیری از درخواست‌های ناموفق متوقف شد: '+e.message);}}}
 finally{ACTIVE.visionBusy=false;if(ACTIVE.visionAbort===ctl)ACTIVE.visionAbort=null;renderMonitorCounters();}}
async function start(){if(ACTIVE.stream)return;if(!navigator.mediaDevices?.getDisplayMedia){status('مرورگر اشتراک‌گذاری نمایشگر را پشتیبانی نمی‌کند.','error');return;}
 try{const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:3},audio:true,systemAudio:'include',surfaceSwitching:'include',selfBrowserSurface:'exclude'});ACTIVE.stream=stream;ACTIVE.started=Date.now();ACTIVE.visionCount=0;ACTIVE.monitorStats={scanned:0,changes:0,analyzed:0,failed:0,skipped:0};ACTIVE.monitorEpoch++;ACTIVE.visionVideo=document.createElement('video');ACTIVE.visionVideo.muted=true;ACTIVE.visionVideo.playsInline=true;ACTIVE.visionVideo.srcObject=new MediaStream(stream.getVideoTracks());ACTIVE.visionVideo.play().catch(()=>{});const vs=visionSettings();ACTIVE.visionPrefs={...vs};ACTIVE.autoDraftConsent=!!$('#obs-auto-draft')?.checked;ACTIVE.autoDraftPrefs={provider:$('#obs-provider')?.value||'openai',model:($('#obs-model')?.value||'').trim()};stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>stop(false),{once:true}));keepMeta();startAudioCapture();render();updateFloat();if(vs.consent){const consent=$('#obs-vision-consent'),aut=$('#obs-vision-auto');if(consent)consent.checked=true;if(aut)aut.checked=vs.auto;if(vs.auto)applyVisionAuto();}const vprov=$('#obs-vision-provider'),vmodel=$('#obs-vision-model');if(vprov)vprov.value=vs.provider;if(vmodel)vmodel.value=vs.model;activity('local','شروع مشاهدهٔ تب/پنجره با اجازهٔ کاربر؛ رسانه فقط در محدودهٔ اشتراک‌گذاری انتخاب‌شده دریافت می‌شود.');void health();status('اشتراک‌گذاری با اجازهٔ تو فعال شد. ناظر فقط زمان و نشانه‌ها را نگه می‌دارد.','ok');}
 catch(e){status('اشتراک‌گذاری آغاز نشد: '+(e.name==='NotAllowedError'?'اجازه داده نشد':e.message),'error');}
}
function stop(keep=true){if(!ACTIVE.stream)return;keepMeta();const elapsed=Math.round((Date.now()-ACTIVE.started)/1000);const s=ACTIVE.stream;ACTIVE.stream=null;if(ACTIVE.audioInterval){clearInterval(ACTIVE.audioInterval);ACTIVE.audioInterval=null;}const rec=ACTIVE.audioRecorder;ACTIVE.audioRecorder=null;if(rec?.state==='recording')try{rec.stop()}catch{};ACTIVE.audioConsent=false;ACTIVE.visionAbort?.abort();ACTIVE.audioAbort.forEach(x=>x.abort());ACTIVE.audioAbort.clear();stopVisionAuto();ACTIVE.visionPrefs=null;if(ACTIVE.visionVideo){ACTIVE.visionVideo.srcObject=null;ACTIVE.visionVideo=null;}s.getTracks().forEach(t=>{try{t.stop()}catch{}});current().lastViewedSeconds=elapsed;persist();updateFloat();activity('local','پایان مشاهده پس از '+ts(elapsed));const draftApproved=ACTIVE.autoDraftConsent,draftPrefs=ACTIVE.autoDraftPrefs;ACTIVE.autoDraftConsent=false;ACTIVE.autoDraftPrefs=null;if(view==='observer')render();if(draftApproved){activity('local','جلسه پایان یافت؛ طبق رضایت قبلی، ساخت خودکار پیش‌نویس درخواست می‌شود.');void generateDraft(true,draftPrefs);}if(keep)showToast('مشاهده پایان یافت؛ مطالب جلسه ذخیره شدند.');}
function bookmark(){if(!ACTIVE.stream)return;const c=current();c.bookmarks=c.bookmarks||[];if(c.bookmarks.length>=100){showToast('سقف ۱۰۰ نشانک در این جلسه است.');return;}c.bookmarks.push({sec:Math.round((Date.now()-ACTIVE.started)/1000),label:'نکتهٔ مهم'});persist();activity('local','ثبت نشانک در زمان '+ts(c.bookmarks.at(-1).sec));if(view==='observer'){const m=$('.ob-marks');if(m)m.innerHTML=c.bookmarks.map(b=>`<span class="ob-mark">${esc(ts(b.sec))} · ${esc(b.label)}</span>`).join('');}showToast('نشانک زمان‌دار ثبت شد.');}
function exportObserver(){keepMeta();const bundle={schema:'madar-observer-v1',exportedAt:new Date().toISOString(),session:current(),activity:(state.observerActivity||[]).slice(-100)};const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Madar-Observer-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);activity('local','خروجی پشتیبان از جلسه و فعالیت‌ها ساخته شد.');}
function store(){keepMeta();const c=current();if(!c.title&&!c.transcript&&!(c.visualObservations||[]).length){showToast('نام، متن یا تحلیل تصویری جلسه را ثبت کن.');return;}state.observerSessions.push({...c,savedAt:new Date().toISOString(),bookmarks:[...(c.bookmarks||[])]});state.observerSessions=state.observerSessions.slice(-12);persist();activity('local','ثبت جلسه در حافظهٔ محلی');render();showToast('جلسه بایگانی شد؛ اطلاعات فقط محلی ذخیره شدند.');}
async function health(){try{const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)throw Error('سرور پاسخ معتبر نداد');ACTIVE.health=await r.json();const e=$('#obs-ai-status');if(e)e.textContent=ACTIVE.health.onlineAIConfigured?'سرور پاسخ‌گو؛ حداقل یک سرویس ابری دارای کلید است':(ACTIVE.health.configuredProviders?.ollama?'سرور فعال؛ مدل محلی ثبت شده (سلامت مدل جداگانه بررسی شود)':'سرور فعال؛ مدل AI پیکربندی نشده');renderMonitorCounters();}catch(e){const node=$('#obs-ai-status');if(node)node.textContent='اتصال AI برقرار نشد: '+e.message;}}
async function generateDraft(automatic=false,prefs=null){if(!automatic)keepMeta();const c=current();const txt=c.transcript.trim();if(txt.length<150&&!(c.visualObservations||[]).length){showToast('برای تهیهٔ درس، متن معتبر یا تحلیل تصویری ثبت‌شده لازم است.');return;}
 if(!automatic&&!$('#obs-consent')?.checked){showToast('برای ارسال متن به AI باید مجوز همان درخواست را تأیید کنی.');return;}if(automatic&&!prefs)return;
 const provider=prefs?.provider||$('#obs-provider')?.value||'openai',model=(prefs?.model??$('#obs-model')?.value??'').trim();if(model&&!/^[a-zA-Z0-9._:-]{1,96}$/.test(model)){showToast('شناسهٔ مدل معتبر نیست.');return;}
 ACTIVE.loading=true;activity('ai','ارسال متن و توصیف‌های تصویری ثبت‌شده به مدل '+provider+' با تأیید کاربر؛ تصویر خام در این مرحله ارسال نمی‌شود.');const result=$('#obs-result');if(result)result.innerHTML='<div class="notice">درخواست ارسال شد؛ منتظر پاسخ مدل و بررسی ساختار علمی هستیم...</div>';
 try{const r=await fetch('/api/observer/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:c.title||'درس ویدیویی',sourceUrl:c.url,transcript:txt.slice(0,15000),bookmarks:(c.bookmarks||[]).slice(0,40),visualObservations:(c.visualObservations||[]).slice(-8),providerId:provider,model})});const d=await r.json();if(!r.ok)throw Error(d.error||'خطای سرویس AI');if(!Array.isArray(d.quiz)||d.quiz.length!==5||!Array.isArray(d.cards)||String(d.concept||'').length<120||String(d.example||'').length<80){throw Error('خروجی AI طبق پروتکل پنج‌سؤالی نبود.');}ACTIVE.draft=d;state.observerDraft=d;ACTIVE.draftSource={createdAt:c.createdAt,title:c.title,url:c.url};state.observerDraftSource=ACTIVE.draftSource;persist();activity('ai','دریافت پیش‌نویس از '+(d._provenance?.model||'مدل')+'؛ پنج سؤال و '+d.cards.length+' کارت پیشنهادی');if(result)result.innerHTML=draftMarkup(d);showToast('پیش‌نویس آموزشی آمادهٔ بازبینی است.');}catch(e){activity('ai','ساخت پیش‌نویس ناموفق: '+e.message);if(result)result.innerHTML='<div class="notice warning">'+esc(e.message)+'</div>';}finally{ACTIVE.loading=false;}
}
function approve(){if(!ACTIVE.draft)return;const d=ACTIVE.draft,c=current();if(ACTIVE.draftSource&&ACTIVE.draftSource.createdAt!==c.createdAt){showToast('این پیش‌نویس به جلسهٔ دیگری مربوط است. ابتدا همان جلسه را باز کن.');return;}const id=uid();state.subjects=state.subjects||[];
 const subjectTitle='ویدیو: '+(c.title||'درس مشاهده‌شده');let s=state.subjects.find(x=>x.title===subjectTitle);if(!s){s={id:uid(),title:subjectTitle,description:'دورهٔ پیشنهادی از یک ویدیو؛ نیازمند بازبینی منبع',goal:'فهم مفاهیم از پایه',lessons:[],createdAt:new Date().toISOString()};state.subjects.push(s);}
 s.lessons.push({id,title:String(d.title||c.title||'مفهوم مقدماتی').slice(0,150),goal:String(d.goal||'فهم نخستین مفهوم').slice(0,400),concept:String(d.concept||'').slice(0,4000),steps:(d.steps||[]).slice(0,12).join('\n'),example:String(d.example||'').slice(0,2400),exercise:String(d.quiz[0]?.q||'پس از مطالعه، توضیح شخصی بنویس.'),expected:String(d.quiz[0]?.answer||''),quiz:d.quiz,cards:d.cards,verified:false,stage:'ai-generated-unreviewed',sources:c.url.startsWith('https://')?[{title:c.title||'منبع ویدیویی',url:c.url}]:[],aiAttribution:d._provenance||null,sourceType:'observer',sourceUrl:c.url,sourceCaptionsLength:c.transcript.length,checkedAt:new Date().toISOString(),provenance:d._provenance||null,sourceMarkers:(d.moments||[]).slice(0,12),sourceVisualObservations:(c.visualObservations||[]).slice(-8)});
 persist();activity('local','ثبت پیش‌نویس قفل‌شده در علوم شخصی؛ بدون قبولی و کارت فعال');ACTIVE.draft=null;state.observerDraft=null;ACTIVE.draftSource=null;state.observerDraftSource=null;persist();render();showToast('درس به‌صورت پیش‌نویس قفل‌شده ذخیره شد؛ هیچ قبولی یا کارت مرورِ فعال ساخته نشد.');}
// Capture by user gesture only. No silent permission or background screenshot upload.
document.addEventListener('click',e=>{const b=e.target.closest('[data-obs]');if(!b)return;e.preventDefault();const a=b.dataset.obs;
 if(a==='start')start(); else if(a==='stop')stop(); else if(a==='bookmark')bookmark();else if(a==='save'){keepMeta();showToast('متن در حافظهٔ محلی مَدار ذخیره شد.');} else if(a==='store')store();else if(a==='export')exportObserver();else if(a==='connection')health();else if(a==='vision-now')visionNow();else if(a==='vision-auto')applyVisionAuto();else if(a==='vision-pause'){stopVisionAuto();monitorSummary('پایش تصویری با درخواست تو مکث شد.');activity('local','مکث نظارت تصویری توسط کاربر.');}else if(a==='generate')generateDraft();else if(a==='approve')approve();else if(a==='load'){const i=Number(b.dataset.i);if(state.observerSessions[i]){state.observerCurrent=JSON.parse(JSON.stringify(state.observerSessions[i]));persist();render();}}
});
document.addEventListener('change',async e=>{if(e.target?.id==='obs-audio-consent'&&!e.target.checked){ACTIVE.audioConsent=false;ACTIVE.audioAbort.forEach(x=>x.abort());ACTIVE.audioAbort.clear();if(ACTIVE.audioInterval)clearInterval(ACTIVE.audioInterval);ACTIVE.audioInterval=null;const rec=ACTIVE.audioRecorder;ACTIVE.audioRecorder=null;if(rec?.state==='recording')rec.stop();activity('local','اجازهٔ ارسال صوت برداشته شد؛ ارسال صوت و ضبط قطعه‌ای متوقف شد.');}if(e.target?.id==='obs-vision-consent'&&!e.target.checked){ACTIVE.visionAbort?.abort();stopVisionAuto();ACTIVE.visionPrefs={...visionSettings(),consent:false,auto:false};activity('local','مجوز ارسال تصویری برداشته شد؛ نمونه‌گیری خودکار متوقف شد.');}if(['obs-vision-provider','obs-vision-model','obs-vision-auto','obs-gap','obs-limit'].includes(e.target?.id)&&ACTIVE.stream){ACTIVE.visionPrefs={...visionSettings()};if(ACTIVE.visionAuto){stopVisionAuto();monitorSummary('تنظیم مدل/سقف تغییر کرد؛ برای اعمال، ناظر را دوباره فعال کن.');}}if(e.target?.id!=='obs-captions')return;const f=e.target.files?.[0];if(!f)return;if(f.size>3*1024*1024){showToast('حجم متن ورودی باید کمتر از سه مگابایت باشد.');return;}
 let txt=await f.text();const captions=parseCaptions(txt);const formatted=captions.map(s=>(s.at===null?'':ts(s.at)+'  ')+s.text).join('\n');const c=current();c.transcript=formatted.slice(0,35000);c.segments=captions.slice(0,250);persist();const t=$('#obs-transcript');if(t)t.value=c.transcript;showToast(captions.length+' بخش زیرنویس/متن آماده شد.');
});
document.addEventListener('input',e=>{if(['obs-title','obs-url','obs-transcript'].includes(e.target?.id)){clearTimeout(ACTIVE.timer);ACTIVE.timer=setTimeout(keepMeta,500);}});
window.addEventListener('pagehide',()=>{if(ACTIVE.stream)stop(false);});
ensure();if(state.observerDraft && typeof state.observerDraft==='object'){ACTIVE.draft=state.observerDraft;ACTIVE.draftSource=state.observerDraftSource||null;}
})();
