# Privacy and security boundaries

## Repository contents

This public review snapshot contains source code and documentation only. It intentionally excludes:

- the offline-export HTML page, which may contain profile or learning-state material;
- SQLite databases, course/learning records, PDF books, backups, reports, logs, browser profiles, and local test data;
- OAuth/API tokens, DPAPI credential files, `.env` files, and any compiled installer or object files.

A secret-pattern scan was run on the curated source set before packaging. The scan did not identify hard-coded API keys or GitHub tokens. Third-party `pypdf` attribution emails remain in its original license/source notices.

## Local-only service boundary

- The application server binds to `127.0.0.1` in source.
- Host and Origin checks are present for local API operations, including the v4.53 managed-book delete route.
- The local API is not intended to be exposed to a LAN or the public internet.
- PDF opening/import into the local Books folder does not by itself invoke an AI provider.
- Deleting a managed book removes only the Madar-managed copy in Books. The original source file outside that folder is not touched.

## AI and account connections

AI usage is optional and may involve external services. When a user explicitly invokes a cloud AI feature, the relevant prompt, text, or selected media-derived content may be sent to the configured provider. Therefore “local-first” does not mean every AI action is offline.

The source contains a Sign in with ChatGPT plan-usage implementation using loopback OAuth, PKCE, state/nonce checks, identity-token validation, and Windows CurrentUser DPAPI for persistent credential protection. These implementation claims describe the code; they are not a third-party security audit or an OpenAI certification. Account permissions and provider policies still apply.

## Remaining security work

- No independent security audit or penetration test has been performed.
- Target-Windows runtime verification of the v4.53 one-click update is `NOT_TESTED` in this snapshot.
- Users should not place the local service behind a public reverse proxy or configure it to bind to a non-loopback interface without a separate security review.
