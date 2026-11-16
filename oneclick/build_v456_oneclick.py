#!/usr/bin/env python3
"""Cross-build the Windows x64 Madar v4.56 SIWC reauthorization and build-label repair one-click installer."""
from __future__ import annotations
import base64, hashlib, io, shutil, struct, subprocess, zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
PROJECT=HERE.parent
BUILD=HERE/"build"
OUTPUT=PROJECT/"dist"/"Madar456-OneClick-D.exe"
MAGIC=b"MADAR456_ZIPEND!"

def run(*args: str) -> str:
    p=subprocess.run(args,cwd=HERE,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=False)
    if p.returncode: raise RuntimeError("Command failed ("+" ".join(args)+")\n"+p.stdout)
    return p.stdout

def make_payload() -> bytes:
    patch_dir=PROJECT/"repair456"/"patch"
    installer_path=PROJECT/"repair456"/"Install-Madar456-SIWC-Repair.ps1"
    names=("BUILD.txt","chatgpt_plan.py","madar_ai_server.py","chatgpt_ui.js","dashboard_v452.js","sw.js")
    installer=installer_path.read_text("utf-8")
    tokens={"BUILD.txt":"__HASH_BUILD__","chatgpt_plan.py":"__HASH_CHATGPT_PLAN__","madar_ai_server.py":"__HASH_SERVER__","chatgpt_ui.js":"__HASH_CHATGPT_UI__","dashboard_v452.js":"__HASH_DASHBOARD__","sw.js":"__HASH_SW__"}
    for name in names:
        patch_file=patch_dir/name
        source_file=PROJECT/"app"/name
        if not patch_file.is_file() or not source_file.is_file(): raise RuntimeError("Missing v4.56 payload file: "+name)
        data=patch_file.read_bytes()
        if data!=source_file.read_bytes(): raise RuntimeError("Payload differs from app source: "+name)
        token=tokens[name]
        if token not in installer: raise RuntimeError("Missing installer hash slot: "+token)
        installer=installer.replace(token,hashlib.sha256(data).hexdigest())
    if "__HASH_" in installer: raise RuntimeError("An unresolved file hash remains in the installer")
    entries=[(installer.encode("utf-8"),"Install-Madar456-SIWC-Repair.ps1")]
    entries += [(patch_dir/name,"patch/"+name) for name in names]
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for item,arcname in entries:
            archive.writestr(arcname,item) if isinstance(item,bytes) else archive.write(item,arcname)
    package=stream.getvalue()
    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        if archive.testzip() is not None or len(archive.namelist())!=7: raise RuntimeError("Embedded ZIP validation failed")
        if "__HASH_" in archive.read("Install-Madar456-SIWC-Repair.ps1").decode("utf-8"): raise RuntimeError("Unresolved embedded hash")
    return package

def build() -> None:
    if not (PROJECT/"app"/"BUILD.txt").read_text("utf-8").startswith("v4.56 "): raise RuntimeError("Not building from Madar v4.56")
    compiler=shutil.which("x86_64-w64-mingw32-gcc")
    if not compiler: raise RuntimeError("MinGW-w64 cross compiler is missing")
    objdump=shutil.which("x86_64-w64-mingw32-objdump") or shutil.which("objdump")
    if not objdump: raise RuntimeError("GNU objdump is required")
    BUILD.mkdir(exist_ok=True)
    package=make_payload()
    digest=hashlib.sha256(package).hexdigest()
    ps=(HERE/"bootstrap456.ps1").read_text("utf-8").replace("__PAYLOAD_SHA256__",digest)
    if "__PAYLOAD_SHA256__" in ps: raise RuntimeError("Failed to insert payload digest")
    encoded=base64.b64encode(ps.encode("utf-16le")).decode("ascii")
    command="-NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand "+encoded
    if len(command)>30000 or not command.isascii(): raise RuntimeError("Windows bootstrap command is too long or non-ASCII")
    (BUILD/"encoded_bootstrap456.h").write_text('#define MADAR456_BOOTSTRAP_ARGUMENTS "'+command+'"\n',encoding="ascii")
    obj=BUILD/"launcher456.obj"
    exe=BUILD/"Madar456-OneClick-D.exe"
    run(compiler,"-c","-O2","-Werror","-Wall","-fshort-wchar","-fno-stack-protector","-ffreestanding",
        "-fno-asynchronous-unwind-tables","-fno-builtin","-m64","-o",str(obj),"launcher456.c")
    run(compiler,"-nostdlib","-Wl,-e,mainCRTStartup","-Wl,--subsystem,windows","-Wl,--image-base,0x140000000",
        "-Wl,--no-insert-timestamp","-o",str(exe),str(obj),"-lkernel32")
    pe=exe.read_bytes()
    if pe[:2]!=b"MZ": raise RuntimeError("Missing Windows PE signature")
    off=struct.unpack_from("<I",pe,0x3C)[0]
    if pe[off:off+4]!=b"PE\0\0" or struct.unpack_from("<H",pe,off+4)[0]!=0x8664: raise RuntimeError("Invalid Windows x64 PE header")
    info=run(objdump,"-p",str(exe))
    if ("DLL Name: KERNEL32.dll" not in info or "Subsystem\t\t00000002" not in info or "CreateProcessW" not in info
        or "GetSystemDirectoryW" not in info or "WinExec" in info or "MSVCRT" in info or "ucrtbase" in info):
        raise RuntimeError("Unexpected PE imports or subsystem")
    disassembly=run(objdump,"-d",str(exe))
    if "lea    0x0(%rip),%rbx" in disassembly: raise RuntimeError("Invalid selfPath reference")
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_bytes(pe+package+MAGIC+struct.pack("<Q",len(package)))
    verify=OUTPUT.read_bytes()
    length=struct.unpack_from("<Q",verify,len(verify)-8)[0]
    assert verify[-24:-8]==MAGIC and length==len(package)
    embedded=verify[-24-length:-24]
    assert hashlib.sha256(embedded).hexdigest()==digest
    with zipfile.ZipFile(io.BytesIO(embedded)) as archive: assert archive.testzip() is None and len(archive.namelist())==7
    print("PASS Windows PE32+ x86-64 GUI, KERNEL32-only imports, embedded ZIP hash")
    print("Installer bytes:",len(verify))
    print("Installer SHA256:",hashlib.sha256(verify).hexdigest())
    print("Windows PowerShell execution: NOT_TESTED")

if __name__=="__main__": build()
