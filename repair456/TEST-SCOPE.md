# v4.56 test scope

- Python compile and full unittest discovery.
- Regression tests for SIWC invalid_grant handling, safe token clearing, and transient-error preservation.
- Regression tests for dynamic BUILD.txt identity, dashboard version label, reauthorization UI state, and service-worker cache invalidation.
- Exact Git blob SHA-1 verification for the installed v4.55 baseline, executed by PowerShell in CI.
- PowerShell parser validation for the bootstrap and installer.
- JavaScript syntax checks for app and payload files.
- Windows x64 PE32+ cross-build, embedded payload SHA-256, archive integrity, and exact seven-entry manifest.
- User Windows runtime and DPAPI credential behavior remain NOT_TESTED until the user runs the EXE locally.
