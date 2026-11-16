"""Offline PDF library on D, including consent-based one-action file import.

All network endpoints are loopback; no cloud or AI request is made here.
POST /api/local-pdf/import streams browser-selected bytes into MADAR/Books,
so the standard app vault's 40 MiB limit is not a blocker for books.
"""
from __future__ import annotations
from pathlib import Path
import os
import re
import uuid
import hashlib
import vault_server as vault

BOOKS = vault.DATA_ROOT.parent / 'Books'
# Forbidden Windows filename characters, path separators, controls and trailing dots.
NAME_PATTERN = re.compile(r'^[^<>:"/\\|?*\x00-\x1f]{1,180}\.pdf$', re.IGNORECASE)
MAX_VIEW_BYTES = 200 * 1024 * 1024


def _root():
    BOOKS.mkdir(parents=True, exist_ok=True)
    if BOOKS.is_symlink():
        raise PermissionError('پوشهٔ کتاب‌ها نباید پیوند باشد.')
    return BOOKS.resolve(strict=True)


def valid_name(name):
    if not isinstance(name, str) or not NAME_PATTERN.fullmatch(name) or name[-4:] == '....':
        raise ValueError('نام PDF نامعتبر است.')
    if name.endswith((' ', '.')) or Path(name).stem.upper() in (
            {'CON','PRN','AUX','NUL'} | {f'COM{i}' for i in range(1,10)} | {f'LPT{i}' for i in range(1,10)}):
        raise ValueError('نام فایل برای ویندوز مجاز نیست.')
    return name


def list_books():
    root = _root()
    results = []
    for entry in root.iterdir():
        if not NAME_PATTERN.fullmatch(entry.name) or entry.is_symlink() or not entry.is_file():
            continue
        s = entry.stat()
        if 0 < s.st_size <= MAX_VIEW_BYTES:
            results.append({'name': entry.name, 'size': s.st_size, 'origin': 'books'})
    results.sort(key=lambda x: x['name'].casefold())
    return {'books': results, 'folder': str(root)}


def delete_book(name, confirm):
    """Delete only the managed PDF copy in MADAR/Books after a UI confirmation.

    The source file selected elsewhere by the user is never touched.
    """
    if confirm is not True:
        raise PermissionError('برای حذف نسخهٔ ذخیره‌شده، تأیید صریح لازم است.')
    name = valid_name(name)
    root = _root()
    target = root / name
    if target.is_symlink():
        raise PermissionError('حذف پیوند فایل مجاز نیست.')
    resolved = target.resolve(strict=True)
    if resolved.parent != root or not resolved.is_file():
        raise PermissionError('فایل خارج از پوشهٔ امن کتاب‌ها است.')
    with resolved.open('rb') as source:
        if source.read(5) != b'%PDF-':
            raise ValueError('فایل انتخاب‌شده PDF معتبر نیست؛ حذف متوقف شد.')
    resolved.unlink()
    return {'deleted': True, 'name': name, 'deletedFromBooksOnD': True,
            'originalSourcePreserved': True, 'cloudSent': False}


def read_book(name):
    valid_name(name)
    root = _root()
    p = root / name
    if p.is_symlink():
        raise PermissionError('پیوند فایل مجاز نیست.')
    target = p.resolve(strict=True)
    if target.parent != root or not target.is_file():
        raise PermissionError('فایل خارج از پوشهٔ کتاب‌ها است.')
    fd = os.open(str(target), os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as f:
        st = os.fstat(f.fileno())
        if not 0 < st.st_size <= MAX_VIEW_BYTES:
            raise ValueError('حجم PDF مجاز نیست.')
        data = f.read(MAX_VIEW_BYTES + 1)
    if not data.startswith(b'%PDF-'):
        raise ValueError('محتوای فایل PDF معتبر نیست.')
    return data


def import_book(reader, name, content_length):
    """Stream a manually chosen PDF into Books. Never overwrite an existing file."""
    name = valid_name(name)
    if not isinstance(content_length, int) or not 5 <= content_length <= MAX_VIEW_BYTES:
        raise ValueError('حجم PDF باید حداکثر ۲۰۰ مگابایت باشد.')
    root = _root()
    stem, ext = name[:-4], name[-4:]
    dest = None
    fd = None
    for i in range(1000):
        candidate = name if i == 0 else f'{stem[:165]} ({i+1}){ext}'
        try:
            fd = os.open(str(root / candidate), os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os,'O_BINARY',0), 0o600)
            dest = root / candidate
            break
        except FileExistsError:
            continue
    if fd is None:
        raise ValueError('نام آزاد برای ذخیره کتاب پیدا نشد.')
    remaining = content_length
    sha = hashlib.sha256()
    try:
        with os.fdopen(fd, 'wb') as out:
            head = reader.read(5)
            if head != b'%PDF-':
                raise ValueError('فایل انتخاب‌شده PDF معتبر نیست.')
            out.write(head)
            sha.update(head)
            remaining -= 5
            while remaining:
                chunk = reader.read(min(1024*1024, remaining))
                if not chunk:
                    raise ValueError('داده PDF ناقص دریافت شد.')
                out.write(chunk)
                sha.update(chunk)
                remaining -= len(chunk)
            out.flush()
            os.fsync(out.fileno())
        return {'name': dest.name, 'size': content_length, 'sha256': sha.hexdigest(),
                'origin': 'books', 'storedOnD': True, 'cloudSent': False}
    except Exception:
        if dest is not None:
            dest.unlink(missing_ok=True)
        raise
