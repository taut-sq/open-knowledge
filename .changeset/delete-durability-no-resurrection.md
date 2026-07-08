---
"@inkeep/open-knowledge": patch
---

Deleted docs now stay deleted. Two long-standing gaps let a deleted or
renamed-away markdown file silently re-materialize on disk with its old
content:

- Deleting or renaming through the app, the HTTP API, or the MCP `delete`
  tool could race a pending autosave — the store fired after the file was
  removed and rewrote it at the old path (external `rm` was already
  protected; the in-app paths were not). Every teardown path now marks the
  doc as no-longer-tracking-disk before connections close, so late stores
  are suppressed instead of resurrecting the file.
- Deletions did not survive a server restart: every anti-resurrection
  guard was in-memory, so a browser tab (or any client) still holding the
  doc's cached state would be admitted after a restart and re-create the
  file — including files deleted while the server was stopped. Removals
  are now journaled durably under `.ok/local/`, reloaded at boot, and
  files that vanished during downtime are detected and tombstoned at the
  next start. Rename redirects for stale tabs also survive restarts now.

Re-creating a doc on purpose (new file at the same path, `create-page`,
agent writes) keeps working exactly as before.
