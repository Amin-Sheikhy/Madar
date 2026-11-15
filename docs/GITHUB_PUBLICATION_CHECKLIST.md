# Madar — GitHub repository status and maintenance checklist

## Publication status (verified 2026-11-15)

- **Repository:** [Amin-Sheikhy/Madar](https://github.com/Amin-Sheikhy/Madar)
- **Visibility:** Public.
- **Default branch:** `main`.
- **Published source snapshot:** `v4.53 14050824 SU GPT-6 BOOKS_DELETE_DIRECT_DOWNLOAD`.
- **License:** MIT in the repository root; bundled third-party components retain their own license notices.
- **Source CI:** the initial `Source checks` workflow completed successfully: [GitHub Actions run](https://github.com/Amin-Sheikhy/Madar/actions/runs/43748766592).
- **GitHub Releases:** no formal GitHub Release was listed at the time of this review.
- **Current maintenance work:** `codex/github-management` is a working branch. Its changes are not part of `main` unless and until they are reviewed and merged.

## What the current source checks establish

The workflow checks Python compilation, isolated unit tests, JavaScript syntax, and PowerShell syntax for the one-click update scripts. A successful run is a source-level check only; it does not establish a full Windows installation test, complete browser UI test, end-to-end AI workflow test, independent security audit, or OpenAI endorsement. See [test status](TEST_STATUS.md) for the v4.53 verification limits.

## Ongoing maintainer checklist

- [ ] Keep `main` as the stable, reviewable source branch.
- [ ] Make changes on focused branches and inspect the complete diff before opening a pull request.
- [ ] Run the available source checks for every change; mark Windows-only checks `NOT_TESTED` unless they were actually run on a target Windows installation.
- [ ] Keep the English and Persian READMEs and technical documentation consistent.
- [ ] Keep learner records, PDFs, SQLite databases, backups, reports, logs, browser profiles, OAuth/API tokens, DPAPI files, `.env` files, and compiled executables out of the public repository.
- [ ] Keep local installation paths configurable through `MADAR_HOME`; do not publish a maintainer-specific path.
- [ ] Do not claim users, downloads, stars, adoption, security certification, or program selection without verifiable evidence.

## One-time publication helper

`scripts/Publish-Madar-GitHub.ps1` was created for the initial repository publication. It deliberately refuses to overwrite an existing repository. Do not rerun it to publish updates; use branches, pull requests, and reviewed commits instead.

## OpenAI / Codex review context

Madar is an independent open-source project, not an official OpenAI product. A public repository is accessible for technical inspection, but publication does not mean OpenAI has reviewed, selected, endorsed, or certified the project. Any Codex for Open Source application and its outcome are separate; only an official program notification confirms selection.

## Privacy reminder

The public source tree must remain a curated code-and-documentation snapshot. Never commit personal learning data, course records, source PDFs, private backups/reports, account credentials, access tokens, or local runtime databases.