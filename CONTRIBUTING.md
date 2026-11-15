# Contributing to Madar

Thank you for taking an interest in Madar.

## License

Madar's original project source in this repository is licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 Amin Sheikhy`). By submitting a pull request, you agree that your contributions will be licensed under the same MIT License.

Third-party components retain their own licenses. The bundled `app/vendor/pypdf` files are covered by the included BSD-3-Clause notice (`app/vendor/pypdf-LICENSE.txt`). See `LICENSE-NOTICE.txt` for details.

## How to contribute

1. Fork the repository (`https://github.com/Amin-Sheikhy/Madar`) and create a branch from `main`.
2. Keep changes focused and preserve existing functionality.
3. Run the source checks locally before opening a pull request:
   - `python -m compileall -q app tests repair453`
   - `python -m unittest discover -s tests -v`
4. Open a pull request using the repository's pull request template.

## Reporting a bug

- Use the Bug Report issue form.
- Include the exact Madar version and concise reproduction steps.
- Describe expected and actual behavior.
- Share only sanitized logs or screenshots.

## Privacy and security

Never post learner records, PDFs, OAuth tokens, API keys, DPAPI material, private account information, or local database files in public issues or pull requests. See `SECURITY.md` and `docs/PRIVACY_SECURITY.md`.

## Tests

The currently documented checks are:
- Python compilation
- Isolated managed-book deletion unit tests
- JavaScript syntax checks

The CI workflow runs these checks. They are not a substitute for target-Windows end-to-end testing or an independent security audit.
