#!/usr/bin/env python3
"""Cross-build the Windows x64 Madar one-click installer with MinGW-w64.

The launcher is freestanding and links only the Windows KERNEL32 import library:
no Windows SDK, Go runtime, C runtime, network access, or administrator rights
are needed to build. The EXE embeds a hash-verified ZIP overlay.
"""
from __future__ import annotations

import base64
import hashlib
import io
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
BUILD = HERE / "build"
OUTPUT = PROJECT / "dist" / "Madar454-OneClick-D.exe"
MAGIC = b"MADAR454_ZIPEND!"


def run(*args: str) -> str:
    p = subprocess.run(args, cwd=HERE, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, check=False)
    if p.returncode:
        raise RuntimeError(
            "Command failed (" + str(p.returncode) + "): " + " ".join(args) + "\\n" + p.stdout
        )
    return p.stdout




def make_payload() -> bytes:
    patch_dir = PROJECT / "repair454" / "patch"
    installer_path = PROJECT / "repair454" / "Install-Madar454-Storage-Root.ps1"
    names = ("BUILD.txt", "madar_launcher.py", "vault_server.py", "madar_ai_server.py")
    if not installer_path.is_file():
        raise RuntimeError("v4.54 update script is missing")
    installer = installer_path.read_text("utf-8")
    tokens = {
        "BUILD.txt": "__HASH_BUILD__",
        "madar_launcher.py": "__HASH_LAUNCHER__",
        "vault_server.py": "__HASH_VAULT__",
        "madar_ai_server.py": "__HASH_SERVER__",
    }
    for name in names:
        patch_file = patch_dir / name
        source_file = PROJECT / "app" / name
        if not patch_file.is_file() or not source_file.is_file():
            raise RuntimeError("Missing v4.54 payload file: " + name)
        patch_bytes = patch_file.read_bytes()
        if patch_bytes != source_file.read_bytes():
            raise RuntimeError("The one-click payload differs from the v4.54 app source: " + name)
        token = tokens[name]
        digest = hashlib.sha256(patch_bytes).hexdigest()
        if token not in installer:
            raise RuntimeError("Expected target hash token is missing: " + token)
        installer = installer.replace(token, digest)
    if "__HASH_" in installer:
        raise RuntimeError("An unresolved target-file hash remains in the installer")
    entries = [
        (installer.encode("utf-8"), "Install-Madar454-Storage-Root.ps1"),
        *((patch_dir / name, "patch/" + name) for name in names),
    ]
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for item, arcname in entries:
            if isinstance(item, bytes):
                z.writestr(arcname, item)
            else:
                z.write(item, arcname)
    package = blob.getvalue()
    with zipfile.ZipFile(io.BytesIO(package)) as z:
        if z.testzip() is not None or len(z.namelist()) != 5:
            raise RuntimeError("The v4.54 embedded package failed ZIP validation")
        if "__HASH_" in z.read("Install-Madar454-Storage-Root.ps1").decode("utf-8"):
            raise RuntimeError("The embedded installer contains unresolved file hashes")
    return package


def build() -> None:
    if not (PROJECT / "app" / "BUILD.txt").read_text("utf-8").startswith("v4.54 "):
        raise RuntimeError("Not building from Madar v4.54")
    compiler = shutil.which("x86_64-w64-mingw32-gcc")
    if not compiler:
        raise RuntimeError("MinGW-w64 cross compiler is missing; install gcc-mingw-w64-x86-64")
    objdump = shutil.which("x86_64-w64-mingw32-objdump") or shutil.which("objdump")
    if not objdump:
        raise RuntimeError("GNU objdump is required to verify the PE output")
    BUILD.mkdir(exist_ok=True)
    package = make_payload()
    digest = hashlib.sha256(package).hexdigest()
    ps = (HERE / "bootstrap.ps1").read_text("utf-8").replace("__PAYLOAD_SHA256__", digest)
    if "__PAYLOAD_SHA256__" in ps:
        raise RuntimeError("Failed to insert package digest")
    encoded = base64.b64encode(ps.encode("utf-16le")).decode("ascii")
    command = "-NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded
    if len(command) > 30000 or not command.isascii():
        raise RuntimeError("Windows launch command is too long or non-ASCII")
    (BUILD / "encoded_bootstrap.h").write_text(
        '#define MADAR454_BOOTSTRAP_ARGUMENTS "' + command + '"\n', encoding="ascii")
    object_file = BUILD / "launcher.obj"
    executable = BUILD / "Madar454-OneClick-D.exe"
    run(compiler, "-c", "-O2", "-Werror", "-Wall", "-fshort-wchar",
        "-fno-stack-protector", "-ffreestanding", "-fno-asynchronous-unwind-tables",
        "-fno-builtin", "-m64", "-o", str(object_file), "launcher.c")
    run(compiler, "-nostdlib", "-Wl,-e,mainCRTStartup", "-Wl,--subsystem,windows",
        "-Wl,--image-base,0x140000000", "-Wl,--no-insert-timestamp",
        "-o", str(executable), str(object_file), "-lkernel32")
    pe = executable.read_bytes()
    if pe[:2] != b"MZ":
        raise RuntimeError("Produced file lacks Windows PE signature")
    pe_off = struct.unpack_from("<I", pe, 0x3C)[0]
    if pe[pe_off:pe_off + 4] != b"PE\0\0" or struct.unpack_from("<H", pe, pe_off + 4)[0] != 0x8664:
        raise RuntimeError("Invalid Windows x64 PE header")
    info = run(objdump, "-p", str(executable))
    if ("DLL Name: KERNEL32.dll" not in info or "Subsystem\t\t00000002" not in info
            or "CreateProcessW" not in info or "GetSystemDirectoryW" not in info
            or "WinExec" in info or "MSVCRT" in info or "ucrtbase" in info):
        raise RuntimeError("Unexpected PE subsystem, imports, or C runtime dependency")
    disassembly = run(objdump, "-d", str(executable))
    if "lea    0x0(%rip),%rbx" in disassembly:
        raise RuntimeError("PE code references itself in place of selfPath")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(pe + package + MAGIC + struct.pack("<Q", len(package)))
    verify = OUTPUT.read_bytes()
    length = struct.unpack_from("<Q", verify, len(verify) - 8)[0]
    assert verify[-24:-8] == MAGIC and length == len(package)
    embedded = verify[-24-length:-24]
    assert hashlib.sha256(embedded).hexdigest() == digest
    with zipfile.ZipFile(io.BytesIO(embedded)) as z:
        assert z.testzip() is None and len(z.namelist()) == 5
    print("PASS Windows PE32+ x86-64 GUI, KERNEL32-only imports, embedded ZIP hash")
    print("Installer bytes:", len(verify))
    print("Installer SHA256:", hashlib.sha256(verify).hexdigest())
    print("Windows PowerShell execution: NOT_TESTED")


if __name__ == "__main__":
    build()
