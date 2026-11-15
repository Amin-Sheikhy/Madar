'use strict';
/* Optional encrypted complete backup (AES-GCM 256-bit + PBKDF2 SHA-256).
   Password is never stored. Does not silently replace the existing readable backup.
   Requires a secure browser context (localhost, HTTPS, compatible file pages). */
(function(){
const PREFIX='madar-encrypted-backup-v1';
const toB64=a=>{let s='',u=new Uint8Array(a);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)};
const fromB64=s=>{const str=atob(s);const a=new Uint8Array(str.length);for(let i=0;i<a.length;i++)a[i]=str.charCodeAt(i);return a};
async function derive(pass,salt,iter){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function gather(){const files=[];for(const f of state.files||[]){const record=await dbGet(f.id);if(!record?.blob)throw new Error('محتوای فایل «'+f.name+'» پیدا نشد.');files.push({id:f.id,dataUrl:await toDataUrl(record.blob)})}return {...state,app:'madar-offline',exportedAt:isoNow(),filesArchive:{version:2,files}}}
function passwordOk(pass){return typeof pass==='string'&&pass.length>=12&&pass.length<=256}
async function exportEncrypted(){if(!crypto?.subtle){alert('رمزگذاری در این محیط مرورگر فعال نیست؛ از اجرای محلی ویندوز یا HTTPS استفاده کن.');return}const pass=prompt('برای پشتیبان کامل رمزگذاری‌شده، گذرواژهٔ قوی با دست‌کم ۱۲ نویسه وارد کن. در صورت فراموشی، بازیابی غیرممکن است:');if(pass===null)return;if(!passwordOk(pass)){alert('گذرواژه باید ۱۲ تا ۲۵۶ نویسه داشته باشد.');return}const second=prompt('گذرواژه را برای تأیید دوباره وارد کن:');if(second!==pass){alert('دو گذرواژه یکسان نیستند.');return}try{const payload=await gather();const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));const iterations=260000;const key=await derive(pass,salt,iterations);const data=new TextEncoder().encode(JSON.stringify(payload));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);const envelope={format:PREFIX,version:1,kdf:'PBKDF2-SHA256',iterations,salt:toB64(salt),iv:toB64(iv),ciphertext:toB64(cipher),createdAt:isoNow()};downloadBlob(new Blob([JSON.stringify(envelope)],{type:'application/json;charset=utf-8'}),`madar-encrypted-backup-${today()}.json`);showToast('پشتیبان رمزگذاری‌شده دریافت شد؛ گذرواژه را جداگانه در جای امن نگه دار.')}catch(err){console.error(err);alert('پشتیبان رمزگذاری‌شده ساخته نشد: '+err.message)}}
const originalImportEncrypted=importBackup;
importBackup=async function(file){if(!file)return;let data;try{if(file.size>250*1024*1024)throw new Error('فایل بیش از ۲۵۰ مگابایت است.');data=JSON.parse(await file.text())}catch(err){alert('خواندن فایل پشتیبان ممکن نشد: '+err.message);return}
 if(data?.format!==PREFIX)return originalImportEncrypted(file);
 if(!crypto?.subtle){alert('رمزگشایی در این مرورگر در دسترس نیست.');return}
 if(data.version!==1||data.kdf!=='PBKDF2-SHA256'||data.iterations!==260000){alert('قالب پشتیبان رمزگذاری‌شده پشتیبانی نمی‌شود.');return}
 const pass=prompt('گذرواژهٔ پشتیبان رمزگذاری‌شده:');if(pass===null)return;
 try{const key=await derive(pass,fromB64(data.salt),data.iterations);const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},key,fromB64(data.ciphertext));const decoded=new Blob([raw],{type:'application/json'});return originalImportEncrypted(decoded)}catch(e){alert('رمزگشایی یا اعتبارسنجی فایل ناموفق بود؛ گذرواژه یا فایل صحیح نیست.')}};
const renderBeforeSecureBackup=render;
render=function(){renderBeforeSecureBackup();if(view!=='library')return;const root=document.querySelector('#page-root');if(!root)return;root.insertAdjacentHTML('beforeend',`<section class="card"><div class="card-title"><h3>پشتیبان کامل رمزگذاری‌شده</h3>${badge('اختیاری؛ روی دستگاه','green')}</div><p>پشتیبان شامل کارت‌ها، جلسات، ارتباط‌های علمی، یادداشت‌ها و فایل‌ها با گذرواژهٔ انتخابی تو رمزگذاری می‌شود. کلید یا گذرواژه به سرویس آنلاین ارسال نمی‌شود.</p><div class="form-actions"><button class="button button-primary" data-action="secure-export">دریافت پشتیبان رمزگذاری‌شده</button></div><div class="notice warning">گذرواژهٔ فراموش‌شده قابل بازیابی نیست. از یک گذرواژهٔ قوی و نگهداری امن استفاده کن؛ داده‌های خود مرورگر همچنان بدون رمزگذاری مستقل برنامه ذخیره می‌شوند.</div></section>`);};
document.addEventListener('click',e=>{const el=e.target.closest('[data-action="secure-export"]');if(el)exportEncrypted()},true);
})();
