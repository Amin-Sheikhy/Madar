#!/usr/bin/env python3
"""Build the Windows x64 Madar one-click installer using local GNU binutils.

No network, Windows SDK, Go runtime, administrator privileges or signature is
needed to build. PE imports reference the real Windows KERNEL32.dll. The tiny
stub has no libc dependency; its verified ZIP overlay carries only the already
reviewed v4.54 launcher and storage-root overlay files.
"""
from __future__ import annotations

import base64
import hashlib
import io
import re
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
                       stderr=subprocess.STDOUT, check=True)
    return p.stdout


def convert_pcrel_coff(obj: Path) -> None:
    """Repair ELF→COFF mapping of RIP-relative relocations (type 2→4).

    The generated x64 source is freestanding PIE, so all COFF ADDR32
    relocations in .text originated as ELF PC32 (verified via readelf below).
    objcopy does not maintain this distinction automatically.
    """
    src = run("readelf", "-r", str(BUILD / "launcher-linux.o"))
    # ELF uses explicit RELA addends, whereas the COFF form puts each addend
    # into its four-byte displacement field. COFF REL32 is based at P+4, so
    # the correct field value is ELF_addend + 4, not always zero.
    elf_addends: dict[int, int] = {}
    for line in src.splitlines():
        if "R_X86_64_PC32" not in line:
            continue
        match = re.match(r"\s*([0-9a-fA-F]{8,16})\s+\S+\s+R_X86_64_PC32\s+\S+\s+.*?\s+([+-])\s+([0-9a-fA-F]+)\s*$", line)
        if not match:
            raise RuntimeError("Cannot decode ELF PC32 addend: " + line)
        off = int(match.group(1), 16)
        amount = int(match.group(3), 16)
        elf_addends[off] = amount if match.group(2) == "+" else -amount
    expected = len(elf_addends)
    if expected < 2 or re.search(r"R_X86_64_(GOT|32\b|64\b)", src):
        raise RuntimeError("Unexpected ELF relocation types; refusing PE conversion")
    b = bytearray(obj.read_bytes())
    sections = struct.unpack_from("<H", b, 2)[0]
    header = 20 + struct.unpack_from("<H", b, 16)[0]
    changed = 0
    # Keep global variables with named symbols to avoid objcopy's unrelated
    # ELF SECTION -> COFF FILE symbol mapping for local .bss references.
    for i in range(sections):
        off = header + 40 * i
        name = b[off:off + 8].rstrip(b"\0")
        if name != b".text":
            continue
        raw = struct.unpack_from("<I", b, off + 20)[0]
        reloc = struct.unpack_from("<I", b, off + 24)[0]
        count = struct.unpack_from("<H", b, off + 32)[0]
        for j in range(count):
            entry = reloc + 10 * j
            va = struct.unpack_from("<I", b, entry)[0]
            kind = struct.unpack_from("<H", b, entry + 8)[0]
            if kind == 2:  # IMAGE_REL_AMD64_ADDR32, incorrectly from ELF PC32
                if va not in elf_addends:
                    raise RuntimeError(f"Unexpected COFF ADDR32 at 0x{va:x}")
                struct.pack_into("<i", b, raw + va, elf_addends[va] + 4)
                struct.pack_into("<H", b, entry + 8, 4)  # IMAGE_REL_AMD64_REL32
                changed += 1
            elif kind != 4:
                raise RuntimeError(f"Unexpected PE .text relocation type {kind}")
    if changed != expected:
        raise RuntimeError(f"PE relocation mismatch: {changed} / {expected}")
    obj.write_bytes(b)


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
    run("as", "--64", "-o", str(BUILD / "kernel32stub-linux.o"), "kernel32stub.s")
    run("objcopy", "-O", "pe-x86-64", str(BUILD / "kernel32stub-linux.o"),
        str(BUILD / "kernel32stub.obj"))
    run("ld", "-m", "i386pep", "--dll", "-e", "0", "-o", str(BUILD / "kernel32stub.dll"),
        str(BUILD / "kernel32stub.obj"), "kernel32.def", "--out-implib", str(BUILD / "libkernel32.a"))
    run("gcc", "-c", "-O2", "-Werror", "-Wall", "-fshort-wchar", "-fno-stack-protector",
        "-ffreestanding", "-fno-asynchronous-unwind-tables", "-fpie", "-fno-builtin",
        "-m64", "-o", str(BUILD / "launcher-linux.o"), "launcher.c")
    run("objcopy", "--remove-section", ".comment", "--remove-section", ".note.GNU-stack",
        "-O", "pe-x86-64", str(BUILD / "launcher-linux.o"), str(BUILD / "launcher.obj"))
    convert_pcrel_coff(BUILD / "launcher.obj")
    run("ld", "-m", "i386pep", "-o", str(BUILD / "Madar454-OneClick-D.exe"),
        str(BUILD / "launcher.obj"), str(BUILD / "libkernel32.a"),
        "--subsystem", "windows", "-e", "mainCRTStartup", "--image-base", "0x140000000")
    pe = (BUILD / "Madar454-OneClick-D.exe").read_bytes()
    if pe[:2] != b"MZ":
        raise RuntimeError("Produced file lacks Windows PE signature")
    pe_off = struct.unpack_from("<I", pe, 0x3C)[0]
    if pe[pe_off:pe_off + 4] != b"PE\0\0" or struct.unpack_from("<H", pe, pe_off + 4)[0] != 0x8664:
        raise RuntimeError("Invalid Windows x64 PE header")
    info = run("objdump", "-p", str(BUILD / "Madar454-OneClick-D.exe"))
    if ("DLL Name: KERNEL32.dll" not in info or "Subsystem\t\t00000002" not in info
            or "CreateProcessW" not in info or "GetSystemDirectoryW" not in info
            or "WinExec" in info):
        raise RuntimeError("Unexpected PE subsystem or imports")
    disassembly = run("objdump", "-d", str(BUILD / "Madar454-OneClick-D.exe"))
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
    print("PASS Windows PE32+ x86-64 GUI, KERNEL32 imports, embedded ZIP hash")
    print("Installer bytes:", len(verify))
    print("Installer SHA256:", hashlib.sha256(verify).hexdigest())
    print("PowerShell Windows runtime: NOT_TESTED")


if __name__ == "__main__":
    build()
