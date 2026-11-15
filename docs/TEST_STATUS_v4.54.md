# v4.54 candidate test status

Build identity: `v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D`

The v4.54 candidate is on `codex/v4.54-storage-root`. It is not merged into `main` and is not a published GitHub Release. The successful CI build and artifact are available in [GitHub Actions run 43760254035](https://github.com/Amin-Sheikhy/Madar/actions/runs/43760254035).

| Check | Status | Notes |
|---|---|---|
| Build identity and server health version agree | PASS | `BUILD.txt`, `/api/health`, and server startup banner report v4.54. |
| Overlay files match the application source byte-for-byte | PASS | Builder compares all four embedded files with `app/`. |
| Exact baseline manifest for v4.49–v4.52 | PASS | Hashes cross-checked against the archived v4.49–v4.52 source packages; updater checks all four target files. |
| v4.54 storage-path unit tests | PASS | Installed layout, source-checkout fallback, and explicit data-folder override. |
| Payload integrity unit tests | PASS | Version label, four overlay files, and absence of a maintainer-specific path in app code. |
| Python compilation | PASS | `app`, `tests`, `repair453`, and `repair454`. |
| JavaScript syntax | PASS | Node.js 22 syntax validation completed. |
| PowerShell syntax | PASS | v4.53 updater, v4.54 updater, and v4.54 bootstrap parsed successfully. |
| Windows x64 PE32+ installer build | PASS | MinGW-w64 produced a 48,746-byte PE32+ x64 GUI executable; imports only `KERNEL32.dll`. |
| Embedded ZIP integrity | PASS | Five expected entries, marker, embedded SHA-256, and payload contents verified by builder and rechecked after download. |
| GitHub Actions artifact upload | PASS | `Madar454-OneClick-D` uploaded; expires 2026-12-15. |
| PowerShell update execution on target Windows | NOT_TESTED | Requires a real Windows installation and supported baseline. |
| v4.49–v4.52 upgrade acceptance on the user's PC | NOT_TESTED | Must be exercised on the actual installation before installation can be marked PASS. |
| Full browser UI regression | NOT_TESTED | Not covered by the source workflow. |
| End-to-end AI course coaching with a real PDF | NOT_TESTED | Not part of the storage-root update acceptance. |
| Independent security audit / penetration test | NOT_TESTED | No such audit is claimed. |

## Built installer identity

- File: `Madar454-OneClick-D.exe`
- Size: 48,746 bytes
- SHA-256: `519c14cd02470034da07af50e15d1785ec4bea49a5ad0c0a2d5a64129f48165d`
- GitHub Actions artifact: `Madar454-OneClick-D` (artifact ID `14179863191`)

## Update safety boundary

- The one-click updater accepts only exact known v4.49, v4.50, v4.51, and v4.52 file baselines.
- v4.48 and v4.53 are deliberately rejected: their original default storage roots differ from the v4.54 installation-root policy. v4.48 defaulted under `%LOCALAPPDATA%/Madar`; v4.53 source defaulted to `D:\Madar`. A separate migration must be designed rather than silently redirecting existing data.
- The updater replaces only `BUILD.txt`, `madar_launcher.py`, `vault_server.py`, and `madar_ai_server.py`.
- Before replacing files, it checks the active `Data` and `Books` paths when the old service is running, and backs up the four program files under `Backups`.
- It does not copy, move, delete, or rewrite learner records or managed PDFs.
- After restart, it verifies the v4.54 health response, static assets, and active `Data` and `Books` paths through loopback APIs.
- Reports remain local under `Reports`; no automatic upload is performed.
- A successful Linux CI build is not proof that the updater has run successfully on the user's Windows machine.