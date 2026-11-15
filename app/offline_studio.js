'use strict';
/* Local structured-text to flashcard studio. No network, no guessing or hidden uploads. */
(function(){
const NAV_ID='cardStudio';
let candidates=[];
let activeTopic='';
function stripBullet(line){return String(line||'').replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()}
function parseCardCandidates(raw){
 const text=String(raw||'').replace(/\r\n?/g,'\n').slice(0,150000);
 const lines=text.split('\n').map(stripBullet).filter(Boolean),found=[];
 let pending=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  // Explicit question and answer pairs; no speculative summary of arbitrary prose.
  let q=line.match(/^(?:سؤال|پرسش|question|q)\s*[:：]\s*(.{3,180})$/i);
  if(q){pending=q[1];continue;}
  let answer=line.match(/^(?:پاسخ|جواب|answer|a)\s*[:：]\s*(.{2,300})$/i);
  if(answer&&pending){found.push({front:pending,back:answer[1],source:'پرسش و پاسخ متن'});pending=null;continue;}
  // Other easy-to-verify structured material: tab, semicolon or spaced colon.
  const m=line.match(/^(.{2,115}?)(?:\t|\s+[—–]\s+|\s*[:：]\s+)(.{3,340})$/);
  if(m&&!/^(?:https?|www)\b/i.test(m[1]))found.push({front:m[1].trim(),back:m[2].trim(),source:'جفت اصطلاح و تعریف'});
 }
 const dedup=new Map();for(const c of found){const k=norm(c.front);if(!dedup.has(k)&&c.front.length<=180&&c.back.length<=350)dedup.set(k,c)}
 return [...dedup.values()].slice(0,150);
}
function viewCardStudio(){
 const nums=(state.flashcards||[]).reduce((a,c)=>{a.total++;if(c.dueAt<=today())a.due++;for(const h of c.history||[]){a.review++;if(h.ok===true||h.known===true)a.known++}return a},{total:0,due:0,review:0,known:0});
 return `<div class="intro"><div><h2>کارگاه آفلاین فلش‌کارت</h2><p>متن و فایل ساختاریافته را بدون ارسال به اینترنت به کارت تبدیل کن. پیش از ذخیره، خودت صحت علمی همهٔ جفت‌ها را تأیید می‌کنی.</p></div><button class="button button-outline" data-nav="review">رفتن به مرور</button></div>
 <div class="metrics"><div class="metric"><strong>${nums.total}</strong><small>کل کارت‌ها</small></div><div class="metric"><strong>${nums.due}</strong><small>آمادهٔ مرور</small></div><div class="metric"><strong>${nums.review}</strong><small>نوبت مرور ثبت‌شده</small></div><div class="metric"><strong>${nums.review?Math.round(100*nums.known/nums.review):'—'}${nums.review?'٪':''}</strong><small>پاسخ‌های موفق (ثبت‌شده)</small></div></div>
 <div class="grid-main"><section class="card"><h3>۱. ورود محتوای آموزشی</h3><p class="small muted">هر خط: <code>مفهوم: تعریف</code> یا <code>مفهوم — تعریف</code>. همچنین جفت‌های «سؤال: ...» و «پاسخ: ...» پذیرفته می‌شوند. متن آزاد یا PDF بدون ساختار، خودکار به پاسخ معتبر تبدیل نمی‌شود.</p>
 <label class="form-label">عنوان درس / علم برای دسته‌بندی</label><input id="studio-topic" class="field" placeholder="مثلاً جبر خطی ـ بردار" value="${cleanText(activeTopic)}" maxlength="100">
 <label class="form-label">متن ساختاریافته</label><textarea id="studio-text" class="textarea" rows="10" placeholder="ماتریس همانی: بردار را در ضرب تغییر نمی‌دهد.\nمشتق: نرخ تغییر لحظه‌ای تابع"></textarea>
 <label class="form-label">یا فایل متنی شخصی</label><input id="studio-file" type="file" accept=".txt,.md,.csv,.tsv,text/plain,text/markdown,text/csv" class="field">
 <div class="form-actions"><button class="button button-primary" data-action="studio-extract">۲. نمایش کارت‌های پیشنهادی</button></div>
 <div class="notice warning">این ابزار با الگوهای صریح متن کار می‌کند، نه مدل زبانی؛ کارت‌ها فقط پس از بازبینی دستی ذخیره می‌شوند. فایل روی دستگاه می‌ماند.</div></section>
 <section class="card"><h3>۲. بازبینی و ذخیره</h3><p class="small">${candidates.length} جفت ساختاریافته استخراج شده است.</p>${candidates.length?`<div class="studio-preview">${candidates.slice(0,35).map((c,i)=>`<div class="studio-pair"><strong>${i+1}. ${cleanText(c.front)}</strong><p>${cleanText(c.back)}</p></div>`).join('')}${candidates.length>35?'<p class="small muted">فقط ۳۵ مورد اول پیش‌نمایش شده‌اند.</p>':''}</div><label class="choice"><input type="checkbox" id="studio-verify"> من صحت پرسش‌ها و پاسخ‌ها را با منبع درس بررسی کردم.</label><button class="button button-primary" data-action="studio-save">ثبت ${candidates.length} کارت برای مرور</button>`:'<div class="notice">ابتدا محتوای ساختاریافته وارد کن و پیش‌نمایش را ببین.</div>'}</section></div>`;
}
const previousRender=render;
render=function(){if(view===NAV_ID){document.querySelector('#page-eyebrow').textContent='موتور حافظه';document.querySelector('#page-title').textContent='کارت‌ساز آفلاین';document.querySelector('#page-root').innerHTML=viewCardStudio();document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===NAV_ID));return}previousRender();};
const nav=document.createElement('button');nav.className='nav-item';nav.dataset.nav=NAV_ID;nav.innerHTML='<span class="nav-ico">▤</span> ساخت فلش‌کارت از متن';document.querySelector('.side-nav [data-nav="review"]')?.after(nav);
document.addEventListener('change',async e=>{if(e.target.id!=='studio-file')return;const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){showToast('حداکثر حجم فایل متنی ۲ مگابایت است.');return}try{document.querySelector('#studio-text').value=await file.text();showToast('محتوای فایل فقط داخل مرورگر خوانده شد.')}catch{showToast('فایل قابل خواندن نیست.')} });
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 if(el.dataset.action==='studio-extract'){
  activeTopic=document.querySelector('#studio-topic')?.value.trim().slice(0,100)||'بدون دسته';
  candidates=parseCardCandidates(document.querySelector('#studio-text')?.value||'');
  if(!candidates.length){showToast('جفت سؤال/پاسخ یا اصطلاح/تعریف قابل تشخیص نبود.');return}
  // Preserve input across rerender.
  const existing=document.querySelector('#studio-text')?.value||'';
  render();document.querySelector('#studio-text').value=existing;showToast(candidates.length+' کارت پیشنهادی یافت شد.');
 }
 if(el.dataset.action==='studio-save'){
  if(!document.querySelector('#studio-verify')?.checked){showToast('ابتدا صحت علمی را بررسی و تأیید کن.');return}
  let n=0;state.flashcards=state.flashcards||[];
  for(const c of candidates){if(state.flashcards.some(x=>norm(x.front)===norm(c.front)&&norm(x.back)===norm(c.back)))continue;
   state.flashcards.push({id:uid(),front:c.front,back:c.back,topic:activeTopic,origin:'استخراج ساختاری آفلاین؛ تأیید دستی کاربر',box:1,dueAt:today(),createdAt:isoNow(),history:[]});n++;
  }
  save();candidates=[];render();showToast(n+' کارت جدید ثبت شد.');
 }
},true);
window.MADAR_STUDIO={parseCardCandidates};
})();
