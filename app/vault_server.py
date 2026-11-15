"""Madar on-disk project/file vault. Localhost only; caller enforces Host and Origin.
Never deletes an original source path. All destructive actions are id-scoped to vault files.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import sqlite3
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree

MAX_FILE = 120 * 1024 * 1024
MAX_PREVIEW = 45_000
ROOT = Path(__file__).resolve().parent


def default_data_root() -> Path:
    configured = os.environ.get('MADAR_DATA_DIR', '').strip()
    if configured:
        return Path(configured).expanduser().resolve()
    if ROOT.name == 'App':
        return (ROOT.parent / 'Data').resolve()
    local_app_data = os.environ.get('LOCALAPPDATA')
    base = Path(local_app_data) / 'Madar' if local_app_data else Path.home() / 'AppData' / 'Local' / 'Madar'
    return (base / 'Data').resolve()


DATA_ROOT = default_data_root()
FILES = DATA_ROOT / 'files'
IMPORT_ROOT_RAW = os.environ.get('MADAR_IMPORT_DIR', '').strip()  # legacy environment override, still supported
SETTINGS_FILE = DATA_ROOT / 'settings.json'
DB = DATA_ROOT / 'vault.sqlite3'
LOCK = threading.RLock()


def get_import_root():
    """Return the user-authorized directory, persisted in app data after one approval."""
    raw = ''
    if SETTINGS_FILE.is_file():
        try:
            raw = str(json.loads(SETTINGS_FILE.read_text(encoding='utf-8')).get('importRoot','')).strip()
        except (ValueError, OSError, TypeError):
            raw = ''
    if not raw:
        raw = IMPORT_ROOT_RAW
    if not raw:
        return None
    p = Path(raw).expanduser().resolve()
    return p if p.is_dir() else None


def set_import_root(raw):
    """Only an explicit user action in the trusted local UI may call this endpoint.
    The selected directory is reused on each login; no all-drive auto-scan.
    """
    raw = str(raw or '').strip().strip('"')
    if not raw or len(raw) > 1024:
        raise ValueError('یک پوشهٔ معتبر انتخاب کن.')
    p = Path(raw).expanduser().resolve(strict=True)
    if not p.is_dir():
        raise ValueError('آدرس یک پوشهٔ معتبر نیست.')
    if p == Path(p.anchor) or (p.parent == p):
        raise PermissionError('اعطای دسترسی به کل درایو یا ریشه مجاز نیست.')
    if DATA_ROOT == p or p in DATA_ROOT.parents or p == ROOT or p in ROOT.parents:
        raise PermissionError('پوشهٔ داده یا برنامه نمی‌تواند پوشهٔ ورود عمومی باشد.')
    if os.name == 'nt':
        sysroot = Path(os.environ.get('SystemRoot','C:/Windows')).resolve()
        if p == sysroot or sysroot in p.parents:
            raise PermissionError('پوشهٔ سیستمی ویندوز را مجاز نکن.')
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    # Atomic replacement; no user-provided paths are used to choose config file name.
    blob = json.dumps({'importRoot':str(p)},ensure_ascii=False).encode('utf-8')
    tmp = DATA_ROOT / ('settings-' + uuid.uuid4().hex + '.tmp')
    try:
        fd = os.open(str(tmp), os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        with os.fdopen(fd,'wb') as f:
            f.write(blob)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, SETTINGS_FILE)
    finally:
        tmp.unlink(missing_ok=True)
    return {'saved':True,'importRoot':str(p),'importRootEnabled':True,
            'message':'پوشهٔ مجاز ذخیره شد و در دفعات بعد به‌طور خودکار استفاده می‌شود.'}

def utc():
    return datetime.now(timezone.utc).isoformat()


def init():
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    FILES.mkdir(parents=True, exist_ok=True)
    if os.name != 'nt':
        DATA_ROOT.chmod(0o700)
        FILES.chmod(0o700)
    with connection() as cx:
        cx.executescript('''
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE,
           size INTEGER NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, source_hint TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS project_files(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
           file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE, PRIMARY KEY(project_id,file_id));
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL,
           subject_id TEXT NOT NULL, details TEXT NOT NULL);
        ''')


def connection():
    cx = sqlite3.connect(str(DB), timeout=15)
    cx.row_factory = sqlite3.Row
    cx.execute('PRAGMA foreign_keys=ON')
    return cx


def check_id(raw):
    val = str(raw or '')
    if not re.fullmatch(r'[0-9a-f]{32}', val):
        raise ValueError('شناسه معتبر نیست.')
    return val


def safe_title(raw):
    val = str(raw or '').strip()
    if not val or len(val) > 160 or any(ord(c) < 32 for c in val):
        raise ValueError('نام پروژه نامعتبر است (حداکثر ۱۶۰ نویسه).')
    return val


def safe_name(raw):
    val = str(raw or '').replace('\\', '/').split('/')[-1].strip()
    if not val or val in ('.','..') or len(val) > 180 or any(ord(c) < 32 for c in val):
        raise ValueError('نام فایل نامعتبر است.')
    return val


def log(cx, event, subject, details=''):
    cx.execute('INSERT INTO audit(at,event,subject_id,details) VALUES(?,?,?,?)',(utc(),event,subject,str(details)[:250]))


def add_file(data: bytes, name: str, mime='application/octet-stream', source_hint=''):
    name = safe_name(name)
    if not data or len(data) > MAX_FILE:
        raise ValueError('حجم فایل باید بین ۱ بایت و ۴۰ مگابایت باشد.')
    fid = uuid.uuid4().hex
    stored = fid + '.bin'
    target = FILES / stored
    sha = hashlib.sha256(data).hexdigest()
    fd = os.open(str(target), os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd,'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        try:
            with LOCK, connection() as cx:
                cx.execute('INSERT INTO files VALUES(?,?,?,?,?,?,?,?)',
                           (fid,name,stored,len(data),str(mime)[:100],sha,source_hint[:200],utc()))
                log(cx,'import',fid,name)
                cx.commit()
        except Exception:
            target.unlink(missing_ok=True)
            raise
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return {'id':fid,'name':name,'size':len(data),'sha256':sha,'storedInProjectFolder':True,
            'originalSourcePreserved':True}


def import_from_path(raw):
    import_root=get_import_root()
    if not import_root:
        raise PermissionError('ابتدا یک‌بار پوشهٔ ورودی را در داشبورد مجاز کن.')
    path = Path(str(raw or '')).expanduser()
    if path.is_symlink():
        raise PermissionError('ورودی از پیوند نمادین مجاز نیست.')
    resolved = path.resolve(strict=True)
    try:
        resolved.relative_to(import_root)
    except ValueError:
        raise PermissionError('این فایل خارج از پوشهٔ مجاز ورود است.')
    if not resolved.is_file():
        raise ValueError('آدرس باید به یک فایل عادی اشاره کند.')
    # O_NOFOLLOW blocks final-component symlink substitution; recheck file size after opening.
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(str(resolved), flags)
    with os.fdopen(fd, 'rb') as f:
        st = os.fstat(f.fileno())
        if st.st_size > MAX_FILE:
            raise ValueError('فایل بیش از ۴۰ مگابایت است.')
        raw = f.read(MAX_FILE + 1)
    return add_file(raw, resolved.name, source_hint='imported-from-approved-folder')


def list_all():
    init()
    with connection() as cx:
        projects = [dict(r) for r in cx.execute('SELECT * FROM projects ORDER BY created_at DESC')]
        files = [dict(r) for r in cx.execute('SELECT id,name,size,mime,sha256,created_at,source_hint FROM files ORDER BY created_at DESC')]
        links = [dict(r) for r in cx.execute('SELECT project_id,file_id FROM project_files')]
        audit = [dict(r) for r in cx.execute('SELECT at,event,subject_id,details FROM audit ORDER BY id DESC LIMIT 15')]
    return {'projects':projects,'files':files,'links':links,'audit':audit,
            'importRootEnabled':get_import_root() is not None,
            'importRoot':str(get_import_root() or ''),
            'dataFolder':str(DATA_ROOT),'serverVault':True}


def create_project(title, description=''):
    pid=uuid.uuid4().hex
    with LOCK, connection() as cx:
        cx.execute('INSERT INTO projects VALUES(?,?,?,?)',(pid,safe_title(title),str(description)[:1000],utc()))
        log(cx,'project-created',pid,title)
        cx.commit()
    return {'id':pid,'title':title}


def get_file(fid):
    with connection() as cx:
        row = cx.execute('SELECT * FROM files WHERE id=?',(check_id(fid),)).fetchone()
    if not row: raise FileNotFoundError('فایل در کتابخانه یافت نشد.')
    return dict(row)


def file_bytes(file_id):
    meta=get_file(file_id)
    target=FILES / meta['stored_name']
    if target.is_symlink() or not target.is_file() or target.parent != FILES:
        raise FileNotFoundError('نسخهٔ دیسکی فایل پیدا نشد.')
    raw=target.read_bytes()
    if len(raw)!=meta['size'] or hashlib.sha256(raw).hexdigest()!=meta['sha256']:
        raise ValueError('صحت فایل با هش ذخیره‌شده تطبیق ندارد.')
    return meta,raw


def attach(pid, fid, detach=False):
    pid,fid=check_id(pid),check_id(fid)
    with LOCK, connection() as cx:
        if not cx.execute('SELECT 1 FROM projects WHERE id=?',(pid,)).fetchone():raise ValueError('پروژه پیدا نشد.')
        if not cx.execute('SELECT 1 FROM files WHERE id=?',(fid,)).fetchone():raise ValueError('فایل پیدا نشد.')
        if detach:
            cx.execute('DELETE FROM project_files WHERE project_id=? AND file_id=?',(pid,fid))
        else:
            cx.execute('INSERT OR IGNORE INTO project_files VALUES(?,?)',(pid,fid))
        log(cx,'detached' if detach else 'linked',fid,pid)
        cx.commit()
    return {'ok':True}


def project_from_file(fid,title):
    meta=get_file(fid)
    project=create_project(title or Path(meta['name']).stem)
    attach(project['id'],fid)
    return project


def delete(fid,confirm_name):
    with LOCK:
        meta=get_file(fid)
        if str(confirm_name)!=meta['name']:
            raise ValueError('برای حذف دائمی، نام دقیق فایل را وارد کن.')
        target=FILES/meta['stored_name']
        if target.parent!=FILES or target.is_symlink():
            raise PermissionError('مسیر فایل امن نیست.')
        # Deletion affects ONLY the managed copy, never the user-selected original.
        if not target.is_file():
            raise FileNotFoundError('نسخهٔ دیسکی یافت نشد؛ حذف تأیید نمی‌شود.')
        target.unlink()
        with connection() as cx:
            cx.execute('DELETE FROM files WHERE id=?',(fid,))
            log(cx,'permanently-deleted-managed-copy',fid,meta['name'])
            cx.commit()
    try:
        import ocr_jobs
        ocr_jobs.remove(fid)
    except (OSError, RuntimeError, ValueError):
        pass
    return {'deleted':True,'deletedFromManagedFolder':True,'originalSourcePreserved':True,
            'message':'فایل از کتابخانه، پیوندهای پروژه و پوشهٔ اصلی مدیریت‌شدهٔ مَدار حذف شد؛ فایل منبع بیرونی دست‌نخورده باقی ماند.'}


def extract_text(meta, raw, language='fa'):
    ext=Path(meta['name']).suffix.lower()
    if ext in {'.txt','.md','.csv','.tsv','.py','.json','.log','.ipynb'}:
        if len(raw)>3_000_000:raise ValueError('پیش‌نمایش متن‌های بیش از ۳ مگابایت پشتیبانی نمی‌شود.')
        text=raw.decode('utf-8-sig', errors='replace')
        if ext=='.ipynb':
            try:
                nb=json.loads(text)
                text='\n\n'.join(''.join(c.get('source',[])) for c in nb.get('cells',[]) if c.get('cell_type')=='markdown')
            except Exception:pass
    elif ext=='.pdf':
        # Use the trusted, packaged pure-Python PDF reader. Never invoke pip at study time.
        import sys
        bundled_root = ROOT / 'vendor'
        bundled_reader = bundled_root / 'pypdf' / '__init__.py'
        if bundled_reader.is_file() and str(bundled_root) not in sys.path:
            sys.path.insert(0, str(bundled_root))
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ValueError('موتور خواندن PDF ناقص است؛ بستهٔ کامل مَدار را مجدداً نصب کن. داده‌های درسی حذف نمی‌شوند.') from exc
        from io import BytesIO
        pdf=PdfReader(BytesIO(raw),strict=False)
        if len(pdf.pages)>500: raise ValueError('PDF بیش از ۵۰۰ صفحه است؛ ابتدا بخش موردنظر را جدا کن.')
        text='\n'.join((page.extract_text() or '') for page in pdf.pages[:80])
    elif ext=='.docx':
        from io import BytesIO
        with zipfile.ZipFile(BytesIO(raw)) as z:
            if 'word/document.xml' not in z.namelist():raise ValueError('سند DOCX معتبر نیست.')
            if z.getinfo('word/document.xml').file_size>5_000_000:raise ValueError('سند بسیار بزرگ است.')
            doc=ElementTree.fromstring(z.read('word/document.xml'))
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text='\n'.join(''.join(x.text or '' for x in p.findall('.//w:t',ns)) for p in doc.findall('.//w:p',ns))
    else:
        raise ValueError('برای این قالب، استخراج متنی فعال نیست؛ فایل همچنان قابل نگهداری و اتصال به پروژه است.')
    text=re.sub(r'\x00','',text).strip()
    if not text and ext != '.pdf':
        raise ValueError('متن قابل استخراج یافت نشد.')
    # OCR cache is an audited, page-indexed draft; the source remains immutable.
    if ext == '.pdf':
        try:
            import ocr_jobs
            job=ocr_jobs.get_status(meta['id'])
            if job.get('status')=='completed':
                pages=ocr_jobs.get_pages(meta['id'],start_page=1,limit=5)['pages']
                snippet='\n\n'.join('صفحه '+str(x['page'])+'\n'+x['text'] for x in pages)
                return {'name':meta['name'],'text':snippet[:MAX_PREVIEW],
                    'sourceFileId':meta['id'],'totalCharacters':None,'truncated':True,
                    'qualityStatus':'full_ocr_requires_review','safeForLearning':False,
                    'ocrComplete':True,'ocrPagesProcessed':job['processed'],
                    'verifiedAsTeachingContent':False,'qualityReasons':[],
                    'message':'تمام صفحات با OCR پردازش شدند؛ متن اولیهٔ OCR هنوز از نظر علمی و با اصل PDF تأیید نشده. از «بررسی فصل‌ها» برای ایجاد پیش‌نویس قفل‌شده استفاده کن.'}
        except (OSError,RuntimeError,ValueError,KeyError):
            pass
    # A scanned PDF still needs a preview result with OCR guidance, not a hard error.
    from pdf_quality import analyze
    quality = analyze(text, language if ext == '.pdf' else 'mixed')
    # Attempt *local* OCR automatically only when the OS already has the
    # required OCR / PDF renderer. Never download dependencies or send pages
    # to a cloud model without separate consent.
    if ext == '.pdf' and not quality['safeForLearning'] and language == 'fa':
        try:
            from pdf_quality import find_tesseract
            if find_tesseract():
                recovered = ocr_file(meta, raw, 'fas')
                recovered['automaticOcr'] = True
                if recovered['safeForLearning']:
                    return recovered
        except (ValueError, RuntimeError, ImportError, OSError, TimeoutError):
            pass
    result = {'name':meta['name'],'text':text[:MAX_PREVIEW], 'totalCharacters':len(text),
              'truncated':len(text)>MAX_PREVIEW, 'sourceFileId':meta['id'],
              'verifiedAsTeachingContent':False, **quality}
    if not quality['safeForLearning']:
        # Do not accidentally hand 45k of corrupt text to the learning system.
        result['text'] = text[:1800]
        result['truncated'] = True
        result['message'] = 'متن این فایل احتمالاً مخدوش است. ساخت درس و فلش‌کارت تا بازیابی متن خوانا مسدود شده است.'
    else:
        result['message'] = 'متن قابل‌خواندن به نظر می‌رسد؛ صحت علمی و تطبیق با اصل فایل همچنان باید بررسی شود.'
    return result


def ocr_file(meta, raw, language='fas'):
    if Path(meta['name']).suffix.lower() != '.pdf':
        raise ValueError('OCR این مسیر فقط برای PDF فعال است.')
    from pdf_quality import ocr_pdf
    result=ocr_pdf(raw, language=language)
    text=result.pop('text', '')
    return {'name':meta['name'], 'sourceFileId':meta['id'], 'text':text[:MAX_PREVIEW],
            'totalCharacters':len(text), 'truncated':bool(result.get('ocrPartial') or len(text)>MAX_PREVIEW),
            'verifiedAsTeachingContent':False, **result,
            'message': 'متن OCR تنها از صفحات آغازین تولید شده است. قبل از ساخت درس، با تصویر اصل صفحات مقایسه کن.'}



def history():
    with connection() as cx:
        return [dict(r) for r in cx.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 150')]
