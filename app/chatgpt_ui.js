/* Madar v4.48: ChatGPT plan-usage connection. No tokens in client JS. */
(function(){
'use strict';
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let account=null, models=[],working=false,pollTimer=null;
const localServer=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
async function call(path,data){
 if(!localServer)throw new Error('این قابلیت فقط در نسخهٔ نصب‌شدهٔ مَدار روی رایانه فعال است.');
 const opts=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,confirm:true})};
 const response=await fetch('/api/chatgpt/'+path,{credentials:'same-origin',cache:'no-store',...opts});
 const obj=await response.json();if(!response.ok)throw Error(obj.error||'ارتباط برقرار نشد.');return obj;
}
function markup(){
 const s=account||{};
 const connected=!!s.permission;
 const opts=models.map(x=>`<option value="${escapeHTML(x.slug)}" ${s.model===x.slug?'selected':''}>${escapeHTML(x.name)}</option>`).join('');
 return `<div class="madar-chatgpt-connect" aria-label="ورود رسمی با ChatGPT">
  <div class="madar-chatgpt-head"><div><strong>اتصال با حساب ChatGPT</strong><p class="small muted">بدون واردکردن کلید API؛ با اجازهٔ رسمی برای استفاده از سهمیهٔ حساب واجد شرایط</p></div>
  <span class="madar-connection-state ${connected?'is-connected':'is-off'}">${connected?'● متصل':'○ متصل نیست'}</span></div>
  ${connected?`<p class="small">حساب: <b dir="ltr">${escapeHTML(s.email||'ChatGPT')}</b> · ${escapeHTML(s.message||'')}</p>
   <div class="madar-chatgpt-actions"><label>مدل قابل استفاده <select id="madar-chatgpt-model" class="field"><option value="">مدل را انتخاب کن</option>${opts}</select></label><button type="button" class="button button-primary" data-chat="save-model">انتخاب مدل</button><button type="button" class="button button-outline" data-chat="disconnect">قطع اتصال</button></div>`:
   `<div class="madar-chatgpt-actions"><button type="button" class="button button-primary" data-chat="login" data-oai-siwc-button>ادامه با ChatGPT</button><button type="button" class="button button-outline" data-chat="refresh">بررسی وضعیت اتصال</button></div>`}
  <p class="mini muted">هنگام ورود، مجوز استفاده از سهمیه را در صفحهٔ رسمی تأیید می‌کنی. گفت‌وگوهای ChatGPT وارد مَدار نمی‌شوند. متن کتاب فقط پس از تأیید ارسال می‌شود.</p>
  ${s.error?`<p class="notice warning">${escapeHTML(s.error)}</p>`:''}
  ${connected?'<a class="small" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">مشاهدهٔ سهمیه و مجوزها در ChatGPT</a>':''}
 </div>`;
}
function refreshPanel(){
 const parent=document.querySelector('#vault-ai-reader');if(!parent)return;
 let target=parent.querySelector('#madar-chatgpt-root');
 if(!target){target=document.createElement('div');target.id='madar-chatgpt-root';parent.querySelector('.card-title')?.insertAdjacentElement('afterend',target)}
 target.innerHTML=markup();
 // Legacy API fields remain available only in an optional advanced section.
 const legacy=parent.querySelector('.form-grid');
 const form=legacy?.querySelector('#ai-vault-key')?.closest('.form-grid');
 if(form&&!form.closest('.madar-advanced-connect')){
   const details=document.createElement('details');details.className='madar-advanced-connect';
   details.innerHTML='<summary>اتصال‌های پیشرفته و مدل‌های دیگر (اختیاری)</summary>';
   form.before(details);details.appendChild(form);
   const connect=parent.querySelector('[data-aipdf="connect"]');
   if(connect)details.appendChild(connect);
   const blocks=parent.querySelectorAll('.notice');
   for(const el of blocks){if(el.textContent.includes('اشتراک عادی ChatGPT جای کلید API را نمی‌گیرد')){el.textContent='مسیر بالا برای حساب‌های ChatGPT واجد شرایط، به کلید API دستی نیاز ندارد. ورود به دیگر ارائه‌دهنده‌ها ممکن است تنظیمات جداگانه داشته باشد.';details.appendChild(el);break}}
 }
}
async function refresh(quiet=false){
 try{account=await call('status');if(account.permission){try{const r=await call('models');models=r.models||[]}catch(err){if(!quiet)throw err}}}
 catch(err){if(!quiet)throw err;account={connected:false,permission:false,error:err.message}}
 refreshPanel();return account;
}
function toast(s){if(typeof showToast==='function')showToast(s);else alert(s)}
async function perform(action){
 if(working)return;working=true;
 try{
  if(action==='login'){
   // The new browser tab must be created synchronously from the user click.
   const tab=window.open('about:blank','_blank');
   const r=await call('start',{});
   if(tab)tab.location.href=r.authorizeUrl;else window.location.href=r.authorizeUrl;
   toast('ورود رسمی ChatGPT در تب جدید آغاز شد؛ بعد از صدور مجوز به مَدار برگرد.');
   if(pollTimer)clearInterval(pollTimer);
   let n=0;pollTimer=setInterval(async()=>{if(++n>90){clearInterval(pollTimer);pollTimer=null;return}try{const v=await refresh(true);if(v.permission){clearInterval(pollTimer);pollTimer=null;toast('اتصال با سهمیهٔ ChatGPT برقرار شد؛ مدل را انتخاب کن.')}}catch(_e){}},2000);
  }else if(action==='refresh'){await refresh();toast(account.permission?'اتصال ChatGPT برقرار است.':'اتصال هنوز برقرار نیست؛ از گزینهٔ ورود استفاده کن.');}
  else if(action==='save-model'){
   const value=document.getElementById('madar-chatgpt-model')?.value;
   if(!value)throw Error('یک مدل از فهرست مدل‌های مجاز انتخاب کن.');
   account=await call('model',{model:value});await refresh(true);toast('مدل مجاز انتخاب شد.');
  }else if(action==='disconnect'){
   if(!confirm('اتصال مَدار به حساب ChatGPT قطع شود؟'))return;
   account=await call('disconnect',{});models=[];refreshPanel();toast('اتصال محلی قطع شد.');
  }
 }catch(err){toast('اتصال ChatGPT: '+err.message)}finally{working=false;refreshPanel()}
}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-chat]');if(!btn)return;
 e.preventDefault();perform(btn.dataset.chat);
});
window.MadarChatGPT={refresh,render:refreshPanel,status:()=>account};
window.addEventListener('load',()=>refresh(true));
})();
