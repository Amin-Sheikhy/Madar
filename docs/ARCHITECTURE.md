# Architecture

## Application shape

Madar is a local web UI served by a Python process. The Windows launcher starts the service and opens the browser at the loopback address. The frontend is Persian RTL HTML, CSS, and JavaScript; backend features are implemented in Python and use a local SQLite-backed vault for user-managed records and files.

```text
Windows launcher
    └── Python local service (127.0.0.1:8765)
          ├── HTML/CSS/JS learning UI
          ├── local learning state and course views
          ├── SQLite-backed file/project vault
          ├── managed local PDF library (Books)
          ├── PDF extraction / quality / OCR capability checks
          ├── loopback API and Origin/Host validation
          └── optional AI provider/account-usage integration
```

## Main modules

- `app.js`, `extras.js`, `simple_nav.js`, `curriculum_tree.js`, `dashboard_v452.js`: application state/UI and learning overview/navigation.
- `mastery_core.js`, `ai_assessment.js`, `learning_quality.js`: mastery/progression and assessment-oriented modules.
- `knowledge_graph.js`: scientific knowledge network UI.
- `observer.js`: learning-observer workflows; media-derived content requires user-approved input.
- `vault_server.py`, `vault_ui.js`: local file/project vault.
- `local_pdf.py`, `pdf_simple.js`, `pdf_quality.py`, `source_course.py`, `ai_pdf_reader.py`, `ai_pdf_batch.py`, `ocr_jobs.py`: PDF library and reading/outline/quality workflows.
- `chatgpt_plan.py`, `chatgpt_ui.js`: Sign in with ChatGPT plan-usage connection path. It uses loopback OAuth with PKCE/state/nonce and local Windows DPAPI protection as implemented in source.
- `ai_connection.py`: local provider credential storage helpers (Windows DPAPI where applicable).
- `secure_backup.js`: user-triggered encrypted browser backup.
- `madar_ai_server.py`: local HTTP API, validation, and provider routing.

## Local storage layout

- `MADAR_HOME` is the explicit installation/runtime root override.
- In an installed layout (`<MADAR_HOME>/App/madar_launcher.py`), the launcher resolves the parent of `App` as the root. Program files live in `App`; runtime state and SQLite/DPAPI-backed credentials live in `Data`; managed PDFs live in the sibling `Books` folder; launcher logs, update backups, and diagnostic reports use `Logs`, `Backups`, and `Reports` under the same root.
- When launched from the source checkout (`app/`), the default root is `%LOCALAPPDATA%/Madar` on Windows (or `~/AppData/Local/Madar` if `LOCALAPPDATA` is unavailable), so running the public source does not create personal runtime data inside the repository.
- `MADAR_DATA_DIR` overrides the `Data` directory for advanced deployments. The managed `Books` directory is placed beside that configured data directory.

## Version boundary

The public `main` branch remains the v4.53 source snapshot. The `codex/v4.54-storage-root` working branch prepares v4.54. Its one-click overlay replaces only `BUILD.txt`, `madar_launcher.py`, `vault_server.py`, and `madar_ai_server.py`. It accepts exact hashes for known v4.49, v4.50, v4.51, and v4.52 baselines; v4.48, v4.53, unknown versions, and modified target files are rejected without replacement. Before activation it backs up the four program files, leaves `Data` and `Books` contents untouched, and after activation checks the reported version, dashboard/PDF assets, and the actual active `Data`/`Books` paths. If post-update checks fail, it attempts to restore the previous program files from `Backups`.
