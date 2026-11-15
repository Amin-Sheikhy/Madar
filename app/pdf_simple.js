/* Madar v4.53: one action -> local PDF viewer; safe delete of managed copies is available.
 * No model/API/OCR/permission settings for plain reading. */
(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const urlFor=f=>f.kind==='books'?'/api/local-pdf/show?name='+encodeURIComponent(f.id):'/api/vault/inline-pdf?id='+encodeURIComponent(f.id);
 const $=s=>document.querySelector(s);
 const input=document.createElement('input');
 input.type='file';input.accept='.pdf,application/pdf';input.hidden=true;input.id='madar-pdf-direct-picker';document.body.append(input);
 const panel=document.createElement('section');panel.id='madar-reader';panel.className='madar-reader';panel.hidden=true;
 panel.innerHTML=`<div class="reader-shell" role="dialog" aria-modal="true" aria-label="مطالعه کتاب">
 <header class="reader-header"><strong>📖 <span id="reader-title">کتاب من</span></strong><span id="reader-state" role="status" aria-live="polite"></span>
 <button type="button" data-reader="choose">انتخاب PDF دیگر</button><button type="button" data-reader="library">کتاب‌های من</button>
 <button type="button" data-reader="external">نمایش در تب جدید</button><button type="button" data-reader="close" aria-label="بستن کتاب">✕ بستن</button></header>
 <div id="reader-library" class="reader-library" hidden></div>
 <div id="reader-error" class="reader-error" hidden></div>
 <iframe id="reader-frame" title="نمایش PDF محلی" referrerpolicy="no-referrer" loading="eager"></iframe>
 <div class="reader-empty" id="reader-empty">یک فایل PDF انتخاب کنید؛ مَدار آن را خودکار باز می‌کند.</div></div>`;
 document.body.append(panel);
 const p=s=>panel.querySelector(s);
 const note=s=>{p('#reader-state').textContent=s||''};
 let current=null,previewURL=null,uploadToken=0,uploading=false;
 const saveLast=f=>{try{localStorage.setItem('madar-last-pdf-v450',JSON.stringify({kind:f.kind,id:f.id,name:f.name}))}catch{}};
 const last=()=>{try{const x=JSON.parse(localStorage.getItem('madar-last-pdf-v450')||'null');return x&&['books','vault'].includes(x.kind)&&typeof x.id==='string'&&typeof x.name==='string'?x:null}catch{return null}};
 const removeBlob=()=>{if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null}};
 const error=s=>{p('#reader-error').hidden=false;p('#reader-error').textContent=s};
 const clearError=()=>{p('#reader-error').hidden=true;p('#reader-error').textContent=''};
 function show(){panel.hidden=false;document.body.classList.add('madar-reader-active');clearError();p('#reader-library').hidden=true}
 function renderPDF(url){p('#reader-frame').src=url;p('#reader-frame').hidden=false;p('#reader-empty').hidden=true}
 function close(){panel.hidden=true;document.body.classList.remove('madar-reader-active');p('#reader-frame').src='about:blank';p('#reader-library').hidden=true;p('#reader-empty').hidden=false;removeBlob()}
 function choose(){input.click()}
 async function listJSON(url){const r=await fetch(url,{cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error||'خطای کتابخانه');return v}
 async function books(){
  show();note('در حال پیدا کردن کتاب‌ها…');p('#reader-library').hidden=false;
  try{
   const [b,l]=await Promise.allSettled([listJSON('/api/local-pdf/list'),listJSON('/api/vault/list')]);
   const items=[...(b.status==='fulfilled'?(b.value.books||[]):[]).map(x=>({kind:'books',id:x.name,name:x.name})),
    ...(l.status==='fulfilled'?(l.value.files||[]):[]).filter(x=>String(x.name).toLowerCase().endsWith('.pdf')).map(x=>({kind:'vault',id:x.id,name:x.name}))];
   p('#reader-library').innerHTML=`<div class="reader-library-head"><h3>کتاب‌های من</h3><span>حذف فقط نسخهٔ ذخیره‌شده را پاک می‌کند؛ فایل اصلی بیرون از مَدار باقی می‌ماند.</span></div><div class="reader-list"><button type="button" data-reader="choose" class="reader-select-new">＋ انتخاب فایل PDF</button>${items.map((x,i)=>`<div class="reader-book-row"><button type="button" data-book="${i}" class="reader-book-open">📄 ${esc(x.name)}<small>${x.kind==='books'?'نسخهٔ Books روی D':'نسخهٔ کتابخانهٔ مَدار'}</small></button><button type="button" data-delete-book="${i}" class="reader-book-delete" aria-label="حذف ${esc(x.name)}" title="حذف کتاب">🗑 حذف</button></div>`).join('')}</div>`;
   p('#reader-library').querySelectorAll('[data-book]').forEach(b=>b.addEventListener('click',()=>openSaved(items[Number(b.dataset.book)])));
   p('#reader-library').querySelectorAll('[data-delete-book]').forEach(b=>b.addEventListener('click',()=>deleteSaved(items[Number(b.dataset.deleteBook)])));
   note(items.length?`${items.length} کتاب محلی`:'کتابی ثبت نشده؛ یک PDF انتخاب کنید');
   if(b.status==='rejected'&&l.status==='rejected')error('سرویس کتابخانه در دسترس نیست. با «انتخاب PDF» می‌توانید فایل را مستقیم ببینید.');
  }catch(e){note('کتابخانه در دسترس نیست');error(e.message)}
 }
 async function deleteSaved(f){
  if(!f)return;
  const managedCopy=f.kind==='books'?'نسخهٔ ذخیره‌شده در پوشهٔ Books روی D':'نسخهٔ مدیریت‌شده در کتابخانهٔ مَدار';
  const question=`کتاب «${f.name}» حذف شود؟\n\nفقط ${managedCopy} حذف می‌شود. فایل اصلی بیرون از مَدار دست‌نخورده می‌ماند.`;
  if(!window.confirm(question))return;
  note('در حال حذف نسخهٔ ذخیره‌شده…');
  try{
   const endpoint=f.kind==='books'?'/api/local-pdf/delete':'/api/vault/delete';
   const body=f.kind==='books'?{name:f.id,confirm:true}:{fileId:f.id,confirmName:f.name};
   const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
   const data=await r.json();if(!r.ok||data.deleted!==true)throw Error(data.error||'حذف کتاب تأیید نشد.');
   if(current&&current.kind===f.kind&&current.id===f.id){current=null;}
   try{const recent=JSON.parse(localStorage.getItem('madar-last-pdf-v450')||'null');if(recent&&recent.kind===f.kind&&recent.id===f.id)localStorage.removeItem('madar-last-pdf-v450')}catch{}
   note('کتاب حذف شد');
   await books();
   note('نسخهٔ ذخیره‌شده حذف شد');
  }catch(e){note('حذف انجام نشد');error('حذف کتاب موفق نبود: '+e.message)}
 }
 async function openSaved(f){
  const token=++uploadToken;show();p('#reader-library').hidden=true;
  current=f;removeBlob();p('#reader-title').textContent=f.name;note('در حال باز کردن…');
  const source=urlFor(f);
  try{
   // Validate the local route instead of placing a possible HTML error in the PDF iframe.
   const r=await fetch(source,{cache:'no-store'});
   if(!r.ok)throw Error('فایل پیدا نشد یا سالم نیست (HTTP '+r.status+')');
   if(!(r.headers.get('Content-Type')||'').includes('application/pdf'))throw Error('خروجی PDF معتبر نیست.');
   const data=await r.blob();
   if(token!==uploadToken)return;
   previewURL=URL.createObjectURL(data);
   // Use a single local read with a browser Blob URL; no double PDF request.
   renderPDF(previewURL);note('نمایش محلی · بدون AI');saveLast(f);
  }catch(e){
   if(token!==uploadToken)return;
   p('#reader-frame').hidden=true;p('#reader-empty').hidden=false;
   error('باز کردن این نسخه موفق نبود: '+e.message+'؛ می‌توانید فایل را دوباره انتخاب کنید.');
  }
 }
 async function openSelected(file){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.pdf')){show();error('لطفاً فایل PDF انتخاب کنید.');return}
  const token=++uploadToken;show();p('#reader-library').hidden=true;removeBlob();
  previewURL=URL.createObjectURL(file);current={kind:'temp',id:'',name:file.name};
  p('#reader-title').textContent=file.name;renderPDF(previewURL);
  note('فایل باز شد؛ در حال ثبت در D…');uploading=true;
  try{
   const r=await fetch('/api/local-pdf/import?name='+encodeURIComponent(file.name),{
      method:'POST',headers:{'Content-Type':'application/pdf'},body:file});
   const d=await r.json();if(!r.ok)throw Error(d.error||'ذخیره روی D انجام نشد.');
   if(token!==uploadToken)return; // User chose another book during import.
   current={kind:'books',id:d.name,name:d.name};saveLast(current);
   note('ذخیره شد روی D · نمایش بدون AI');
   // Keep current blob renderer to avoid resetting the reading position.
  }catch(e){
   if(token!==uploadToken)return;
   note('در حال نمایش محلی · ذخیره روی D ناموفق');
   error('فایل برای مطالعه باز شد، اما ذخیره در پوشه Books انجام نشد: '+e.message);
  }finally{uploading=false}
 }
 input.addEventListener('change',()=>{const f=input.files?.[0];input.value='';if(f)openSelected(f)});
 // If a PDF was dropped over the home page, treat it exactly like a user selection.
 document.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault()});
 document.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length){e.preventDefault();openSelected(e.dataTransfer.files[0])}});
 panel.addEventListener('click',e=>{
  const b=e.target.closest('[data-reader]');if(!b)return;
  switch(b.dataset.reader){
   case 'choose':choose();break;
   case 'library':books();break;
   case 'close':close();break;
   case 'external':if(current){const u=previewURL||(['vault','books'].includes(current.kind)?urlFor(current):'');if(u)window.open(u,'_blank','noopener,noreferrer')}break;
  }
 });
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-madar-pdf-select]')){e.preventDefault();choose()}
  if(e.target.closest('[data-madar-pdf-library]')){e.preventDefault();books()}
  if(e.target.closest('[data-madar-pdf-last]')){e.preventDefault();const f=last();if(f)openSaved(f);else choose()}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close()});
 // The primary action is a direct file picker, never a multi-step settings panel.
 const select=document.createElement('button');select.type='button';select.className='button button-primary madar-reader-top';select.dataset.madarPdfSelect='1';select.textContent='📖 انتخاب PDF';
 $('.top-actions')?.prepend(select);
 const recent=()=>last();
 function addHomeActions(){
  const target=$('.madar-fast-grid');if(!target)return;
  // Put reading before technical tools; older tools remain accessible from More.
  target.innerHTML=`<button type="button" class="madar-home-pdf" data-madar-pdf-select="1"><span>📖</span><b>انتخاب PDF و خواندن</b><small>فقط فایل را انتخاب کن؛ خودکار باز و روی D ذخیره می‌شود</small></button>
    <button type="button" data-madar-pdf-last="1"><span>↻</span><b>ادامه آخرین کتاب</b><small>${recent()?esc(recent().name):'یا انتخاب نخستین PDF'}</small></button>
    <button type="button" data-nav="python"><span>⌘</span><b>آموزش</b><small>شروع یا ادامه درس‌ها</small></button>
    <button type="button" data-nav="review"><span>◷</span><b>مرور و تمرین</b><small>فلش‌کارت و آزمون</small></button>`;
 }
 // The original dashboard is rerendered by old modules; repopulate if needed.
 const root=$('#page-root');if(root){const ob=new MutationObserver(()=>{
  const f=$('.madar-fast-grid');if(f&&!f.querySelector('[data-madar-pdf-select]'))addHomeActions()
 });ob.observe(root,{childList:true,subtree:true});}
 addHomeActions();
 window.MadarOpenPDF=choose;
})();
