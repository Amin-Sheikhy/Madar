'use strict';
/* Madar v4.32 — no scientific credit offline. Offline writing is allowed.
   A local server + configured model is required for assessment. Model verdicts
   are tied to the exact saved answers and cannot approve modified drafts. */
(function(){
  window.MADAR_AI_ASSESSMENT_MODE=true;
  const ENGINE='ai-assessment-v1';
  state.aiAssessmentQueue=state.aiAssessmentQueue&&typeof state.aiAssessmentQueue==='object'?state.aiAssessmentQueue:{};
  let readiness={ready:false,server:false,message:'در انتظار بررسی اتصال',provider:'openai'};
  let busy=false,checking=false,lastReady=false,lastFailedAt=0,autoCount=0,limitAuto=12,lastAutoDay='';
  function recordKey(kind,parts){return kind==='builtin'?parts.track+'|'+parts.id:parts.subjectId+'|'+parts.id;}
  function profile(){const p=(state.aiProfiles||[]).find(p=>p.id===state.activeAIProfile);const brand={gemini:'google',local:'ollama'}[p?.brand]||p?.brand||'openai';return {provider:brand,model:String(p?.model||''),profileId:p?.id||'openai'};}
  function keyOfCurrent(){if(view==='lesson'){const a=activeLesson||state.lastPlace;return recordKey('builtin',{track:a?.track,id:a?.id});}
    if(view==='subjectLesson'){const b=window.MADAR_BRIDGE;const s=b?.selectedSubject?.(),l=b?.activeCustomLesson?.();return s&&l?recordKey('custom',{subjectId:s.id,id:l.id}):null;}return null;}
  function completedSnapshot(r){if(!r||!Array.isArray(r.items)||r.items.length!==5)return false;
    if(r.items.some(x=>!String(x.answer||'').trim()))return false;
    if(!String(r.explanation||'').trim()||!String(r.teachBack||'').trim())return false;
    if(r.mode==='custom'&&r.items.some(x=>!String(x.reason||'').trim()))return false;
    return true;
  }
  function makeRecord({key,mode,track,subjectId,lessonId,subject,lessonTitle,concept,example,items,explanation,teachBack,objectiveScore}){
    const snapshot={mode,concept:String(concept||'').slice(0,3500),example:String(example||'').slice(0,2400),
      items:items.map(x=>({question:String(x.question||'').slice(0,500),expected:String(x.expected||'').slice(0,600),answer:String(x.answer||'').slice(0,1200),reason:String(x.reason||'').slice(0,1900)})),
      explanation:String(explanation||'').slice(0,5000),teachBack:String(teachBack||'').slice(0,6000)};
    const prev=state.aiAssessmentQueue[key];
    const unchanged=prev&&JSON.stringify(prev.snapshot)===JSON.stringify(snapshot);
    const status=completedSnapshot(snapshot)?'pending':'awaiting-answers';
    return {key,mode,track,subjectId,lessonId,subject,lessonTitle,objectiveScore, snapshot,updatedAt:isoNow(),
      status:unchanged&&prev.status==='passed'?'passed':status,
      attempts:unchanged?Number(prev.attempts)||0:0,feedback:unchanged?prev.feedback:'',
      result:unchanged?prev.result:null,sessionId:unchanged?prev.sessionId:null};
  }
  function saveBuiltin(form){
    const a=activeLesson||state.lastPlace,l=COURSE[a.track]?.lessons.find(v=>v.id===a.id);if(!l)return;
    const fd=new FormData(form),answers=l.qs.map((q,j)=>fd.get('q'+j));
    const key=recordKey('builtin',{track:a.track,id:a.id}),old=state.aiAssessmentQueue[key];
    const minutes=Number(fd.get('minutes'));
    if(!Number.isInteger(minutes)||minutes<1||minutes>180){showToast('مدت جلسه باید بین ۱ تا ۱۸۰ دقیقه باشد.');return;}
    if(a.track==='python'&&!old?.sessionId&&dayMinutes('python')+minutes>60){showToast('سقف مطالعهٔ ثبت‌شدهٔ پایتون: ۶۰ دقیقه در روز.');return;}
    const causal=String(fd.get('causal')||''),teachBack=String(fd.get('teachBack')||'');
    const items=l.qs.map((q,j)=>({question:q[0],expected:q[1][q[2]],answer:answers[j]===null?'':q[1][Number(answers[j])]||'',reason:''}));
    const correct=answers.reduce((n,x,i)=>n+(x!==null&&Number(x)===l.qs[i][2]?1:0),0);
    let record=makeRecord({key,mode:'builtin',track:a.track,lessonId:a.id,subject:COURSE[a.track].name,lessonTitle:l.title,
      concept:l.concept,example:l.example,items,explanation:causal,teachBack,objectiveScore:correct});
    if(old?.sessionId)record.sessionId=old.sessionId;
    if(!record.sessionId){let sess={id:uid(),timestamp:isoNow(),date:today(),track:a.track,lessonId:a.id,kind:'ثبت آزمون؛ در انتظار سنجش AI',minutes,score:correct,totalQuestions:5,passed:false,note:'توضیحات آفلاین ذخیره شد؛ هنوز امتیاز علمی ندارد.',causal,teachBack};state.sessions.push(sess);record.sessionId=sess.id;}
    else {const sess=state.sessions.find(s=>s.id===record.sessionId);if(sess){Object.assign(sess,{score:correct,totalQuestions:5,passed:false,causal,teachBack,note:'در انتظار سنجش AI'});}}
    state.lessonDrafts[key]={...(state.lessonDrafts[key]||{}),minutes,causal,teachBack,sessionNote:String(fd.get('sessionNote')||''),...Object.fromEntries(answers.map((x,i)=>['q'+i,x===null?'':x]))};
    // Do not overwrite legacy passes; status of this attempt is tracked separately.
    state.aiAssessmentQueue[key]=record;
    save();render();showToast('پاسخ‌ها ذخیره شدند؛ هیچ امتیاز تشریحی آفلاین ثبت نشده است.');
    if(readiness.ready&&record.status==='pending')void evaluate(key,false);
  }
  function saveCustom(form){
    const b=window.MADAR_BRIDGE,s=b?.selectedSubject?.(),l=b?.activeCustomLesson?.();if(!s||!l||!Array.isArray(l.quiz)||l.quiz.length!==5)return;
    const fd=new FormData(form),key=recordKey('custom',{subjectId:s.id,id:l.id});
    const old=state.aiAssessmentQueue[key],minutes=Number(fd.get('minutes'));
    if(!Number.isInteger(minutes)||minutes<1||minutes>180){showToast('زمان مطالعه باید معتبر باشد.');return;}
    const draft={...(state.subjectDrafts[key]||{}),minutes,teachBack:String(fd.get('teachBack')||'')};
    const items=l.quiz.map((q,i)=>{const answer=String(fd.get('a'+i)||'').trim(),reason=String(fd.get('r'+i)||'');draft['a'+i]=answer;draft['r'+i]=reason;return {question:q.q,expected:q.answer,answer,reason};});
    const correct=items.reduce((n,item,i)=>n+(norm(item.answer)===norm(l.quiz[i].answer)?1:0),0);
    const record=makeRecord({key,mode:'custom',subjectId:s.id,lessonId:l.id,subject:s.title,lessonTitle:l.title,
      concept:l.concept,example:l.example,items,explanation:items.map((x,i)=>`سؤال ${i+1}: ${x.reason}`).join('\n'),teachBack:draft.teachBack,objectiveScore:correct});
    if(old?.sessionId)record.sessionId=old.sessionId;
    if(!record.sessionId){const sess={id:uid(),track:'science',subjectId:s.id,lessonId:l.id,kind:'پیش‌نویس آزمون؛ منتظر AI',title:s.title+' — '+l.title,
      minutes,timestamp:isoNow(),date:today(),score:null,passed:false,note:'بدون سنجش علمی'};state.sessions.push(sess);record.sessionId=sess.id;}
    draft.passed=false;draft.aiReviewStatus=record.status;draft.feedback='پاسخ‌ها ذخیره شدند و منتظر ارزیابی علمی AI هستند.';
    state.subjectDrafts[key]=draft;state.aiAssessmentQueue[key]=record;save();render();showToast('پاسخ‌ها و توضیحات ذخیره شدند؛ هنوز قبولی علمی ثبت نشده است.');
    if(readiness.ready&&record.status==='pending')void evaluate(key,false);
  }
  // Replaces unsafe legacy submit which immediately grants passing credit.
  submitAssessment=saveBuiltin;
  // Capture custom submissions before the older document-level self-grading handlers.
  window.addEventListener('submit',e=>{
    const f=e.target.closest?.('form[data-form="v3-quiz"]');if(!f)return;
    e.preventDefault();e.stopImmediatePropagation();saveCustom(f);
  },true);
  function badStatus(r){return r?.status==='awaiting-answers'?'توضیح‌ها هنوز کامل نشده‌اند':r?.status==='pending'?'ذخیره‌شده و در صف سنجش AI':r?.status==='evaluating'?'در حال ارزیابی':r?.status==='passed'?'تأیید اولیه با AI':r?.status==='revision-needed'?'نیازمند اصلاح علمی':r?.status==='error'?'اتصال یا پاسخ AI ناموفق':'هنوز ارزیابی ثبت نشده';}
  function headerStatus(){const entries=Object.values(state.aiAssessmentQueue),pending=entries.filter(x=>x.status!=='passed').length;
    return `<section class="card ai-assessment-status"><div class="card-title"><h3>ارزیابی علمی با هوش مصنوعی</h3>${badge(readiness.ready?'AI آمادهٔ درخواست':'سنجش غیرفعال',readiness.ready?'green':'amber')}</div>
      <p class="small muted">${cleanText(readiness.message)} · ${pending} درس نیازمند تکمیل یا بررسی علمی است. متن‌ها در حالت آفلاین نوشته و ذخیره می‌شوند، ولی نمرهٔ علمی ندارند.</p>
      <div class="form-actions"><button type="button" class="button button-outline button-sm" data-ai-assess="connection">بررسی اتصال</button><button type="button" class="button button-primary button-sm" data-ai-assess="queue" ${!readiness.ready||busy?'disabled':''}>سنجش پاسخ‌های ذخیره‌شده</button></div></section>`;
  }
  function decorateForm(root){const form=root.querySelector('form[data-form="assessment"],form[data-form="v3-quiz"]');if(!form)return;
    for(const field of form.querySelectorAll('textarea[name="causal"], textarea[name="teachBack"], textarea[name^="r"]')){
      field.removeAttribute('required');field.removeAttribute('minlength');field.setCustomValidity?.('');
    }
    const selfCheck=form.querySelector('input[name="reviewed"],input[name="verifiedReasoning"]');
    if(selfCheck){selfCheck.removeAttribute('required');selfCheck.closest('label')?.remove();}
    for(const el of form.querySelectorAll('.notice.warning, .counter')){
      if(el.textContent.includes('تسلط مفهومی توضیح آزاد')||el.textContent.includes('متن آزاد خودکار')||el.textContent.includes('توضیح، فرصت بازاندیشی'))
        el.textContent='توضیحات در حالت آفلاین ذخیره می‌شوند و امتیاز نمی‌گیرند. با اتصال واقعی AI سنجش آن‌ها اجباری است.';
    }
    const k=keyOfCurrent(),q=state.aiAssessmentQueue[k];
    const node=document.createElement('div');node.className='notice ai-assessment-notice';
    node.innerHTML=`<strong>وضعیت: ${cleanText(badStatus(q))}</strong><p class="small muted">می‌توانی همین حالا با قلم یا صفحه‌کلید توضیحات را بنویسی. هیچ متن تشریحی بدون AI قبول نمی‌شود. برای بازشدن مرحلهٔ بعد، همهٔ پنج سؤال و آموزش معکوس باید با موفقیت ارزیابی شوند.</p>`+
      (q?.feedback?`<p class="small">${cleanText(q.feedback)}</p>`:'')+
      `<div class="form-actions"><button type="button" class="button button-outline button-sm" data-ai-assess="save">ذخیرهٔ پاسخ‌ها</button><button type="button" class="button button-primary button-sm" data-ai-assess="evaluate" ${!readiness.ready?'disabled':''}>ثبت و سنجش با AI</button></div>`;
    form.appendChild(node);
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent='ذخیرهٔ آزمون و قرارگیری در صف سنجش';
    const meter=root.querySelector('#learning-live-meter');if(meter){const checks=meter.querySelector('.quality-meter-checks');if(checks)checks.title='ساختار متن، ارزیابی علمی نیست. نمره فقط با AI ثبت می‌شود.';}
  }
  const previousRender=render;
  render=function(){previousRender();const root=document.getElementById('page-root');if(!root)return;
    if(['dashboard','skills','python','math','sciences','subject','lesson','subjectLesson'].includes(view))root.insertAdjacentHTML('afterbegin',headerStatus());
    if(view==='lesson'||view==='subjectLesson')decorateForm(root);
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-ai-assess]');if(!b)return;e.preventDefault();
    if(b.dataset.aiAssess==='connection'){void checkHealth(true);return;}
    if(b.dataset.aiAssess==='queue'){void flushQueue(false);return;}
    if(b.dataset.aiAssess==='save'||b.dataset.aiAssess==='evaluate'){
      const f=b.closest('form');if(!f)return;const custom=f.dataset.form==='v3-quiz';custom?saveCustom(f):saveBuiltin(f);
    }
  });
  // Save changed free text while offline too; queued snapshots are only refreshed on explicit save.
  function appendResult(r,result){
    const matched=JSON.stringify(state.aiAssessmentQueue[r.key]?.snapshot)===JSON.stringify(r.snapshot);
    if(!matched)return false; // edits made in flight cannot acquire an old passing grade.
    const didPass=!!result.passed&&(r.mode!=='builtin'||r.objectiveScore===5);
    const rec=state.aiAssessmentQueue[r.key];rec.result=result;rec.feedback=String(result.feedback||'');rec.status=didPass?'passed':'revision-needed';
    rec.attribution=result._provenance||null;rec.reviewedAt=isoNow();
    const session=state.sessions.find(x=>x.id===rec.sessionId);if(session){session.passed=didPass;session.aiAssessment=result;session.note=rec.feedback;}
    if(r.mode==='builtin'){
      const a=state.assessments[r.key]||{};
      state.assessments[r.key]={...a,answers:r.snapshot.items.map((x,i)=>COURSE[r.track].lessons.find(l=>l.id===r.lessonId).qs[i][1].indexOf(x.answer)),
        causal:r.snapshot.explanation,teachBack:r.snapshot.teachBack,score:r.objectiveScore,total:5,passed:didPass,
        scientificVerification:didPass?'ai-reviewed':'ai-needs-revision',aiAttribution:result._provenance||null,date:isoNow()};
      if(didPass){state.completed[r.track]=state.completed[r.track]||[];
        if(!state.completed[r.track].includes(r.lessonId))state.completed[r.track].push(r.lessonId);
        const lessons=COURSE[r.track].lessons,idx=lessons.findIndex(l=>l.id===r.lessonId),lesson=lessons[idx];
        if(idx>=0&&idx<lessons.length-1)state.lastPlace={track:r.track,id:lessons[idx+1].id};
        for(const q of lesson.qs){state.flashcards=state.flashcards||[];
          if(state.flashcards.some(c=>c.sourceLessonKey===r.key&&c.front===q[0]))continue;
          state.flashcards.push({id:uid(),front:q[0],back:q[1][q[2]]+' — '+q[3],topic:COURSE[r.track].name+' · '+lesson.title,
            sourceLessonKey:r.key,origin:'پس از ارزیابی AI',box:1,dueAt:today(),createdAt:isoNow(),history:[]});
        }
      }
    } else {
      const draft=state.subjectDrafts[r.key]||{};draft.passed=didPass;draft.aiReviewStatus=rec.status;draft.aiAttribution=rec.attribution;
      draft.feedback=rec.feedback;draft.results=Array.isArray(result.criteria)?result.criteria.map(x=>({ok:x.status==='correct',message:x.reason})):[];
      state.subjectDrafts[r.key]=draft;
      if(didPass){state.subjectProgress[r.subjectId]=state.subjectProgress[r.subjectId]||[];
        if(!state.subjectProgress[r.subjectId].includes(r.lessonId))state.subjectProgress[r.subjectId].push(r.lessonId);
        const s=(state.subjects||[]).find(x=>x.id===r.subjectId),l=s?.lessons.find(x=>x.id===r.lessonId);
        if(s&&l){state.flashcards=state.flashcards||[];
          const available=(l.cards||[]).filter(c=>c.front&&c.back).slice(0,15);
          const cards=available.length?available:[{front:'«'+l.title+'» را با چرایی و چگونگی توضیح بده.',back:String(l.concept||'').slice(0,450)},{front:'برای «'+l.title+'» یک مثال تازه بساز.',back:String(l.example||'').slice(0,450)}];
          for(const c of cards){
            if(state.flashcards.some(x=>x.lessonRef===l.id&&x.front===c.front))continue;
            state.flashcards.push({id:uid(),lessonRef:l.id,subjectRef:s.id,front:c.front,back:c.back,topic:s.title+' · '+l.title,
              aiAttribution:l.aiAttribution||null,box:1,dueAt:today(),createdAt:isoNow(),history:[]});
          }
        }
      }
    }
    save();render();return true;
  }
  async function evaluate(key,auto){
    const rec=state.aiAssessmentQueue[key];if(!rec||rec.status==='passed')return;
    if(!completedSnapshot(rec.snapshot)){rec.status='awaiting-answers';save();render();if(!auto)showToast('برای سنجش با AI ابتدا همهٔ پاسخ‌های تشریحی و آموزش معکوس را تکمیل کن.');return;}
    if(!readiness.ready){if(!auto)showToast('در حال حاضر مدل AI آمادهٔ درخواست نیست. توضیح‌ها محفوظ مانده‌اند.');return;}
    if(busy)return;
    busy=true;rec.status='evaluating';rec.attempts=(rec.attempts||0)+1;save();render();
    const saved=JSON.parse(JSON.stringify(rec)),p=profile();
    try{
      const r=await fetch('/api/assessment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        subject:saved.subject,lessonTitle:saved.lessonTitle,providerId:p.provider,model:p.model,profileId:p.profileId,
        assessment:saved.snapshot
      })});
      let obj;try{obj=await r.json();}catch{throw Error('پاسخ JSON معتبر دریافت نشد.');}
      if(!r.ok)throw Error(obj.error||'خطای سرور '+r.status);
      if(!Array.isArray(obj.criteria)||obj.criteria.length!==5||typeof obj.passed!=='boolean')throw Error('قالب پاسخ AI نامعتبر است.');
      const ok=appendResult(saved,obj);
      if(ok)showToast(obj.passed?'ارزیابی AI ثبت شد؛ مرحلهٔ بعد باز شد.':'بازخورد AI ثبت شد؛ توضیحات یا پاسخ‌ها نیازمند اصلاح‌اند.');
      else showToast('پاسخ‌ها حین ارزیابی تغییر کردند؛ نتیجهٔ قدیمی کنار گذاشته شد.');
    }catch(e){lastFailedAt=Date.now();const cur=state.aiAssessmentQueue[key];if(cur&&JSON.stringify(cur.snapshot)===JSON.stringify(saved.snapshot)){
        cur.status='error';cur.feedback='ارزیابی انجام نشد: '+e.message;save();render();}
      if(!auto)showToast('اتصال AI ناموفق: '+e.message);
    }finally{busy=false;render();}
  }
  async function flushQueue(auto){if(busy||!readiness.ready)return;
    const list=Object.values(state.aiAssessmentQueue).filter(r=>['pending','error','evaluating'].includes(r.status)&&completedSnapshot(r.snapshot));
    const n=auto?Math.min(limitAuto-autoCount,list.length):list.length;
    for(let i=0;i<n;i++){
      if(!readiness.ready)break;
      if(auto&&autoCount>=limitAuto)break;
      if(auto)autoCount++;
      await evaluate(list[i].key,auto);
      if(lastFailedAt&&Date.now()-lastFailedAt<30000)break;
    }
  }
  function refreshConnectionView(){
    const root=document.getElementById('page-root');if(!root)return;
    for(const panel of root.querySelectorAll('.ai-assessment-status')){
      const p=panel.querySelector('p.small');if(p){const n=Object.values(state.aiAssessmentQueue).filter(x=>x.status!=='passed').length;
        p.textContent=readiness.message+' · '+n+' درس در انتظار تکمیل یا سنجش علمی؛ پاسخ‌های ذخیره‌شده آفلاین امتیاز نمی‌گیرند.';}
      const badgeEl=panel.querySelector('.badge');if(badgeEl)badgeEl.textContent=readiness.ready?'AI آمادهٔ درخواست':'سنجش غیرفعال';
    }
    for(const btn of root.querySelectorAll('[data-ai-assess="queue"],[data-ai-assess="evaluate"]'))btn.disabled=!readiness.ready||busy;
  }
  async function checkHealth(manual=false){if(checking)return;checking=true;
    try{
      if(location.protocol==='file:')throw Error('نسخهٔ مستقل HTML به سرور AI وصل نیست.');
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);
      let r;try{r=await fetch('/api/health',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}
      if(!r.ok)throw Error('سرور مَدار در دسترس نیست.');
      const data=await r.json();if(data.applicationId!=='madar-local')throw Error('سرور شناسایی نشد.');
      const p=profile(),configured=data.configuredProviders?.[p.provider];
      const day=new Date().toISOString().slice(0,10),isNewDay=day!==lastAutoDay;
      if(isNewDay){lastAutoDay=day;autoCount=0;}
      limitAuto=Math.max(0,(Number(data.dailyRequestLimit)||12)-(Number(data.requestsUsed)||0));
      const ready=!!configured || (!!data.providerKeys?.[p.provider]&&!!p.model) || (p.provider==='ollama'&&!!p.model);
      readiness={server:true,ready,message:ready?'مدل برای درخواست تنظیم شده است؛ تأیید اتصال واقعی با اولین ارزیابی انجام می‌شود.':'سرور فعال است اما مدل یا کلید این ارائه‌دهنده تنظیم نشده است.',provider:p.provider};
      if(ready&&(!lastReady||isNewDay)){lastFailedAt=0;queueMicrotask(()=>void flushQueue(true));}
      lastReady=ready;
    }catch(e){readiness={ready:false,server:false,message:e.message,provider:profile().provider};lastReady=false;}
    finally{checking=false;if(manual)showToast(readiness.message);refreshConnectionView();}
  }
  window.addEventListener('online',()=>void checkHealth());
  // Poll only the local health endpoint; the queue is auto-drained at a connectivity transition.
  setInterval(()=>void checkHealth(),45000);
  window.MADAR_AI_ASSESSMENT_TEST={completedSnapshot,makeRecord,validateResponse:result=>!!(result?.passed&&result?.criteria?.length===5)};
  render();void checkHealth();
})();
