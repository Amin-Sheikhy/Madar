"""Consent-scoped, resumable PDF vision transcription jobs for Madar.

Each job is an explicit authorization to send a bounded inclusive page range to
one user-configured provider/model. State is persisted before any network call;
no API key is persisted in the job table. Each request is bounded by an immutable
request-count cap, not a promised monetary cap. Failed calls PAUSE rather than
spin. No job grants lesson mastery or silently approves extracted text.
"""
from __future__ import annotations
import re
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import ai_connection as ai
import ai_pdf_reader as reader
import vault_server as vault

JOB_LOCK = threading.RLock()
THREADS: dict[str, threading.Thread] = {}
MAX_RANGE = 3000
MAX_CALLS = 3000


def now():
    return datetime.now(timezone.utc).isoformat()


def _parse_int(value, name):
    if isinstance(value, bool): raise ValueError(name + ' نامعتبر است.')
    try:
        n = int(value)
        if str(value).strip() != str(n): raise ValueError
    except (TypeError, ValueError):
        raise ValueError(name + ' باید عدد صحیح باشد.')
    return n


def _db():
    reader.init()
    with vault.connection() as cx:
        cx.execute('''CREATE TABLE IF NOT EXISTS ai_pdf_jobs (
            id TEXT PRIMARY KEY,file_id TEXT NOT NULL,source_sha256 TEXT NOT NULL,
            provider TEXT NOT NULL,model TEXT NOT NULL,
            start_page INTEGER NOT NULL,end_page INTEGER NOT NULL,next_page INTEGER NOT NULL,
            request_cap INTEGER NOT NULL,requests_used INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE)''')


def _job(cx, job_id):
    if not isinstance(job_id,str) or not re.fullmatch(r'[0-9a-f]{32}',job_id):
        raise ValueError('شناسهٔ پردازش نامعتبر است.')
    row=cx.execute('SELECT * FROM ai_pdf_jobs WHERE id=?',(job_id,)).fetchone()
    if row is None:raise FileNotFoundError('پردازش وجود ندارد.')
    return dict(row)


def _public(job):
    last=max(job['start_page'],job['next_page'])
    done=max(0,min(job['end_page']+1,last)-job['start_page'])
    total=job['end_page']-job['start_page']+1
    return {'jobId':job['id'],'fileId':job['file_id'],'sourceSha256':job['source_sha256'],
            'provider':job['provider'],'model':job['model'],
            'startPage':job['start_page'],'endPage':job['end_page'],
            'nextPage':job['next_page'],'done':done,'total':total,
            'percent':round(100*done/total,1),
            'requestsUsed':job['requests_used'],'requestCap':job['request_cap'],
            'status':job['status'],'lastError':job['last_error'],
            'createdAt':job['created_at'],'updatedAt':job['updated_at'],
            'educationApproved':False,'estimatedDollarCost':None}


def status(file_id=None):
    _db()
    with vault.connection() as cx:
        if file_id is not None:
            fid=vault.check_id(file_id)
            jobs=cx.execute('SELECT * FROM ai_pdf_jobs WHERE file_id=? ORDER BY created_at DESC LIMIT 12',(fid,)).fetchall()
        else:
            jobs=cx.execute('SELECT * FROM ai_pdf_jobs ORDER BY created_at DESC LIMIT 12').fetchall()
    return {'jobs':[_public(dict(j)) for j in jobs]}


def start(file_id,provider,start_page,end_page,request_cap,permission, spawn=True):
    if permission is not True:
        raise PermissionError('ارسال محدودهٔ صفحات به AI به اجازهٔ صریح نیاز دارد.')
    if provider not in ('openai','anthropic','google'):
        raise ValueError('برای PDF مستقیم باید مدل بینایی ابری سازگار انتخاب شود.')
    # Validate actual authentication BEFORE enqueuing a paid job.
    _,model=ai.configured(provider)
    meta,raw=vault.file_bytes(file_id)
    if not meta['name'].lower().endswith('.pdf') or not raw.startswith(b'%PDF-'):
        raise ValueError('منبع انتخابی PDF معتبر نیست.')
    s=_parse_int(start_page,'صفحهٔ آغاز');e=_parse_int(end_page,'صفحهٔ پایان')
    cap=_parse_int(request_cap,'سقف درخواست')
    if not (1<=s<=e<=MAX_RANGE) or not (1<=cap<=MAX_CALLS):
        raise ValueError('محدودهٔ صفحات یا سقف درخواست نامعتبر است.')
    # Split first page to establish real document length and eliminate bad jobs.
    _,total=reader.split_page(raw,s)
    if e>total:raise ValueError('شمارهٔ صفحهٔ پایان از تعداد صفحات PDF بیشتر است.')
    if cap<e-s+1:raise ValueError('سقف درخواست باید دست‌کم برابر تعداد صفحات انتخاب‌شده باشد.')
    _db()
    with JOB_LOCK,vault.LOCK,vault.connection() as cx:
        active=cx.execute("SELECT id FROM ai_pdf_jobs WHERE file_id=? AND status IN ('queued','running')",(meta['id'],)).fetchone()
        if active:raise RuntimeError('یک پردازش برای این فایل در حال اجراست. ابتدا آن را متوقف کن.')
        jid=uuid.uuid4().hex;ts=now()
        cx.execute('''INSERT INTO ai_pdf_jobs(id,file_id,source_sha256,provider,model,start_page,end_page,
                     next_page,request_cap,requests_used,status,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,0,'queued',?,?)''',
                   (jid,meta['id'],meta['sha256'],provider,model,s,e,s,cap,ts,ts))
        vault.log(cx,'ai-pdf-batch-consent',meta['id'],f'{jid}: {provider} {s}-{e} max={cap}')
        cx.commit()
    if spawn: _launch(jid)
    with vault.connection() as cx:return _public(_job(cx,jid))


def _launch(jid):
    with JOB_LOCK:
        existing=THREADS.get(jid)
        if existing and existing.is_alive():return
        t=threading.Thread(target=_worker,args=(jid,),daemon=True,name='MadarPdfBatch-'+jid[:6])
        THREADS[jid]=t;t.start()


def _worker(jid):
    # One page at a time. No infinite retries or log output of page content.
    while True:
        try:
            with JOB_LOCK,vault.connection() as cx:
                j=_job(cx,jid)
                if j['status'] not in ('queued','running'):return
                if j['next_page']>j['end_page']:
                    cx.execute("UPDATE ai_pdf_jobs SET status='completed',updated_at=? WHERE id=?",(now(),jid));cx.commit();return
                if j['requests_used']>=j['request_cap']:
                    cx.execute("UPDATE ai_pdf_jobs SET status='paused',last_error=?,updated_at=? WHERE id=?",
                               ('سقف درخواست‌های مجاز این کار تکمیل شد.',now(),jid));cx.commit();return
                # Reservation occurs BEFORE the request; timeouts consume one count.
                page=j['next_page']
                cx.execute("UPDATE ai_pdf_jobs SET status='running',requests_used=requests_used+1,updated_at=? WHERE id=?",(now(),jid))
                cx.commit()
            meta=vault.get_file(j['file_id'])
            if meta['sha256']!=j['source_sha256']:
                raise RuntimeError('هش منبع تغییر کرده؛ پردازش برای حفاظت از استناد متوقف شد.')
            # Skip existing draft/reviewed pages for identical source. Never overwrite approvals.
            if reader.page_exists(j['file_id'],page):
                # Undo reservation on skipped page: no new request occurred.
                with JOB_LOCK,vault.connection() as cx:
                    cx.execute('''UPDATE ai_pdf_jobs SET next_page=?,requests_used=requests_used-1,
                                  updated_at=? WHERE id=? AND next_page=?''',(page+1,now(),jid,page));cx.commit()
                continue
            # Provider model remains fixed; don't silently switch to a different model.
            reader.read_page(j['file_id'],page,j['provider'],True,model=j['model'])
            with JOB_LOCK,vault.connection() as cx:
                cx.execute('''UPDATE ai_pdf_jobs SET next_page=?,last_error='',updated_at=? WHERE id=? AND next_page=?''',
                           (page+1,now(),jid,page))
                cx.commit()
        except Exception as exc:
            # A human-readable, redacted reason; no provider response body or secrets.
            message=str(exc).replace('\n',' ')[:220]
            with JOB_LOCK,vault.connection() as cx:
                cx.execute("UPDATE ai_pdf_jobs SET status='paused_error',last_error=?,updated_at=? WHERE id=?",(message,now(),jid))
                cx.commit()
            return


def pause(jid):
    _db()
    with JOB_LOCK,vault.connection() as cx:
        j=_job(cx,jid)
        if j['status'] in ('queued','running'):
            cx.execute("UPDATE ai_pdf_jobs SET status='paused',updated_at=? WHERE id=?",(now(),jid));cx.commit()
        return _public(_job(cx,jid))


def resume(jid, permission):
    if permission is not True: raise PermissionError('ادامهٔ ارسال صفحه‌ها به تأیید نیاز دارد.')
    _db()
    with JOB_LOCK,vault.connection() as cx:
        j=_job(cx,jid)
        if j['status']=='completed':return _public(j)
        if j['status'] not in ('paused','paused_error','interrupted','quota_reached'):
            raise ValueError('این پردازش قابل ادامه نیست.')
        ai.configured(j['provider'],j['model'])
        if j['requests_used']>=j['request_cap']:
            raise RuntimeError('سقف درخواست این کار تمام شده؛ برای هزینهٔ بیشتر، یک کار جدید با مجوز تازه بساز.')
        # Guard against changed source before restarting.
        if vault.get_file(j['file_id'])['sha256']!=j['source_sha256']:
            raise RuntimeError('فایل اصلی تغییر کرده است. ادامه بدون اعتبارسنجی مجاز نیست.')
        cx.execute("UPDATE ai_pdf_jobs SET status='queued',last_error='',updated_at=? WHERE id=?",(now(),jid))
        cx.commit()
    _launch(jid)
    with vault.connection() as cx:return _public(_job(cx,jid))


def on_server_start():
    """Pause orphaned jobs: require a visible resume after app restart to avoid surprising charges."""
    _db()
    with JOB_LOCK,vault.connection() as cx:
        cx.execute("UPDATE ai_pdf_jobs SET status='interrupted',last_error=?,updated_at=? WHERE status IN ('running','queued')",
                   ('اجرای قبلی قطع شد؛ صفحات ذخیره‌شده باقی‌اند. برای ادامه مجوز بده.',now()))
        cx.commit()
