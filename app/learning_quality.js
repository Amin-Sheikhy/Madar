'use strict';
/* MADAR: visible progress and conservative offline quality gate.
 * A lexical integrity check is NOT scientific evaluation of free-form reasoning.
 * Preserve all legacy assessments for audit; never silently rewrite or erase history. */
(function () {
  const QUALITY_ENGINE = 'input-integrity-v1';
  function words(text) {
    return (String(text || '').normalize('NFKC').toLowerCase().match(/[\p{L}]+/gu) || []).filter(Boolean);
  }
  function evaluateExplanation(text, longForm) {
    const raw = String(text || '').trim();
    const minLength = longForm ? 90 : 20;
    if (raw.length < minLength) return {ok:false, message:`توضیح باید دست‌کم ${minLength} نویسهٔ معنادار داشته باشد.`};
    const letters = words(raw);
    const letterCount = letters.join('').length;
    const nonSpaces = raw.replace(/\s/g, '');
    const digitCount = (raw.match(/[\p{N}]/gu) || []).length;
    if (digitCount > nonSpaces.length * .45) return {ok:false, message:'پاسخ بیشتر از عدد تشکیل شده است. چرایی و چگونگی را با جمله‌های خودت توضیح بده.'};
    if (/(.)\1{9,}/u.test(raw)) return {ok:false, message:'تکرار پشت سرهم یک نویسه، توضیح علمی محسوب نمی‌شود.'};
    if (letterCount < (longForm ? 48 : 12)) return {ok:false, message:'در پاسخ باید جمله‌های قابل خواندن با واژه‌های واقعی وجود داشته باشد.'};
    const unique = new Set(letters);
    if (unique.size < (longForm ? 10 : 3)) return {ok:false, message:'پاسخ بسیار تکراری است. یک توضیح مستقل و متنوع بنویس.'};
    const counts = new Map();
    letters.forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
    const most = Math.max(0, ...counts.values());
    if (letters.length > 6 && most / letters.length > .42) return {ok:false, message:'یک واژه بیش‌ازحد تکرار شده است. مفهوم را با زبان خودت توضیح بده.'};
    return {ok:true, message:'ساختار متن قابل قبول است؛ درستی علمی آن هنوز تأیید نشده است.'};
  }
  function logRejected(type, reason) {
    state.inputQualityRejects = Array.isArray(state.inputQualityRejects) ? state.inputQualityRejects : [];
    state.inputQualityRejects.push({type, reason, date:isoNow()});
    if (state.inputQualityRejects.length > 100) state.inputQualityRejects = state.inputQualityRejects.slice(-100);
    save();
  }
  function showInvalid(field, type, outcome) {
    field.setCustomValidity(outcome.message);
    field.reportValidity();
    logRejected(type, outcome.message);
    showToast('ارزیابی پذیرفته نشد: ' + outcome.message);
  }
  function progressData() {
    let total=0, registered=0, quality=0, legacy=0;
    for (const track of ['python','math']) {
      const lessons = COURSE[track]?.lessons || [];
      total += lessons.length;
      for (const l of lessons) {
        if (!(state.completed[track] || []).includes(l.id)) continue;
        registered++;
        const a=state.assessments?.[track+'|'+l.id];
        if (a?.scientificVerification === 'ai-reviewed' && a?.passed && a.total === 5) quality++;
        else legacy++;
      }
    }
    for (const s of state.subjects || []) {
      total += (s.lessons || []).length;
      for (const l of s.lessons || []) {
        if (!(state.subjectProgress[s.id] || []).includes(l.id)) continue;
        registered++;
        const d=state.subjectDrafts?.[s.id+'|'+l.id];
        if (d?.aiReviewStatus === 'passed' && d?.passed) quality++;
        else legacy++;
      }
    }
    return {total,registered,quality,legacy,pct:total?Math.round(registered*100/total):0};
  }
  function progressPanel() {
    const p=progressData();
    return `<section class="card quality-summary" aria-label="پیشرفت قابل‌ردیابی">
      <div class="card-title"><h3>پیشرفت یادگیری — قابل‌ردیابی</h3>${badge(p.pct+'٪ قبولی ثبت‌شده','green')}</div>
      <div class="quality-stats">
        <div><strong>${p.registered} / ${p.total}</strong><span>درس با قبولی ثبت‌شده</span></div>
        <div><strong>${p.quality}</strong><span>قبولی همراه با ارزیابی AI</span></div>
        <div><strong>${p.legacy}</strong><span>قبولی قدیمی؛ نیازمند بازسنجی</span></div>
      </div>${pctBar(p.pct)}
      <p class="small muted">${p.total?`این ${p.pct}٪ فقط سهم درس‌های دارای قبولی ثبت‌شده از ${p.total} درس موجود است؛ نه درصد تسلط علمی.`:'ابتدا درس یا علم جدید اضافه کن تا پیشرفت آن محاسبه شود.'} AI نیز ممکن است اشتباه کند؛ شواهد پژوهشی و آزمون انتقال و مرور همچنان لازم‌اند.</p>
    </section>`;
  }
  function quizFormCompletion(form) {
    let total=0, answered=0;
    if (form.dataset.form === 'assessment') {
      const {track,id}=activeLesson || {};
      total=COURSE[track]?.lessons.find(l=>l.id===id)?.qs.length || 5;
      for(let i=0;i<total;i++) if (form.querySelector(`input[name="q${i}"]:checked`)) answered++;
    } else {
      total=5;
      for(let i=0;i<5;i++) if (String(form.querySelector(`[name="a${i}"]`)?.value || '').trim()) answered++;
    }
    const e1=evaluateExplanation(form.elements.namedItem('causal')?.value || form.elements.namedItem('r0')?.value || '',false);
    const t=evaluateExplanation(form.elements.namedItem('teachBack')?.value || '',true);
    const pct=Math.round(answered*100/Math.max(total,1));
    return {total,answered,pct,reason:e1.ok,teaching:t.ok};
  }
  function updateQuizMeter() {
    const meter=document.getElementById('learning-live-meter');
    if(!meter)return;
    const form=document.querySelector('form[data-form="assessment"],form[data-form="v3-quiz"]');
    if(!form)return;
    const p=quizFormCompletion(form);
    meter.querySelector('[data-meter-pct]').textContent=p.pct+'٪';
    meter.querySelector('[data-meter-caption]').textContent=`${p.answered} پاسخ از ${p.total} سؤال وارد شده؛ نتیجهٔ علمی فقط بعد از ارزیابی مشخص می‌شود.`;
    meter.querySelector('[data-meter-fill]').style.width=p.pct+'%';
    meter.querySelector('[data-meter-reason]').textContent=p.reason?'توضیح اول از نظر ساختار قابل قبول است.':'توضیح مفهومی هنوز تکمیل نشده است.';
    meter.querySelector('[data-meter-teach]').textContent=p.teaching?'متن آموزش معکوس از نظر ساختار قابل قبول است.':'آموزش معکوس هنوز تکمیل نشده است.';
  }
  function injectQuizMeter(root) {
    const f=root.querySelector('form[data-form="assessment"],form[data-form="v3-quiz"]');
    if(!f)return;
    const wrapper=document.createElement('section');wrapper.id='learning-live-meter';wrapper.className='card quality-meter';
    wrapper.innerHTML=`<div class="card-title"><h3>پیشرفت پاسخ‌گویی همین آزمون</h3><strong data-meter-pct>۰٪</strong></div>
      <div class="progress-track"><div data-meter-fill class="progress-fill" style="width:0%"></div></div>
      <p class="small muted" data-meter-caption></p><div class="quality-meter-checks"><span data-meter-reason></span><span data-meter-teach></span></div>
      <div class="notice warning">این درصد، میزان تکمیل پاسخ‌های تستی است؛ «درصد یادگیری» یا «تسلط علمی» نیست.</div>`;
    f.insertAdjacentElement('beforebegin',wrapper);
    updateQuizMeter();
  }
  const renderPrevious=render;
  render=function () {
    renderPrevious();
    const root=document.getElementById('page-root'); if(!root)return;
    if(view==='dashboard' || view==='skills' || view==='sciences') root.insertAdjacentHTML('afterbegin',progressPanel());
    if(view==='lesson' || view==='subjectLesson') injectQuizMeter(root);
  };
  const lessonSubmitPrevious=submitAssessment;
  submitAssessment=function(form) {
    const causal=form.elements.namedItem('causal');
    const teachBack=form.elements.namedItem('teachBack');
    for(const [field,longForm] of [[causal,false],[teachBack,true]]) {
      if(!field)continue;
      const result=evaluateExplanation(field.value,longForm);
      if(!result.ok) {showInvalid(field,'builtin',result);return;}
    }
    const {track,id}=activeLesson || {};
    lessonSubmitPrevious(form);
    const a=state.assessments?.[track+'|'+id];
    if(a && a.total===5 && a.passed) {
      a.inputQuality=QUALITY_ENGINE;
      a.scientificVerification='not-verified';
      const session=state.sessions?.at(-1);
      if(session?.track===track && session.lessonId===id)session.inputQuality=QUALITY_ENGINE;
      save();render();
    }
  };
  // A capturing listener on window runs before the pre-existing custom-quiz listener on document.
  window.addEventListener('submit', e => {
    const form=e.target.closest?.('form[data-form="v3-quiz"]');if(!form||window.MADAR_AI_ASSESSMENT_MODE)return;
    const fields=[];
    for(let i=0;i<5;i++) fields.push([form.elements.namedItem('r'+i),false]);
    fields.push([form.elements.namedItem('teachBack'),true]);
    for(const [field,longForm] of fields) {
      if(!field)continue;
      const outcome=evaluateExplanation(field.value,longForm);
      if(!outcome.ok) {
        e.preventDefault();e.stopImmediatePropagation();showInvalid(field,'custom',outcome);return;
      }
    }
    const key=String(form.dataset.key || '');
    if(key && key.includes('|')) {
      state.subjectDrafts=state.subjectDrafts || {};
      state.subjectDrafts[key]={...(state.subjectDrafts[key]||{}),inputQuality:QUALITY_ENGINE,scientificVerification:'not-verified'};
      save();
    }
  },true);
  document.addEventListener('input',e=>{
    if(!e.target.closest?.('form[data-form="assessment"],form[data-form="v3-quiz"]'))return;
    e.target.setCustomValidity?.('');updateQuizMeter();
  });
  document.addEventListener('change',e=>{
    if(e.target.closest?.('form[data-form="assessment"],form[data-form="v3-quiz"]'))updateQuizMeter();
  });
  // Export the pure validator only to the project's isolated automated tests.
  window.MADAR_QUALITY_TEST = {evaluateExplanation,progressData};
  render();
})();
