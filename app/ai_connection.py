"""Madar per-user AI connection settings. Secrets never reach static assets.

On Windows, persistent secrets are protected using Windows DPAPI (CurrentUser),
not reversible obfuscation. On non-Windows, external environment configuration
only; no plaintext secrets are written to disk.
"""
from __future__ import annotations
import base64
import ctypes
import json
import os
import re
import threading
from ctypes import wintypes
from pathlib import Path
import vault_server as vault

PROVIDERS = {
    'openai': ('OPENAI_API_KEY','MADAR_MODEL'),
    'anthropic': ('ANTHROPIC_API_KEY','MADAR_ANTHROPIC_MODEL'),
    'google': ('GEMINI_API_KEY','MADAR_GEMINI_MODEL'),
    'ollama': (None,'MADAR_OLLAMA_MODEL'),
}
LOCK = threading.RLock()
SECRET_FILE = vault.DATA_ROOT / 'ai-settings.dpapi'
MODEL_PATTERN = re.compile(r'^[a-zA-Z0-9._:-]{1,96}$')

class _Blob(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_byte))]

def _dpapi(raw: bytes, decrypt=False) -> bytes:
    if os.name != 'nt':
        raise RuntimeError('نگهداری ایمن و دائمی کلید فقط در ویندوز با DPAPI فعال است.')
    src = ctypes.create_string_buffer(raw)
    blob = _Blob(len(raw), ctypes.cast(src,ctypes.POINTER(ctypes.c_byte)))
    dest = _Blob()
    crypt = ctypes.windll.crypt32
    # Explicit Windows calling signatures avoid pointer/Unicode ambiguity on x64.
    crypt.CryptProtectData.argtypes = [ctypes.POINTER(_Blob), wintypes.LPCWSTR,
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
        ctypes.POINTER(_Blob)]
    crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(_Blob),
        ctypes.POINTER(wintypes.LPWSTR), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_Blob)]
    crypt.CryptProtectData.restype = wintypes.BOOL
    crypt.CryptUnprotectData.restype = wintypes.BOOL
    api = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    if decrypt:
        ok = api(ctypes.byref(blob), None, None, None, None, 1, ctypes.byref(dest))
    else:
        ok = api(ctypes.byref(blob), 'MADAR AI settings', None, None, None, 1, ctypes.byref(dest))
    if not ok: raise OSError('رمزگذاری/بازیابی امن ویندوز انجام نشد.')
    try: return ctypes.string_at(dest.pbData, dest.cbData)
    finally:
        kernel=ctypes.windll.kernel32
        kernel.LocalFree.argtypes=[ctypes.c_void_p]
        kernel.LocalFree.restype=ctypes.c_void_p
        kernel.LocalFree(ctypes.cast(dest.pbData,ctypes.c_void_p))

def _load() -> dict:
    if not SECRET_FILE.is_file(): return {}
    if os.name != 'nt': return {}
    raw = _dpapi(SECRET_FILE.read_bytes(), decrypt=True)
    data = json.loads(raw.decode('utf8'))
    return data if isinstance(data,dict) else {}

def configured(provider: str, requested_model=''):
    if provider not in PROVIDERS: raise ValueError('ارائه‌دهنده ناشناخته است.')
    if provider=='openai':
        import chatgpt_plan
        if chatgpt_plan.active():return chatgpt_plan.credential(requested_model)
    key_env, model_env = PROVIDERS[provider]
    with LOCK:
        stored = (_load().get(provider) or {})
    key = str(stored.get('key') or (os.getenv(key_env,'') if key_env else '')).strip()
    model = str(requested_model or stored.get('model') or os.getenv(model_env,'')).strip()
    if not MODEL_PATTERN.fullmatch(model): raise RuntimeError('نام مدل این ارائه‌دهنده هنوز تنظیم نشده است.')
    if key_env and not key: raise RuntimeError('اتصال واقعی مدل هنوز تنظیم نشده است؛ ابتدا از بخش اتصال AI استفاده کن.')
    return key, model

def status():
    storage_error=False
    with LOCK:
        try: saved = _load()
        except (OSError,ValueError,TypeError,UnicodeError):
            saved={}; storage_error=True
    out={}
    for p,(key_env,model_env) in PROVIDERS.items():
        s=saved.get(p) or {}
        model=s.get('model') or os.getenv(model_env,'')
        key=bool((s.get('key') or os.getenv(key_env,'')).strip()) if key_env else True
        out[p]={'configured':bool(key and MODEL_PATTERN.fullmatch(str(model))),
                'model':str(model)[:96], 'keyStored': bool(s.get('key')) if key_env else False,
                'local':p=='ollama'}
    try:
        import chatgpt_plan
        chat=chatgpt_plan.status()
        if chat['permission']:
            out['openai'].update(configured=True,model=chat.get('model',''),auth='chatgpt-plan')
    except Exception:
        pass
    return {'providers':out,'storage':'windows-dpapi' if os.name=='nt' else 'environment-only',
            'secretsReturned':False,'storageError':storage_error, 'message':'ثبت نام و آیکون مدل به تنهایی اتصال واقعی نیست.'}

def save(provider, model, key, explicit):
    if explicit is not True: raise PermissionError('ثبت دسترسی AI به تأیید صریح نیاز دارد.')
    if provider not in PROVIDERS: raise ValueError('ارائه‌دهنده نامعتبر است.')
    if not MODEL_PATTERN.fullmatch(str(model)): raise ValueError('شناسهٔ مدل معتبر نیست.')
    if os.name != 'nt': raise RuntimeError('این عملیات فقط در نسخهٔ نصب‌شدهٔ ویندوز با DPAPI مجاز است.')
    if not isinstance(key,str) or len(key)>400 or '\n' in key or '\r' in key:
        raise ValueError('کلید معتبر نیست.')
    with LOCK:
        old=_load()
        existing=old.get(provider) or {}
        if provider!='ollama' and not (key or existing.get('key')):
            raise ValueError('برای اولین اتصال کلید API لازم است.')
        old[provider]={'model':str(model),'key':key or existing.get('key','')}
        payload=json.dumps(old,ensure_ascii=False).encode('utf8')
        encoded=_dpapi(payload)
        vault.DATA_ROOT.mkdir(parents=True, exist_ok=True)
        tmp=SECRET_FILE.with_suffix('.new')
        fd=os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        try:
            with os.fdopen(fd,'wb') as f:
                f.write(encoded); f.flush(); os.fsync(f.fileno())
            os.replace(tmp,SECRET_FILE)
        finally: tmp.unlink(missing_ok=True)
    return status()
