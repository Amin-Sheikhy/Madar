# v4.54 candidate test status

Build identity: `v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D`

The v4.54 candidate is being prepared on `codex/v4.54-storage-root`. It is not merged into `main` and is not a published GitHub Release.

| Check | Status | Notes |
|---|---|---|
| Build identity and server health version agree | PENDING | `BUILD.txt`, `/api/health`, and server startup banner are expected to report v4.54. |
| Overlay files match the application source byte-for-byte | PENDING | The one-click builder checks the four embedded files against `app/`. |
| Exact baseline manifest for v4.49–v4.53 | PENDING | Hashes were derived from the corresponding version source packages. |
| v4.54 storage-path unit tests | PENDING | Installed layout, source-checkout fallback, and explicit data-folder override. |
| Payload integrity unit tests | PENDING | Checks version label, four overlay files, and absence of a maintainer-specific path in app code. |
| Python compilation | PENDING | `app`, `tests`, `repair453`, and `repair454`. |
| JavaScript syntax | PENDING | Node.js checks the app and repair overlay source. |
| PowerShell syntax | PENDING | Both v4.53 and v4.54 updater scripts and the v4.54 bootstrap. |
| Windows x64 PE32+ installer build | PENDING | Cross-build uses GNU binutils and the repository's freestanding Windows launcher. |
| Embedded ZIP path/count/hash verification | PENDING | Build script validates exact entries, ZIP integrity, and SHA-256. |
| Artifact upload to GitHub Actions | PENDING | Build artifact only; no GitHub Release is created. |
| PowerShell update execution on target Windows | NOT_TESTED | Requires a real Windows installation and exact supported baseline. |
| v4.49–v4.53 upgrade acceptance on the user's PC | NOT_TESTED | The updater must be exercised on the actual installation before declaring installation PASS. |
| Full browser UI regression | NOT_TESTED | Not covered by the source workflow. |
| End-to-end AI course coaching with a real PDF | NOT_TESTED | Not part of the storage-root update acceptance. |
| Independent security audit / penetration test | NOT_TESTED | No such audit is claimed. |

## Update safety boundary

- The one-click updater accepts only exact known v4.49, v4.50, v4.51, v4.52, and v4.53 file baselines.
- v4.48 is deliberately rejected because its original default storage root differs; a separate migration must be designed rather than silently redirecting existing data.
- The updater replaces only `BUILD.txt`, `madar_launcher.py`, `vault_server.py`, and `madar_ai_server.py`.
- It creates a program-file backup under `Backups`; it does not copy, move, delete, or rewrite learner records or managed PDFs.
- It verifies the active `Data` and `Books` paths through the local loopback API after restart.
- Reports remain local under `Reports`; no automatic upload is performed.
- A successful Linux CI build is not proof that the updater has run successfully on the user's Windows machine.