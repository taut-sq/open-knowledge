---
"@inkeep/open-knowledge": minor
---

Make MCP server registration non-destructive and format-preserving. `ok init` and the desktop reclaim sweeps now only ever add OpenKnowledge's own entry to a harness config: comments, formatting, key order, value types, and byte-level encoding (BOM, line endings, trailing newline) are preserved. A config that can't be parsed safely — invalid JSON/TOML, a duplicate server block, or an oversized file — is left byte-for-byte untouched and reported as `left unchanged (<reason>)` rather than being reset or rewritten. Codex `config.toml` is edited through a new napi-rs `toml_edit` addon so 64-bit integers and microsecond datetimes are no longer mis-flagged, and symlinked configs are written through to their real target instead of being replaced.
