"""Madar PDF extraction quality gate and optional, local-only OCR.

No uploads to third parties. Recognition is treated as a draft, never proof of
scientific accuracy. This module deliberately does not install software.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
from pathlib import Path

MAX_OCR_PAGES = 4
ROOT = Path(__file__).resolve().parent
TESSDATA_DIR = ROOT / 'vendor' / 'ocr' / 'tessdata'

def add_vendor_path():
    import sys
    vendor = ROOT / 'vendor'
    if str(vendor) not in sys.path:
        sys.path.insert(0, str(vendor))



def analyze(text: str, language: str = 'fa') -> dict:
    language = language if language in ('fa', 'en', 'mixed') else 'fa'
    sample = text[:30000]
    letters = [c for c in sample if c.isalpha()]
    total_letters = len(letters)
    fa_letters = sum('\u0600' <= c <= '\u06ff' or '\u0750' <= c <= '\u077f'
                     for c in letters)
    fa_ratio = fa_letters / max(1, total_letters)
    replacements = sum(c == '\ufffd' or c == '\u25a1' for c in sample)
    noisy_tokens = re.findall(r"(?u)\b[\w]+\b", sample)
    # Digits embedded between letters, e.g. 6erui$0, are common in corrupt cmap output.
    embedded_digits = sum(bool(re.search(r"[A-Za-z][0-9][A-Za-z]|[0-9][A-Za-z]+[0-9]", t))
                          for t in noisy_tokens)
    strange_ratio = embedded_digits / max(1, len(noisy_tokens))
    reasons = []
    if total_letters < 40:
        reasons.append('متن خوانای کافی استخراج نشده است.')
    if language == 'fa' and total_letters >= 100 and fa_ratio < 0.08:
        reasons.append('متن برای منبع فارسی تقریباً فاقد نویسه‌های فارسی است؛ احتمال نگاشت نادرست فونت PDF وجود دارد.')
    if replacements >= 8 or (len(sample) >= 200 and replacements / len(sample) > 0.01):
        reasons.append('نویسه‌های جایگزین و نامعتبر در متن مشاهده شده‌اند.')
    if len(noisy_tokens) >= 30 and strange_ratio > 0.16:
        reasons.append('ترکیب غیرطبیعی حروف و اعداد در کلمات مشاهده شده است.')
    usable = not reasons
    return {
        'qualityStatus': 'readable' if usable else 'suspect',
        'safeForLearning': usable,
        'qualityReasons': reasons,
        'selectedLanguage': language,
        'persianLetterRatio': round(fa_ratio, 3),
        'qualityCheck': 'heuristic-not-scientific-validation',
        'needsSourceReview': True,
    }


def find_tesseract() -> str | None:
    """Find the local OCR engine without requiring a Windows PATH reboot.

    Only look in standard local Windows installation directories; never run a
    downloaded executable or scan untrusted user documents for binaries.
    """
    found = shutil.which('tesseract')
    if found and Path(found).is_file():
        return found
    if os.name != 'nt':
        return None
    candidates = []
    for base in (os.getenv('ProgramFiles'), os.getenv('ProgramFiles(x86)')):
        if base:
            candidates.append(Path(base) / 'Tesseract-OCR' / 'tesseract.exe')
    local = os.getenv('LOCALAPPDATA')
    if local:
        root = Path(local)
        candidates.extend((
            root / 'Madar' / 'Tools' / 'Tesseract-OCR' / 'tesseract.exe',
            root / 'Programs' / 'Tesseract-OCR' / 'tesseract.exe',
            root / 'Microsoft' / 'WinGet' / 'Links' / 'tesseract.exe',
        ))
        # Some WinGet packages are unpacked in per-user Packages directories.
        pkg = root / 'Microsoft' / 'WinGet' / 'Packages'
        if pkg.is_dir():
            for d in list(pkg.glob('UB-Mannheim.TesseractOCR_*'))[:5]:
                candidates.append(d / 'Tesseract-OCR' / 'tesseract.exe')
                candidates.append(d / 'tesseract.exe')
    for item in candidates:
        try:
            if item.is_file():
                return str(item)
        except OSError:
            continue
    return None


def render_pdf_page(pdf_bytes: bytes, page_num: int) -> bytes:
    """Use an already installed local PDF renderer. Never download at runtime."""
    add_vendor_path()
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz
        except ImportError:
            fitz = None
    if fitz is not None:
        with fitz.open(stream=pdf_bytes, filetype='pdf') as doc:
            page = doc[page_num]
            # Bounding pixel count and DPI avoid very large untrusted renderings.
            factor = min(2.0, (6_000_000 / max(1, page.rect.width * page.rect.height)) ** 0.5)
            pix = page.get_pixmap(matrix=fitz.Matrix(factor, factor), alpha=False)
            return pix.tobytes('png')
    try:
        import pypdfium2 as pdfium
    except ImportError as e:
        raise RuntimeError('برای OCR آفلاین، موتور رندر PDF (PyMuPDF یا pypdfium2) روی رایانه در دسترس نیست.') from e
    doc = pdfium.PdfDocument(pdf_bytes)
    try:
        page = doc.get_page(page_num)
        buf = io.BytesIO()
        page.render(scale=2).to_pil().convert('RGB').save(buf, format='PNG')
        return buf.getvalue()
    finally:
        doc.close()


def ocr_pdf(pdf_bytes: bytes, language='fas', page_limit=MAX_OCR_PAGES) -> dict:
    if language not in ('fas', 'eng', 'fas+eng'):
        raise ValueError('زبان OCR نامعتبر است.')
    engine = find_tesseract()
    if not engine:
        raise RuntimeError('موتور OCR فارسی روی رایانه نصب یا همراه برنامه آماده نشده است. متن خراب به درس تبدیل نشد.')
    import sys
    add_vendor_path()
    from pypdf import PdfReader
    pdf = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    n = min(len(pdf.pages), MAX_OCR_PAGES, max(1, int(page_limit)))
    if not n:
        raise ValueError('این PDF صفحه‌ای برای خواندن ندارد.')
    texts=[]
    for i in range(n):
        image = render_pdf_page(pdf_bytes,i)
        flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        cmd = [engine, 'stdin', 'stdout', '--tessdata-dir', str(TESSDATA_DIR), '-l', language, '--oem', '1', '--psm', '3']
        p = subprocess.run(cmd,
                           input=image, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=45, check=False, creationflags=flags)
        if p.returncode != 0:
            raise RuntimeError('موتور OCR در صفحهٔ '+str(i+1)+' ناموفق بود؛ زبان فارسی یا فایل‌های OCR را بررسی کن.')
        texts.append(p.stdout.decode('utf-8', 'replace').strip())
    text='\n\n'.join(s for s in texts if s)
    status=analyze(text,'fa' if 'fas' in language else 'en')
    # Preview is not a complete-document extraction; never authorize a whole-book course from it.
    status['ocrTextReadable'] = status['safeForLearning']
    if n < len(pdf.pages):
        status['safeForLearning'] = False
        status['qualityStatus'] = 'partial_ocr_preview_only'
        status['qualityReasons'] = list(status.get('qualityReasons') or []) + ['فقط چند صفحهٔ نخست OCR شده؛ کل منبع هنوز بررسی نشده است.']
    return {
        'text':text,
        'ocrPagesProcessed':n,
        'ocrPartial':n<len(pdf.pages),
        'ocrEngine':'local-tesseract',
        **status,
    }
