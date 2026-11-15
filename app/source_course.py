"""Conservative course outline from a verified local source (not AI teaching).

Only chapter headings actually appearing in extracted PDF text may enter the
plan; a filename, a cover page or a guessed topic is never a chapter.
The API is strictly read-only. The caller must explicitly approve importing
review-pending outline records into its local course state.
"""
from __future__ import annotations
import io
import re
import sys
import shutil
import subprocess
from pathlib import Path
from pdf_quality import analyze, find_tesseract, TESSDATA_DIR, add_vendor_path

MAX_INSPECT_PAGES = 80
MAX_HEADINGS = 25
ROOT = Path(__file__).resolve().parent
CHAPTER = re.compile(r'^(?:\s*)((?:فصل|بخش|گفتار|درس)\s+(?:[۰-۹٠-٩0-9]+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم)\s*[:.،\-–—]?\s*[^\n]{0,100}|(?:chapter|part|lesson)\s+\d{1,3}\s*[:.\-–—]?\s*[^\n]{0,100})\s*$', re.IGNORECASE | re.MULTILINE)

def ocr_capabilities():
    engine = find_tesseract()
    # Keep dependencies optional; do not reach the internet or auto-install software.
    add_vendor_path()
    renderer = None
    for name in ('pymupdf','fitz','pypdfium2'):
        try:
            __import__(name)
            if name=='pypdfium2': __import__('PIL')
            renderer = name
            break
        except (ImportError, OSError):
            pass
    langs=[]
    if engine:
        try:
            p=subprocess.run([engine,'--list-langs','--tessdata-dir',str(TESSDATA_DIR)],capture_output=True,text=True,timeout=5,check=False,
                             creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            langs=[x.strip() for x in p.stdout.splitlines()[1:] if x.strip()]
        except (OSError,subprocess.TimeoutExpired): pass
    return {'engineAvailable':bool(engine),'rendererAvailable':bool(renderer),
            'persianLanguageAvailable':'fas' in langs,
            'ready':bool(engine and renderer and 'fas' in langs),
            'engineType':'Tesseract' if engine else None,
            'rendererType':renderer,
            'dataSentOffDevice':False,
            'message':('OCR فارسی آماده است؛ پیش‌نمایش چهار صفحه را با متن منبع مقایسه کن.' if engine and renderer and 'fas' in langs
                       else ('موتور Tesseract نصب یا شناسایی نشده است. نسخهٔ ۴.۴۱ از نصب مستقیم با بررسی SHA-256 استفاده می‌کند؛ برای آماده‌سازی OCR به‌روزرسان را اجرا کن.' if not engine
                             else ('زبان فارسی در بستهٔ OCR شناسایی نشد؛ جزئیات در گزارش به‌روزرسان ثبت می‌شود.' if 'fas' not in langs
                                   else 'موتور نمایش PDF در دسترس نیست؛ متن مخدوش اجازهٔ ورود به درس را ندارد.')))}

def inspect_source(meta,raw,language='fa'):
    if language not in ('fa','en','mixed'):raise ValueError('زبان منبع نامعتبر است.')
    if Path(meta['name']).suffix.lower() != '.pdf':
        raise ValueError('این بررسی فصل‌بندی فعلاً برای PDF متنی است.')
    vendor=ROOT/'vendor'
    if (vendor/'pypdf'/'__init__.py').is_file() and str(vendor) not in sys.path:
        sys.path.insert(0,str(vendor))
    from pypdf import PdfReader
    pdf=PdfReader(io.BytesIO(raw),strict=False)
    total=len(pdf.pages)
    if not total or total>500:raise ValueError('PDF خالی یا بیش از ۵۰۰ صفحه است.')
    inspected=min(total,MAX_INSPECT_PAGES)
    nonempty=0;bad=0;good=0;quality_reasons=set();chapter_list=[]
    for i in range(inspected):
        text=(pdf.pages[i].extract_text() or '')[:20000]
        if len(text.strip())<50:continue
        nonempty+=1
        q=analyze(text,language)
        if q['safeForLearning']:good+=1
        else:
            bad+=1;quality_reasons.update(q.get('qualityReasons',[]))
        if not q['safeForLearning']:continue
        for hit in CHAPTER.finditer(text):
            title=' '.join(hit.group(1).split()).strip(' .،:;-')
            if len(title)<6 or len(title)>125:continue
            # A single chapter may repeat on many page headers. Keep its first appearance.
            if any(x['title']==title for x in chapter_list):continue
            chapter_list.append({'title':title,'page':i+1,'type':'explicit-heading-in-source',
                                  'sourceFileId':meta['id'],'sourceSha256':meta['sha256'],
                                  'reviewStatus':'needs-human-review'})
            if len(chapter_list)>=MAX_HEADINGS:break
    unreadable=nonempty == 0 or bad >= max(2, (nonempty+1)//2) or (good < 2 and nonempty >= 3)
    # No academic facts or chapter titles are invented. Even a readable document
    # might have an invisible TOC; in that case report a gap instead of guessing.
    if unreadable:
        status='blocked_bad_text';chapter_list=[]
        message='متن این PDF برای ساخت دوره قابل‌اعتماد نیست. نخست استخراج/بازشناسی فارسی و بازبینی صفحات لازم است.'
    elif len(chapter_list)<2:
        status='needs_outline_review';chapter_list=[]
        message='متن قابل‌خواندن است، ولی حداقل دو عنوان فصل معتبر شناسایی نشد. فصل‌بندی باید با اصل سند بررسی شود.'
    else:
        status='review_outline';message='عنوان‌های فصل فقط از متن منبع استخراج شده‌اند. پیش از ورود به برنامه نام و صفحه را بررسی کن.'
    return {'name':meta['name'],'sourceFileId':meta['id'],'sha256':meta['sha256'],
            'pageCount':total,'inspectedPages':inspected,'nonemptyPages':nonempty,
            'readablePages':good,'suspectPages':bad,'status':status,
            'safeForOutlineImport':status=='review_outline',
            'chapters':chapter_list,'message':message,
            'qualityReasons':sorted(quality_reasons),'confidence':'heuristic-unverified',
            'contentIsVerifiedTeaching':False,'requiresFiveQuestionAssessment':True}
