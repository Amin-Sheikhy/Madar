# v4.54 candidate test status

Build identity: `v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D`

The v4.54 candidate is on `codex/v4.54-storage-root`. It is not merged into `main` and is not a published GitHub Release. The successful CI run is [43759871847](https://github.com/Amin-Sheikhy/Madar/actions/runs/43759871847).

| Check | Status | Notes |
|---|---|---|
| Build identity and server health version agree | PASS | `BUILD.txt`, `/api/health`, and server startup banner report v4.54; covered by unit tests and the generated payload. | `BUILD.txt`, `/api/health`, and server startup banner are expected to report v4.54. |
| Overlay files match the application source byte-for-byte | PASS | The one-click builder compares all four embedded files with `app/`. | The one-click builder checks the four embedded files against `app/`. |
| Exact baseline manifest for v4.49–v4.52 | PASS | Baseline hashes were checked against the archived v4.49–v4.52 source packages; the updater checks all four target files before writing. | Hashes were derived from the corresponding version source packages. |
| v4.54 storage-path unit tests | PASS | Installed layout, source-checkout fallback, and explicit data-folder override. | Installed layout, source-checkout fallback, and explicit data-folder override. |
| Payload integrity unit tests | PASS | Checks version label, four overlay files, and absence of a maintainer-specific path in app code. | Checks version label, four overlay files, and absence of a maintainer-specific path in app code. |
| Python compilation | PASS | `app`, `tests`, `repair453`, and `repair454`. | `app`, `tests`, `repair453`, and `repair454`. |
| JavaScript syntax | PASS | Node.js 22 syntax validation completed. | Node.js checks the app and repair overlay source. |
| PowerShell syntax | PASS | Both v4.53 and v4.54 updater scripts and the v4.54 bootstrap parsed successfully. | Both v4.53 and v4.54 updater scripts and the v4.54 bootstrap. |
| Windows x64 PE32+ installer build | PASS | MinGW-w64 produced a 48,746-byte PE32+ x64 GUI executable; it imports only KERNEL32.dll. | Cross-build uses MinGW-w64 and the repository's freestanding Windows launcher. |
| Embedded ZIP path/count/hash verification | PASS | Exact five-entry ZIP, marker, embedded SHA-256, and payload contents verified by the builder and rechecked after download. | Build script validates exact entries, ZIP integrity, and SHA-256. |
| Artifact upload to GitHub Actions | PASS | `Madar454-OneClick-D` artifact uploaded; expires 2026-12-15. | Build artifact only; no GitHub Release is created. |
| PowerShell update execution on target Windows | NOT_TESTED | Requires a real Windows installation and exact supported baseline. |
| v4.49–v4.52 upgrade acceptance on the user's PC | NOT_TESTED | The updater must be exercised on the actual installation before declaring installation PASS. |
| Full browser UI regression | NOT_TESTED | Not covered by the source workflow. |
| End-to-end AI course coaching with a real PDF | NOT_TESTED | Not part of the storage-root update acceptance. |
| Independent security audit / penetration test | NOT_TESTED | No such audit is claimed. |

## Built installer identity

- File: `Madar454-OneClick-D.exe`
- Size: 48,746 bytes
- SHA-256: `6062cd67b677eb234f8392685bb1fd5d768aa050209b53c1c5026b575e17fc81`
- GitHub Actions artifact: `Madar454-OneClick-D` (artifact ID `14180046481`)

## Update safety boundary

- The one-click updater accepts only exact known v4.49, v4.50, v4.51, and v4.52 file baselines.
- v4.48 and v4.53 are deliberately rejected because its original default storage root differs; a separate migration must be designed rather than silently redirecting existing data.
- The updater replaces only `BUILD.txt`, `madar_launcher.py`, `vault_server.py`, and `madar_ai_server.py`.
- It creates a program-file backup under `Backups`; it does not copy, move, delete, or rewrite learner records or managed PDFs.
- It verifies the active `Data` and `Books` paths through the local loopback API after restart.
- Reports remain local under `Reports`; no automatic upload is performed.
- A successful Linux CI build is not proof that the updater has run successfully on the user's Windows machine.