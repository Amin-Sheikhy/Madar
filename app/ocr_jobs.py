"""Local, resumable full-book Persian OCR for Madar.

No network or AI service, only an explicitly imported file in Madar's vault.
Atomic per-page checkpoints keep interrupted scans recoverable. The output is
UNVERIFIED OCR text, not approved teaching material.
"""
from __future__ import annotations
import hashlib, io, json, os, re, subprocess, threading, time
from datetime import datetime, timezone
from pathlib import Path

import vault_server as vault
from pdf_quality import analyze, add_vendor_path, render_pdf_page, find_tesseract, TESSDATA_DIR

JOBS_DIR = vault.DATA_ROOT / 'ocr_jobs'
MAX_PAGES = 1500
MAX_CONCURRENT = 1
_lock = threading.RLock()
_workers: dict[str, threading.Thread] = {}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _dir(fid):
    return JOBS_DIR / vault.check_id(fid)


def _meta_path(fid):
    return _dir(fid) / 'job.json'


def _safe_load(fid):
    p = _meta_path(fid)
    if not p.is_file():
        return None
    obj = json.loads(p.read_text('utf-8'))
    # Never read cached text from a different version of a source.
    if obj.get('fileId') != fid:
        raise RuntimeError('ناهماهنگی شناسهٔ منبع OCR')
    return obj


def _atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.writing')
    with open(temp,'w',encoding='utf-8') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp,path)


def _save(info):
    info['updatedAt'] = _now()
    _atomic_write(_meta_path(info['fileId']),json.dumps(info,ensure_ascii=False,indent=2))


def _public(obj):
    if not obj:
        return {'status':'not_started'}
    x = {k:v for k,v in obj.items() if k not in ('originalPath',)}
    x['percent'] = round(100*x.get('processed',0)/max(1,x.get('pageCount',1)),1)
    return x


def get_status(fid):
    fid = vault.check_id(fid)
    meta = vault.get_file(fid)
    with _lock:
        obj=_safe_load(fid)
        if obj and obj.get('sourceSha256')!=meta['sha256']:
            return {'status':'stale_source','message':'نسخهٔ فایل تغییر کرده است؛ کش قبلی معتبر نیست.'}
        return _public(obj)


def _count_pages(raw):
    add_vendor_path()
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(raw)
        n=len(pdf)
        pdf.close()
    except (ImportError, OSError):
        from pypdf import PdfReader
        n=len(PdfReader(io.BytesIO(raw),strict=False).pages)
    if not 1<=n<=MAX_PAGES:
        raise ValueError('فایل PDF باید بین ۱ تا ۱۵۰۰ صفحه داشته باشد؛ این فایل نیازمند بررسی جداگانه است.')
    return n


def _existing_count(fid,n):
    count=0
    for i in range(n):
        if (_dir(fid)/f'page_{i+1:05d}.txt').is_file():
            count+=1
    return count


def start(fid,language='fas+eng'):
    if language not in ('fas','fas+eng','eng'):
        raise ValueError('زبان OCR نامعتبر است.')
    meta,raw=vault.file_bytes(fid)
    if Path(meta['name']).suffix.lower()!='.pdf':
        raise ValueError('OCR کامل فقط برای PDF فعال است.')
    if not find_tesseract():
        raise RuntimeError('موتور OCR فارسی روی ویندوز موجود نیست؛ ارتقای OCR را بررسی کن. فایل اصلی محفوظ است.')
    add_vendor_path()
    try:
        import pypdfium2
    except (ImportError,OSError) as e:
        try:
            import fitz
        except ImportError:
            raise RuntimeError('موتور نمایش صفحات PDF موجود نیست.') from e
    n=_count_pages(raw)
    with _lock:
        active=[t for t in _workers.values() if t.is_alive()]
        previous=_safe_load(fid)
        if active and not (fid in _workers and _workers[fid].is_alive()):
            raise RuntimeError('یک کتاب دیگر در حال پردازش است؛ برای جلوگیری از فشار بیش‌ازحد، پردازش‌ها به‌ترتیب انجام می‌شوند.')
        if previous and previous.get('sourceSha256') != meta['sha256']:
            raise RuntimeError('منبع OCR تغییر کرده است؛ تا زمانی که بررسی نشده، نتایج قبلی جایگزین نمی‌شوند.')
        if previous and previous.get('status')=='completed':
            return _public(previous)
        if fid in _workers and _workers[fid].is_alive():
            return _public(previous)
        info=previous or {'fileId':fid,'name':meta['name'],'sourceSha256':meta['sha256'],
                          'createdAt':_now(),'pageCount':n,'processed':0,'failedPages':[],
                          'language':language,'status':'queued','verifiedAsTeachingContent':False}
        info.update(pageCount=n,processed=_existing_count(fid,n),status='queued',pauseRequested=False,
                    error='',language=language)
        _save(info)
        t=threading.Thread(target=_run,args=(fid,),name='Madar-OCR-'+fid[:8],daemon=True)
        _workers[fid]=t
        t.start()
        return _public(info)


def pause(fid):
    fid=vault.check_id(fid)
    with _lock:
        item=_safe_load(fid)
        if not item:
            raise ValueError('برای این فایل پردازشی آغاز نشده است.')
        item['pauseRequested']=True
        _save(item)
        return _public(item)


def _ocr_one(raw,page_num,language,engine):
    png=render_pdf_page(raw,page_num)
    flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
    cmd=[engine,'stdin','stdout','--tessdata-dir',str(TESSDATA_DIR),'-l',language,'--oem','1','--psm','3']
    p=subprocess.run(cmd,input=png,capture_output=True,check=False,timeout=75,creationflags=flags)
    if p.returncode:
        raise RuntimeError('Tesseract: '+p.stderr.decode('utf-8','replace')[:240])
    return p.stdout.decode('utf-8','replace').strip()


def _run(fid):
    try:
        meta,raw=vault.file_bytes(fid)
        engine=find_tesseract()
        if not engine:
            raise RuntimeError('موتور OCR هنگام شروع در دسترس نیست.')
        with _lock:
            info=_safe_load(fid)
            info['status']='running'
            _save(info)
        n=info['pageCount']
        for page in range(1,n+1):
            with _lock:
                current=_safe_load(fid)
                if current.get('pauseRequested'):
                    current['status']='paused';_save(current)
                    return
                if vault.get_file(fid)['sha256']!=info['sourceSha256']:
                    raise RuntimeError('صحت منبع تغییر کرده است؛ پردازش متوقف شد.')
            target=_dir(fid)/f'page_{page:05d}.txt'
            was_present=target.is_file()
            if not was_present:
                text=_ocr_one(raw,page-1,info['language'],engine)
                _atomic_write(target,text)
            with _lock:
                current=_safe_load(fid)
                if not was_present:
                    current['processed']=min(n,current.get('processed',0)+1)
                current['currentPage']=page
                current['status']='running'
                _save(current)
        # End only when every page file exists; none of the output is "scientifically validated".
        with _lock:
            current=_safe_load(fid)
            current['processed']=_existing_count(fid,n)
            current['status']='completed' if current['processed']==n else 'incomplete'
            current['completedAt']=_now() if current['status']=='completed' else None
            _save(current)
    except Exception as e:
        with _lock:
            item=_safe_load(fid)
            if item:
                item['status']='error'
                item['error']=str(e)[:350]
                _save(item)


def get_pages(fid,limit=10,start_page=1):
    fid=vault.check_id(fid)
    meta=vault.get_file(fid)
    item=_safe_load(fid)
    if not item or item['sourceSha256']!=meta['sha256']:
        raise ValueError('هیچ خروجی معتبر OCR برای این نسخهٔ فایل وجود ندارد.')
    start=max(1,int(start_page));end=min(item['pageCount'],start+min(int(limit),25)-1)
    pages=[]
    for p in range(start,end+1):
        path=_dir(fid)/f'page_{p:05d}.txt'
        if path.is_file():
            txt=path.read_text('utf-8')[:12000]
            q=analyze(txt,'fa' if 'fas' in item['language'] else 'en')
            pages.append({'page':p,'text':txt,'qualityStatus':q['qualityStatus'],
                          'qualityReasons':q['qualityReasons']})
        else:
            pages.append({'page':p,'text':'','qualityStatus':'pending','qualityReasons':[]})
    return {'job':_public(item),'pages':pages,'sourceFileId':fid}


def outline_from_ocr(fid):
    from source_course import CHAPTER,MAX_HEADINGS
    fid=vault.check_id(fid)
    meta=vault.get_file(fid)
    item=_safe_load(fid)
    if not item or item.get('status')!='completed' or item['sourceSha256']!=meta['sha256']:
        raise ValueError('پردازش کامل کتاب هنوز پایان نیافته است.')
    entries=[]; good=0;bad=0;reasons=set()
    for page in range(1,item['pageCount']+1):
        txt=(_dir(fid)/f'page_{page:05d}.txt').read_text('utf-8')
        if len(txt.strip())<35:
            continue
        q=analyze(txt,'fa' if 'fas' in item['language'] else 'en')
        if not q['safeForLearning']:
            bad+=1;reasons.update(q['qualityReasons']);continue
        good+=1
        for found in CHAPTER.finditer(txt):
            title=' '.join(found.group(1).split()).strip(' .،:;-')
            if len(title)<6 or len(title)>125:continue
            if any(e['title']==title for e in entries):continue
            entries.append({'title':title,'page':page,'sourceFileId':fid,
                            'sourceSha256':meta['sha256'],'reviewStatus':'needs-human-review'})
            if len(entries)>=MAX_HEADINGS:break
    # Stronger condition than simple presence of words: chapter map stays blocked on poor extraction.
    okay=good>=max(2,int(item['pageCount']*.55)) and bad<=max(3,int(item['pageCount']*.25)) and len(entries)>=2
    return {'sourceFileId':fid,'sha256':meta['sha256'],'name':meta['name'],'pageCount':item['pageCount'],
            'inspectedPages':item['pageCount'],'readablePages':good,'suspectPages':bad,'qualityReasons':sorted(reasons),
            'chapters':entries if okay else [],'status':'review_outline' if okay else 'needs_human_review',
            'safeForOutlineImport':okay,'sourceMethod':'local-OCR-fullbook',
            'message':'فصل‌ها از متن OCR تمام صفحات استخراج شده‌اند؛ قبل از ورود، با PDF تطبیق بده.' if okay else
                      'OCR تمام صفحات انجام شد، اما کیفیت متن یا عنوان فصل‌ها برای تبدیل خودکار کافی نیست؛ بازبینی دستی لازم است.',
            'contentIsVerifiedTeaching':False,'requiresFiveQuestionAssessment':True}


def resume_on_start():
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    if not find_tesseract():return
    for path in sorted(JOBS_DIR.glob('*/job.json')):
        try:
            j=json.loads(path.read_text('utf-8'))
            if j.get('status') in ('running','queued'):
                start(j['fileId'],j['language'])
                break
        except Exception:
            continue


def remove(fid):
    fid=vault.check_id(fid)
    with _lock:
        item=_safe_load(fid)
        if item:
            item['pauseRequested']=True;_save(item)
    # Avoid deleting cache under a running writer; cache is pruned after the worker exits.
    t=_workers.get(fid)
    if t and t.is_alive():
        t.join(timeout=80)
    import shutil
    shutil.rmtree(_dir(fid),ignore_errors=True)
