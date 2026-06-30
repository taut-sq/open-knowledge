---
"@inkeep/open-knowledge": patch
---

Speed up project load for knowledge bases with many files. `GET /api/pages` previously re-read and re-parsed every markdown file from disk on every request — including the redundant full-directory pass that ran concurrently with the watcher's seed walk on cold load, and a fresh full re-read on every window focus / file-change refresh. Page titles and icons are now cached on the in-memory file index (derived from the content the watcher already reads for its change-detection hash, so no extra disk reads), and `/api/pages` serves them straight from memory. Titles/icons stay current through create, edit, and rename events. Behavior is unchanged; only the cost of listing pages drops from O(files) disk reads per request to an in-memory scan.
