# v4.55 regression test scope

The v4.55 release workflow validates:
- refresh timing before and after OpenAI's `earliest_refresh_at`
- atomic replacement of rotated refresh credentials
- ISO-8601 and numeric refresh timestamps
- safe classification of token-refresh versus model-catalog HTTP failures
- redaction of bearer tokens and secret-bearing response descriptions
- v4.54 updater payload remains a separate historical, hash-verified artifact
- Windows x64 one-click installer package integrity
