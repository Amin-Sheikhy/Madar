# Madar — Local-first Persian Learning System

[نسخه فارسی (README.fa.md)](README.fa.md)

**Current source version:** `v4.53 14050824 SU GPT-6 BOOKS_DELETE_DIRECT_DOWNLOAD`  
**Repository:** [https://github.com/Amin-Sheikhy/Madar](https://github.com/Amin-Sheikhy/Madar)  
**License:** [MIT License](LICENSE) (`Copyright (c) 2026 Amin Sheikhy`)

Madar (مَدار) is a Persian-first, local-first learning and research workspace for Windows. It brings a learning dashboard, course progression and mastery records, scientific knowledge organization, skill mapping, local PDF library workflows, and optional AI-assisted learning into one application.

This repository is prepared for public technical review, including an application for OpenAI's Codex for Open Source program. **Madar is an independent project; it is not an official OpenAI product and no affiliation or endorsement is claimed.** Madar's original project source is licensed under the [MIT License](LICENSE); bundled third-party components retain their own licenses.

## What is in this source snapshot?

- `app/` — application frontend (HTML/CSS/JavaScript), local Python service, PDF/vault modules, and bundled `pypdf` source with its BSD-3-Clause license.
- `repair453/` — exact v4.53 overlay and one-click update PowerShell source for supported v4.51/v4.52 installations.
- `oneclick/` — source for the x64 Windows launcher and package builder; compiled executables and object files are intentionally omitted.
- `docs/` — architecture, privacy/security notes, test status, and OpenAI review context.
- `tests/` — isolated unit tests for managed-book deletion safeguards.

## Current v4.53 scope

- Simplified learning overview dashboard.
- Persian RTL UI and local course/learning data architecture.
- Local PDF opening and managed library controls.
- “My Books” open/delete controls. Delete removes only the app-managed copy in the Madar Books directory; the selected source file outside that directory is preserved.
- Loopback API endpoint for book deletion with origin checks and explicit confirmation.
- One-click update source supporting known v4.51 and v4.52 baseline hashes.

Some AI learning workflows and target-Windows runtime paths remain unverified. See [test status](docs/TEST_STATUS.md).

## Prerequisites and running from source

- **Prerequisites:** Python 3.10+ (CI uses Python 3.13); Node.js 22+ is only needed for optional JavaScript syntax checks.
- **Run the local server (verified in source):**
  ```bash
  git clone https://github.com/Amin-Sheikhy/Madar.git
  cd Madar
  python app/madar_launcher.py --server
  ```
  By default, the service binds to `127.0.0.1:8765` (overridable via `MADAR_PORT`). Set `MADAR_HOME` to choose the installation/data root. In an installed layout where the launcher is at `<MADAR_HOME>/App/madar_launcher.py`, the launcher automatically uses the parent of `App` as that root. A source checkout (`app/`) defaults to `%LOCALAPPDATA%/Madar` on Windows (or `~/AppData/Local/Madar` if `LOCALAPPDATA` is unavailable), keeping runtime data outside the repository. The runtime folders `Data`, `Books`, `Logs`, `Backups`, and `Reports` are stored beneath the selected root; `MADAR_DATA_DIR` can override the `Data` directory.
- **Run tests:**
  ```bash
  python -m compileall -q app tests repair453
  python -m unittest discover -s tests -v
  ```

Madar is not intended to expose its local service to a LAN or public network. Review [Privacy & Security](docs/PRIVACY_SECURITY.md) before running it.

## Reporting bugs and contributing

- **Bug reports:** Open an issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml) with your exact Madar version, reproduction steps, and sanitized logs only.
- **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Review material

- [Project architecture](docs/ARCHITECTURE.md)
- [Privacy and security boundaries](docs/PRIVACY_SECURITY.md)
- [Test status and limitations](docs/TEST_STATUS.md)
- [OpenAI/Codex review context](docs/OPENAI_REVIEW.md)
- [MIT License](LICENSE)
- [Third-party license notice](LICENSE-NOTICE.txt)

## Build/release caveat

The included v4.53 one-click update sources are intended for the exact supported installation baselines described in the update script. The Windows PowerShell execution and end-to-end installation were **not tested on a target Windows machine** for this source snapshot. Do not treat the source or an unsigned binary as an audited or certified release.

## Repository maintenance

- [Contributing policy](CONTRIBUTING.md) — contribution guidance for the MIT-licensed source.
- [Security reporting](SECURITY.md)
- GitHub Actions source checks: Python compilation, isolated unit tests, and JavaScript syntax validation.
- The test workflow does not claim target-Windows end-to-end coverage or an independent security audit.
