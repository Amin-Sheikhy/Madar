/* Madar v4.51: simple first, specialist tools in one collapsible drawer. */
(function(){
 'use strict';
 const nav=document.querySelector('.side-nav');if(!nav)return;
 nav.classList.add('madar-compact-nav','madar-nav-v450');
 const quick=document.createElement('div');quick.className='madar-nav-quick';
 const more=document.createElement('details');more.className='madar-nav-section madar-more';
 more.innerHTML='<summary>⚙ سایر بخش‌ها و تنظیمات <span class="madar-chevron">⌄</span></summary><div class="madar-nav-items"></div>';
 nav.prepend(quick);nav.append(more);
 const extra=more.querySelector('.madar-nav-items');
 const direct=new Set(['dashboard','python','math','review']);
 const labels={dashboard:'خانه',python:'آموزش پایتون',math:'آموزش ریاضی',review:'مرور و تمرین',vault:'کتابخانه پیشرفته',workspace:'تنظیمات پیشرفته'};
 const relocate=()=>{
   for(const b of Array.from(nav.children).filter(el=>el.matches('button.nav-item'))){
     const name=b.dataset.nav;
     if(labels[name]){const ico=b.querySelector('.nav-ico')?.outerHTML||'';b.innerHTML=ico+' '+labels[name]}
     (direct.has(name)?quick:extra).append(b);
   }
   if(extra.querySelector('.nav-item.active'))more.open=true;
 };
 relocate();
 const select=document.createElement('button');select.type='button';select.className='nav-item madar-pdf-nav';select.dataset.madarPdfSelect='1';select.innerHTML='<span class="nav-ico">📖</span> انتخاب کتاب PDF';
 quick.insertBefore(select,quick.querySelector('[data-nav="python"]'));
 const library=document.createElement('button');library.type='button';library.className='nav-item';library.dataset.madarPdfLibrary='1';library.innerHTML='<span class="nav-ico">▣</span> کتاب‌های من';
 quick.insertBefore(library,quick.querySelector('[data-nav="python"]'));
 const ai=document.createElement('button');ai.type='button';ai.className='nav-item madar-ai-shortcut';ai.innerHTML='<span class="nav-ico">✧</span> هوش مصنوعی (پیشرفته)';
 ai.addEventListener('click',()=>{document.querySelector('[data-ai-pdf-nav],[data-aiPdfNav],[data-nav="vault"]')?.click();
   setTimeout(()=>document.querySelector('#vault-ai-reader')?.scrollIntoView({behavior:'smooth',block:'start'}),200)});
 extra.append(ai);
 const ob=new MutationObserver(()=>{if(Array.from(nav.children).some(el=>el.matches('button.nav-item')))relocate()});
 ob.observe(nav,{childList:true});
 // Configuration remains available without occupying the top bar.
 const topBackup=document.querySelector('.top-backup');if(topBackup)topBackup.hidden=true;
 const topSettings=document.querySelector('.quick-settings');if(topSettings)topSettings.hidden=true;
 const build=document.querySelector('.build-inline');if(build){build.title=build.textContent.trim();build.textContent='v4.51'};
 // Preserve old dashboard completely, but collapse details by default.
 const startActions=`<section class="madar-fast-start" aria-label="شروع سریع"><div class="madar-fast-header"><h2>چه کاری می‌خواهید انجام دهید؟</h2><p>برای خواندن PDF فقط فایل را انتخاب کنید.</p></div>
 <div class="madar-fast-grid"><button type="button" data-madar-pdf-select="1"><span>📖</span><b>انتخاب PDF و خواندن</b></button>
 <button type="button" data-madar-pdf-library="1"><span>▣</span><b>کتاب‌های من</b></button>
 <button type="button" data-nav="python"><span>⌘</span><b>آموزش</b></button>
 <button type="button" data-nav="review"><span>◷</span><b>مرور</b></button></div></section>`;
 if(typeof render==='function'){
  const prev=render;
  render=function(){
    prev();
    relocate();
    const root=document.querySelector('#page-root');
    if(view==='dashboard' && root && !root.querySelector('.madar-dashboard-extended')){
      const section=document.createElement('details');section.className='madar-dashboard-extended';
      section.innerHTML='<summary>نمایش داشبورد کامل، برنامه‌ها و ابزارهای تخصصی</summary><div class="madar-dash-old"></div>';
      const contents=section.querySelector('.madar-dash-old');
      while(root.firstChild)contents.append(root.firstChild);
      root.insertAdjacentHTML('afterbegin',startActions);
      root.append(section);
    }
    if(view==='vault'&&window.MadarChatGPT)window.MadarChatGPT.render();
  };
  render();
 }
 const footer=document.querySelector('.sidebar-footer');
 if(footer&&!footer.querySelector('.madar-side-details')){
   const d=document.createElement('details');d.className='madar-side-details';
   const summary=document.createElement('summary');summary.textContent='پشتیبان و ابزارهای نگهداری';
   while(footer.firstChild)d.appendChild(footer.firstChild);
   d.prepend(summary);footer.append(d);
 }
})();
