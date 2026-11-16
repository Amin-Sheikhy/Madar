"""Local-only Sign in with ChatGPT (SIWC) OAuth for a personal Madar install.

No API keys, no browser-exposed tokens, strict loopback PKCE + nonce/state and
OpenAI JWKS RS256 validation. The host ID and issued client ID are distinct.
All credentials are protected with Windows CurrentUser DPAPI. If verification,
permission, storage or network fails, access fails closed.

Protocol: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, secrets, threading, time, uuid
import urllib.parse, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
import ai_connection
import vault_server as vault

ISSUER='https://auth.openai.com'
AUTHORIZE=ISSUER+'/api/accounts/authorize'
TOKEN=ISSUER+'/api/accounts/oauth/token'
JWKS=ISSUER+'/.well-known/jwks.json'
RESOURCE='https://api.openai.com/v1'
API=RESOURCE
SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
NAME='Madar'
LOCK=threading.RLock()
VAULT=vault.DATA_ROOT / 'chatgpt-plan.dpapi'
HOST_FILE=vault.DATA_ROOT / 'chatgpt-host.json'
ATTEMPT=None


def _b64u(b):return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')
def _unb64(s):
    if not isinstance(s,str) or len(s)>20000 or not re.fullmatch(r'[A-Za-z0-9_-]+',s):raise ValueError('قالب توکن نامعتبر است.')
    return base64.urlsafe_b64decode(s+'='*((-len(s))%4))

def _epoch_time(value):
    if isinstance(value,bool): return None
    if isinstance(value,(int,float)): return float(value)
    if not isinstance(value,str) or not value: return None
    try: return float(value)
    except ValueError: pass
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None: parsed=parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (ValueError,OverflowError):
        return None

def _safe_error_id(value):
    return value if isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,120}',value) else ''

def _http_error_message(exc, url, data=None):
    """Expose only machine-readable diagnostics; never echo response text or credentials."""
    try:
        raw=exc.read(65536)
        body=json.loads(raw.decode('utf8')) if raw else {}
    except Exception:
        body={}
    root=body if isinstance(body,dict) else {}
    if isinstance(root.get('error'),dict): root=root['error']
    elif isinstance(root.get('detail'),dict): root=root['detail']
    code=root.get('error') if isinstance(root.get('error'),str) else root.get('code')
    if not isinstance(code,str): code=root.get('type')
    reason=root.get('error_reason') or root.get('reason')
    param=root.get('param')
    grant=''
    if isinstance(data,(bytes,bytearray)):
        try: grant=urllib.parse.parse_qs(data.decode('ascii')).get('grant_type',[''])[0]
        except Exception: pass
    path=urllib.parse.urlsplit(url).path
    if url==TOKEN and grant=='refresh_token': stage='TOKEN_REFRESH'
    elif url==TOKEN and grant=='authorization_code': stage='TOKEN_EXCHANGE'
    elif url==API+'/models': stage='MODEL_CATALOG'
    elif url==API+'/responses': stage='RESPONSES_API'
    elif url==JWKS: stage='IDENTITY_KEYS'
    elif path.endswith('/.well-known/openid-configuration'): stage='OIDC_DISCOVERY'
    else: stage='CHATGPT_SERVICE'
    parts=[stage+': HTTP '+str(exc.code)]
    safe_code=_safe_error_id(code)
    safe_reason=_safe_error_id(reason)
    safe_param=_safe_error_id(param)
    request_id=''
    try: request_id=_safe_error_id(exc.headers.get('x-request-id') or exc.headers.get('request-id'))
    except Exception: pass
    if safe_code: parts.append('error='+safe_code)
    if safe_reason: parts.append('reason='+safe_reason)
    if safe_param: parts.append('param='+safe_param)
    if request_id: parts.append('requestId='+request_id)
    return '; '.join(parts)

def _request_json(url, *, method='GET', data=None, headers=None, timeout=20, limit=2_000_000):
    req=urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req,timeout=timeout) as resp:
            body=resp.read(limit+1)
            if len(body)>limit:raise ValueError('پاسخ سرویس از حجم مجاز بیشتر است.')
            return json.loads(body)
    except urllib.error.HTTPError as e:
        raise RuntimeError(_http_error_message(e,url,data)) from None

def _load():
    if os.name!='nt' or not VAULT.exists():return {}
    value=json.loads(ai_connection._dpapi(VAULT.read_bytes(),True).decode('utf8'))
    return value if isinstance(value,dict) else {}

def _save(value):
    if os.name!='nt':raise RuntimeError('ذخیرهٔ امن حساب ChatGPT فقط در نسخهٔ نصب‌شدهٔ ویندوز فعال است.')
    vault.DATA_ROOT.mkdir(parents=True,exist_ok=True)
    raw=ai_connection._dpapi(json.dumps(value,ensure_ascii=False).encode('utf8'))
    temp=VAULT.with_suffix('.tmp')
    try:
        with open(temp,'wb') as f:
            f.write(raw);f.flush();os.fsync(f.fileno())
        os.replace(temp,VAULT)
    finally:temp.unlink(missing_ok=True)

def _host_id():
    if HOST_FILE.is_file():
        try:
            d=json.loads(HOST_FILE.read_text(encoding='utf8'))
            if str(d['id']).startswith('urn:uuid:') and uuid.UUID(d['id'][9:]):return d['id']
        except (ValueError,KeyError,TypeError):pass
        raise RuntimeError('شناسهٔ نصب محلی نامعتبر است؛ برای حفظ اتصال قبلی بازنویسی نمی‌شود.')
    vault.DATA_ROOT.mkdir(parents=True,exist_ok=True)
    value='urn:uuid:'+str(uuid.uuid4())
    temp=HOST_FILE.with_suffix('.new')
    try:
        temp.write_text(json.dumps({'id':value}),encoding='utf8')
        os.replace(temp,HOST_FILE)
    finally:temp.unlink(missing_ok=True)
    return value


def verify_id_token(id_token,client_id,nonce,jwks):
    """Fail-closed RS256 / PKCS#1 v1.5 verifier, strict OIDC claim checks.

    Uses Python integers to check the standard SHA-256 ASN.1 encoded digest.
    This intentionally has no permissive alg fallbacks and no remote key URLs.
    """
    if not isinstance(id_token,str) or len(id_token)>20000:raise ValueError('شناسهٔ توکن نامعتبر است.')
    parts=id_token.split('.')
    if len(parts)!=3:raise ValueError('قالب امضای هویت نامعتبر است.')
    header=json.loads(_unb64(parts[0])); claims=json.loads(_unb64(parts[1]))
    if not isinstance(header,dict) or header.get('alg')!='RS256' or not isinstance(header.get('kid'),str):
        raise ValueError('الگوریتم امضای شناسهٔ هویت تأیید نمی‌شود.')
    if not isinstance(claims,dict):raise ValueError('دادهٔ هویت نامعتبر است.')
    keys=jwks.get('keys',[]) if isinstance(jwks,dict) else []
    matches=[k for k in keys if isinstance(k,dict) and k.get('kid')==header['kid'] and k.get('kty')=='RSA' and k.get('use','sig')=='sig']
    if len(matches)!=1:raise ValueError('کلید امضای OpenAI پیدا نشد یا مبهم است.')
    k=matches[0]
    n=int.from_bytes(_unb64(k['n']),'big');e=int.from_bytes(_unb64(k['e']),'big')
    size=(n.bit_length()+7)//8
    if not 256<=size<=1024 or e<3 or e%2==0 or e>=2**32:raise ValueError('مشخصات کلید RSA معتبر نیست.')
    sig=_unb64(parts[2]);
    if len(sig)!=size or int.from_bytes(sig,'big')>=n:raise ValueError('طول امضای توکن نامعتبر است.')
    em=pow(int.from_bytes(sig,'big'),e,n).to_bytes(size,'big')
    # ASN.1 DigestInfo for SHA-256, RFC 8017 / PKCS#1 v1.5
    digest_info=bytes.fromhex('3031300d060960864801650304020105000420')+hashlib.sha256((parts[0]+'.'+parts[1]).encode('ascii')).digest()
    if not em.startswith(b'\x00\x01') or b'\x00' not in em[2:]:raise ValueError('امضای هویت پذیرفته نشد.')
    split=em.find(b'\x00',2)
    if split<10 or any(x!=0xff for x in em[2:split]) or not hmac.compare_digest(em[split+1:],digest_info):
        raise ValueError('امضای هویت پذیرفته نشد.')
    now=int(time.time())
    aud=claims.get('aud')
    if not (aud==client_id or (isinstance(aud,list) and client_id in aud)):
        raise ValueError('مخاطب توکن با برنامه تطابق ندارد.')
    if isinstance(aud,list) and len(aud)>1 and claims.get('azp')!=client_id:
        raise ValueError('شناسهٔ مشتری مجاز نامعتبر است.')
    if claims.get('iss')!=ISSUER or not isinstance(claims.get('sub'),str) or not claims['sub']:
        raise ValueError('صادرکننده یا شناسهٔ هویت معتبر نیست.')
    if not isinstance(claims.get('exp'),(int,float)) or claims['exp']<now-30:
        raise ValueError('توکن هویت منقضی شده است.')
    if 'nbf' in claims and (not isinstance(claims['nbf'],(int,float)) or claims['nbf']>now+60):
        raise ValueError('توکن هویت هنوز معتبر نشده است.')
    if 'iat' in claims and (not isinstance(claims['iat'],(int,float)) or claims['iat']>now+60):
        raise ValueError('زمان صدور توکن معتبر نیست.')
    if not isinstance(claims.get('nonce'),str) or not hmac.compare_digest(claims['nonce'],nonce):
        raise ValueError('nonce توکن هویت تطابق ندارد.')
    return {'subject':claims['sub'],'email':str(claims.get('email',''))[:255]}


def _public_status():
    with LOCK:
        try: profile=_load()
        except Exception:return {'connected':False,'permission':False,'error':'دادهٔ امن حساب قابل خواندن نیست.','provider':'chatgpt-plan'}
    scopes=set(profile.get('scope','').split())
    active=bool(profile.get('client_id') and profile.get('subject') and profile.get('refresh_token'))
    permission=active and {'resource.invoke','chatgpt.tokens.use.direct'}.issubset(scopes)
    now=time.time()
    try: expires_at=float(profile.get('saved_at',0))+float(profile.get('expires_in',0))
    except (TypeError,ValueError): expires_at=0
    earliest=_epoch_time(profile.get('earliest_refresh_at'))
    return {'connected':active,'permission':permission,'provider':'chatgpt-plan','email':profile.get('email','') if active else '',
            'model':profile.get('model','') if permission else '',
            'expired':now>=expires_at if active else False,
            'refreshReady':earliest is None or now>=earliest if active else False,
            'message':'متصل به سهمیهٔ ChatGPT' if permission else ('ورود انجام شده، ولی مجوز استفاده از سهمیه فعال نیست.' if active else 'برای اتصال بدون کلید API، با حساب ChatGPT وارد شو.')}

def status():return _public_status()


def start_login():
    global ATTEMPT
    if os.name!='nt':raise RuntimeError('این اتصال فقط در نصب ویندوزی مَدار فعال است.')
    with LOCK:
        if ATTEMPT and time.monotonic()<ATTEMPT['deadline']:
            raise RuntimeError('یک پنجرهٔ ورود فعال است؛ ابتدا آن را تکمیل یا بسته کن.')
        profile=_load()
        client_id=profile.get('client_id') or profile.get('pending_client_id') or 'dynamic_agent_client'
        verifier=_b64u(secrets.token_bytes(48))
        nonce=_b64u(secrets.token_bytes(32));state=_b64u(secrets.token_bytes(32))
        # Allow only 127.0.0.1; no credential-bearing callback to remote origins.
        class Callback(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):
                parsed=urllib.parse.urlsplit(self.path)
                if parsed.path!='/auth/callback':self.send_error(404);return
                try:
                    result=_complete_callback(urllib.parse.parse_qs(parsed.query),attempt)
                    success=result['connected'] and result['permission']
                    title='اتصال ChatGPT انجام شد' if success else 'مجوز استفاده از ChatGPT صادر نشد'
                    message='به پنجرهٔ مَدار برگرد و وضعیت اتصال را نوسازی کن.'
                except Exception:
                    # A consumed one-time OAuth attempt must not lock the next login.
                    if attempt.get('used'):
                        global ATTEMPT
                        with LOCK:
                            if ATTEMPT is attempt:ATTEMPT=None
                    title='ورود ChatGPT تکمیل نشد'
                    message='برای حفظ امنیت، اتصال فعال نشد. در مَدار دوباره تلاش کن.'
                body=('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>مَدار — اتصال</title>'
                     '<body style="font:18px system-ui;background:#f8fafc;color:#1f2937;padding:50px"><h2>'+title+'</h2><p>'+message+'</p></body></html>').encode('utf8')
                self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Cache-Control','no-store');self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'")
                self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
                threading.Thread(target=self.server.shutdown,daemon=True).start()
        server=ThreadingHTTPServer(('127.0.0.1',0),Callback)
        redirect='http://127.0.0.1:'+str(server.server_port)+'/auth/callback'
        attempt={'state':state,'nonce':nonce,'verifier':verifier,'redirect':redirect,
                 'client_id':client_id,'deadline':time.monotonic()+600,'server':server,'used':False,
                 'old_subject':profile.get('subject') if client_id!='dynamic_agent_client' else None}
        ATTEMPT=attempt
        def worker():
            try:server.serve_forever(poll_interval=.25)
            finally:server.server_close()
        threading.Thread(target=worker,daemon=True).start()
        def timeout():
            time.sleep(605)
            with LOCK:
                if ATTEMPT is attempt:
                    server.shutdown()
        threading.Thread(target=timeout,daemon=True).start()
        params={'response_type':'code','client_id':client_id,'redirect_uri':redirect,'scope':SCOPES,
             'resource':RESOURCE,'state':state,'nonce':nonce,
             'code_challenge':_b64u(hashlib.sha256(verifier.encode('ascii')).digest()),'code_challenge_method':'S256',
             'ext_agent_host_id':_host_id()}
        if client_id=='dynamic_agent_client':params['agent_name_hint']=NAME
        else:
            if profile.get('id_token'):params['id_token_hint']=profile['id_token']
            if profile.get('email'):params['login_hint']=profile['email']
        return {'authorizeUrl':AUTHORIZE+'?'+urllib.parse.urlencode(params),
                'message':'مرورگر رسمی ChatGPT باز می‌شود؛ فقط در صورت رضایت تو از سهمیه استفاده خواهد شد.'}


def _complete_callback(query, attempt):
    global ATTEMPT
    with LOCK:
        if attempt is not ATTEMPT or attempt['used'] or time.monotonic()>attempt['deadline']:
            raise RuntimeError('نشست ورود معتبر نیست.')
        supplied=query.get('state',[''])[0]
        if not isinstance(supplied,str) or not hmac.compare_digest(supplied,attempt['state']):
            raise RuntimeError('state برگشتی نادرست است.')
        attempt['used']=True
        if query.get('error'):raise RuntimeError('کاربر ورود را نپذیرفت.')
        code=query.get('code',[''])[0]
        if not isinstance(code,str) or not 8<len(code)<4096:raise RuntimeError('کد ورود معتبر نیست.')
        callback_client=query.get('client_id',[''])[0]
        old_client=attempt['client_id']
        if old_client=='dynamic_agent_client':
            if not re.fullmatch(r'oaiapp_[A-Za-z0-9_-]{4,120}',callback_client):
                raise RuntimeError('OpenAI شناسهٔ مشتری جدید را برنگرداند.')
            client_id=callback_client
        else:
            if callback_client and callback_client!=old_client:raise RuntimeError('ثبت مشتری غیرمنتظره است.')
            client_id=old_client
        # Save issued client ID even if the one-time code exchange later expires.
        prior=_load()
        if old_client=='dynamic_agent_client':
            prior['pending_client_id']=client_id
            _save(prior)
    payload=urllib.parse.urlencode({'grant_type':'authorization_code','client_id':client_id,'code':code,
                       'code_verifier':attempt['verifier'],'redirect_uri':attempt['redirect'],'resource':RESOURCE}).encode('ascii')
    token=_request_json(TOKEN,method='POST',data=payload,headers={'Content-Type':'application/x-www-form-urlencoded'},timeout=25)
    if not isinstance(token,dict) or not isinstance(token.get('id_token'),str):raise RuntimeError('هویت قابل‌تأیید دریافت نشد.')
    identity=verify_id_token(token['id_token'],client_id,attempt['nonce'],_request_json(JWKS))
    if attempt['old_subject'] and identity['subject']!=attempt['old_subject']:
        raise RuntimeError('حساب جدید با اتصال قبلی سازگار نیست.')
    scope=token.get('scope','')
    if not isinstance(scope,str):raise RuntimeError('مجوزهای ورود معتبر نیستند.')
    record={'client_id':client_id,'ext_agent_host_id':_host_id(),**identity,
       'access_token':token.get('access_token',''),'refresh_token':token.get('refresh_token',''),
       'id_token':token['id_token'],'scope':scope,'saved_at':time.time(),
       'expires_in':token.get('expires_in',3600),'model':prior.get('model','')}
    earliest=token.get('earliest_refresh_at')
    if isinstance(earliest,(str,int,float)) and not isinstance(earliest,bool):
        record['earliest_refresh_at']=earliest
    if not isinstance(record['access_token'],str) or not isinstance(record['refresh_token'],str) or not record['refresh_token']:
        raise RuntimeError('مجوز قابل‌نوسازی صادر نشد.')
    with LOCK:
        _save(record)
        if ATTEMPT is attempt:ATTEMPT=None
    return _public_status()


def active():
    try:return bool(_public_status()['permission'])
    except Exception:return False


def _session():
    with LOCK:
        d=_load()
        if not d.get('refresh_token') or not {'resource.invoke','chatgpt.tokens.use.direct'}.issubset(set(d.get('scope','').split())):
            raise RuntimeError('ابتدا با حساب ChatGPT وارد شو و مجوز استفاده از سهمیه را صادر کن.')
        now=time.time()
        try: expires_at=float(d.get('saved_at',0))+float(d.get('expires_in',0))
        except (TypeError,ValueError): expires_at=0
        # Follow the SIWC refresh window: wait until both the near-expiry window
        # and OpenAI's earliest_refresh_at have been reached.
        if now < expires_at-60:return d
        earliest=_epoch_time(d.get('earliest_refresh_at'))
        if earliest is not None and now < earliest:
            if now >= expires_at:
                wait=max(1,int(earliest-now))
                raise RuntimeError('REFRESH_NOT_READY: توکن دسترسی منقضی شده است؛ زمان مجاز نوسازی OpenAI حدود '+str(wait)+' ثانیهٔ دیگر فرا می‌رسد.')
            return d
        form=urllib.parse.urlencode({'grant_type':'refresh_token','client_id':d['client_id'],
            'refresh_token':d['refresh_token'],'resource':RESOURCE}).encode('ascii')
        try:
            response=_request_json(TOKEN,method='POST',data=form,headers={'Content-Type':'application/x-www-form-urlencoded'})
        except RuntimeError as exc:
            message=str(exc)
            if 'TOKEN_REFRESH: HTTP 400' in message and re.search(r'\berror=invalid_grant\b',message):
                # OpenAI classifies invalid_grant as an unusable refresh credential.
                # Remove only the rejected token set; retain the issued client ID and
                # account hints so the next browser sign-in reuses the same SIWC client.
                retained={key:d[key] for key in ('client_id','subject','email','id_token','ext_agent_host_id','model') if d.get(key)}
                retained['pending_client_id']=d['client_id']
                _save(retained)
                request_id=re.search(r'requestId=([A-Za-z0-9_.:-]+)',message)
                suffix=(' requestId='+request_id.group(1)) if request_id else ''
                raise RuntimeError('CHATGPT_REAUTH_REQUIRED: توکن نوسازی قبلی از سوی OpenAI رد شد؛ برای ادامه یک‌بار با همان حساب ChatGPT دوباره وارد شو.'+suffix) from None
            raise
        if not isinstance(response,dict) or not response.get('access_token') or not response.get('refresh_token'):
            raise RuntimeError('نوسازی مجوز ChatGPT موفق نبود؛ دوباره وارد شو.')
        d.update({'access_token':response['access_token'],'refresh_token':response['refresh_token'],
            'scope':response.get('scope',d['scope']),'saved_at':time.time(),'expires_in':response.get('expires_in',3600)})
        # A successful rotation replaces the previous timing hint as well.
        d.pop('earliest_refresh_at',None)
        refreshed_earliest=response.get('earliest_refresh_at')
        if isinstance(refreshed_earliest,(str,int,float)) and not isinstance(refreshed_earliest,bool):
            d['earliest_refresh_at']=refreshed_earliest
        _save(d)
        return d


def models():
    account=_session()
    data=_request_json(API+'/models',headers={'Authorization':'Bearer '+account['access_token']},timeout=25)
    if not isinstance(data,dict) or not isinstance(data.get('models'),list):
        raise RuntimeError('MODEL_CATALOG_INVALID: پاسخ فهرست مدل‌های ChatGPT ساختار معتبر ندارد.')
    return [{'slug':x['slug'],'name':str(x.get('display_name') or x['slug'])[:100]} for x in data['models']
        if isinstance(x,dict) and x.get('visibility')=='list' and isinstance(x.get('slug'),str) and re.fullmatch(r'[A-Za-z0-9._:-]{1,96}',x['slug'])][:150]


def choose_model(model):
    if not isinstance(model,str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,96}',model):raise ValueError('شناسهٔ مدل معتبر نیست.')
    if model not in [x['slug'] for x in models()]:raise ValueError('این مدل در حساب ChatGPT مجاز نیست.')
    with LOCK:
        d=_load();d['model']=model;_save(d)
    return _public_status()


def credential(model=''):
    d=_session()
    chosen=model or d.get('model','')
    if model and model!=d.get('model',''):
        raise RuntimeError('مدل باید نخست از فهرست مدل‌های مجاز انتخاب و ذخیره شود.')
    if not re.fullmatch(r'[A-Za-z0-9._:-]{1,96}',chosen):
        raise RuntimeError('مدل را از فهرست مدل‌های مجاز حساب انتخاب کن.')
    return d['access_token'],chosen


def stream_response(payload, *, timeout=150):
    """SIWC contract: only public Responses API, store=false, stream=true.
    Success requires response.completed, not an HTTP 200 or an SSE delta alone.
    """
    token,model=credential(str(payload.get('model','')))
    allowed={'model','input','instructions','tools'}
    body={k:v for k,v in payload.items() if k in allowed}
    body.update({'model':model,'store':False,'stream':True})
    req=urllib.request.Request(API+'/responses',data=json.dumps(body,ensure_ascii=False).encode('utf8'),
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
    deltas=[];completed=None
    try:
        with urllib.request.urlopen(req,timeout=timeout) as resp:
            while True:
                line=resp.readline(5_000_001)
                if not line:break
                if len(line)>5_000_000:raise RuntimeError('بخش پاسخ مدل بیش از حد بزرگ است.')
                if not line.startswith(b'data:'):continue
                fragment=line[5:].strip()
                if fragment==b'[DONE]':continue
                event=json.loads(fragment.decode('utf8'))
                tp=event.get('type')
                if tp=='response.output_text.delta':
                    val=event.get('delta','')
                    if isinstance(val,str):deltas.append(val)
                    if sum(map(len,deltas))>100_000:raise RuntimeError('پاسخ متن بیش از حد مجاز است.')
                elif tp=='response.completed':completed=event.get('response') or {}
                elif tp in ('response.failed','response.incomplete','error'):
                    raise RuntimeError('مدل درخواست را تکمیل نکرد؛ وضعیت مصرف حساب را بررسی کن.')
    except urllib.error.HTTPError as e:
        raise RuntimeError(_http_error_message(e,API+'/responses',json.dumps(body,ensure_ascii=False).encode('utf8'))) from None
    if completed is None:raise RuntimeError('اتصال پیش از دریافت response.completed قطع شد؛ هیچ نتیجه‌ای تأیید نمی‌شود.')
    text=''.join(deltas)
    if not text:
        for item in completed.get('output',[]):
            for c in item.get('content',[]) if isinstance(item,dict) else []:
                if c.get('type')=='output_text':text+=c.get('text','')
    if not text:raise RuntimeError('مدل خروجی متنی معتبری برنگرداند.')
    return {'id':str(completed.get('id','')),'model':str(completed.get('model') or model),
            'output_text':text,'complete':True}


def disconnect():
    with LOCK:
        d=_load()
        if not d:return _public_status()
        token=d.get('refresh_token');client=d.get('client_id')
        # Revoke best-effort, but never retain a locally signed-out token.
        revoked=False
        if token and client:
            try:
                info=_request_json(ISSUER+'/.well-known/openid-configuration')
                revocation=info.get('revocation_endpoint','')
                if revocation.startswith(ISSUER+'/'):
                    req=urllib.request.Request(revocation,data=urllib.parse.urlencode({
                        'token':token,'token_type_hint':'refresh_token','client_id':client}).encode('ascii'),
                        headers={'Content-Type':'application/x-www-form-urlencoded'},method='POST')
                    with urllib.request.urlopen(req,timeout=10) as resp:revoked=resp.status==200
            except Exception:pass
        _save({'client_id':client,'pending_client_id':client,'subject':d.get('subject'),
               'ext_agent_host_id':d.get('ext_agent_host_id'),'model':''})
        return {**_public_status(),'remotelyRevoked':revoked}
