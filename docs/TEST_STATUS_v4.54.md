# v4.54 candidate test status

Build identity: `v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D`

The original v4.54 candidate is on `codex/v4.54-storage-root`. The PDF-module updater repair is isolated on `codex/v4.54-fix-pdf-module-updater`; neither branch is merged into `main`, and neither is a published GitHub Release. The repaired branch passed GitHub Actions run [#82](https://github.com/Amin-Sheikhy/Madar/actions/runs/43790673415). The original pre-fix artifact is superseded for v4.52 upgrades.

| Check | Status | Notes |
|---|---|---|
| Build identity and server health version agree | PASS | `BUILD.txt`, `/api/health`, and server startup banner report v4.54. |
| Overlay files match the application source byte-for-byte | PASS | Builder compares all five embedded files, including `local_pdf.py`, byte-for-byte with `app/`. |
| Exact baseline manifest for v4.49–v4.52 | PASS | Four core files retain exact SHA-256 checks; known legacy hashes are retained for v4.51/v4.52. The user's observed `local_pdf.py` hash (`cd4c310e…680596`) exactly equals the v4.54 target payload hash and is classified `ALREADY_TARGET`; v4.49/v4.50 use a guarded structural preflight. |
| v4.54 storage-path unit tests | PASS | Installed layout, source-checkout fallback, and explicit data-folder override. |
| PDF module migration preflight | PASS (static) | The guard recognizes the user's exact target-module hash (`cd4c310e…680596`) as `ALREADY_TARGET`; it also checks known legacy v4.51/v4.52 hashes. v4.49/v4.50 require expected PDF helper functions or an absent module, and unknown `delete_book` implementations are rejected. |
| Payload integrity unit tests | PASS | Version label, five overlay files, managed-book deletion safety, and absence of a maintainer-specific path in app code. |
| Python compilation | PASS | `app`, `tests`, `repair453`, and `repair454`, including the added PDF payload. |
| JavaScript syntax | PASS | Node.js 22 syntax validation completed. |
| PowerShell syntax | PASS | v4.53 updater, repaired v4.54 updater, and v4.54 bootstrap parsed successfully. |
| Windows x64 PE32+ installer build | PASS | 51,716-byte PE32+ x64 GUI executable; CI verified the expected `KERNEL32.dll`-only imports. |
| Embedded ZIP integrity | PASS | Six expected entries (installer plus five program files), marker, embedded SHA-256, and payload contents verified by the builder and independently rechecked. |
| GitHub Actions artifact upload | PASS | Artifact `Madar454-OneClick-D` (ID `14191934069`) uploaded; expires 2026-12-16. |
| PDF module migration execution on target Windows | NOT_TESTED | The migration guard has not been executed against a real Windows v4.49–v4.52 installation. |
| PowerShell update execution on target Windows | NOT_TESTED | Requires a real Windows installation and supported baseline. |
| v4.49–v4.52 upgrade acceptance on the user's PC | NOT_TESTED | Must be exercised on the actual installation before installation can be marked PASS. |
| Full browser UI regression | NOT_TESTED | Not covered by the source workflow. |
| End-to-end AI course coaching with a real PDF | NOT_TESTED | Not part of the storage-root update acceptance. |
| Independent security audit / penetration test | NOT_TESTED | No such audit is claimed. |

## Repaired installer identity — CI PASS

- File: `Madar454-OneClick-D.exe`
- Size: 51,716 bytes
- SHA-256: `ea7efccb99a2d6b99fc726655cc5be919781d9e8ef48a8a93d72ddbda5b0a1c9`
- GitHub Actions run: [#82](https://github.com/Amin-Sheikhy/Madar/actions/runs/43790673415)
- GitHub Actions artifact: `Madar454-OneClick-D` (artifact ID `14191934069`; expires 2026-12-16)

## Original pre-fix installer identity (superseded)

- File: `Madar454-OneClick-D.exe`
- Size: 48,746 bytes
- SHA-256: `519c14cd02470034da07af50e15d1785ec4bea49a5ad0c0a2d5a64129f48165d`
- GitHub Actions artifact: `Madar454-OneClick-D` (artifact ID `14179863191`)

## Update safety boundary

- The one-click updater accepts exact known v4.49, v4.50, v4.51, and v4.52 core-file baselines, then separately validates the legacy `local_pdf.py` module.
- v4.48 and v4.53 are deliberately rejected: their original default storage roots differ from the v4.54 installation-root policy. v4.48 defaulted under `%LOCALAPPDATA%/Madar`; v4.53 source defaulted to `D:\Madar`. A separate migration must be designed rather than silently redirecting existing data.
- The updater replaces `BUILD.txt`, `madar_launcher.py`, `vault_server.py`, `madar_ai_server.py`, and `local_pdf.py`.
- Before replacing files, it checks the active `Data` and `Books` paths when the old service is running, and backs up all existing replaced program files under `Backups`. If `local_pdf.py` was absent on a supported v4.49/v4.50 layout, rollback removes the newly added module.
- It does not copy, move, delete, or rewrite learner records or managed PDFs.
- After restart, it verifies the v4.54 health response, static assets, and active `Data` and `Books` paths through loopback APIs.
- Reports remain local under `Reports`; no automatic upload is performed.
- A successful Linux CI build is not proof that the updater has run successfully on the user's Windows machine.