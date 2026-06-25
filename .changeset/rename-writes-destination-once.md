---
"@inkeep/open-knowledge": patch
---

Renaming a file no longer rewrites the destination when the move already placed the final bytes there. A managed rename moves the file and then writes the reconciled content; previously that second write was unconditional, so a rename that did not change the file's content still wrote the destination twice. The rename spine now skips the rewrite when the reconciled content already matches what is on disk, so a no-content-change rename writes the destination exactly once. Renames that rewrite wiki-link references still write the destination twice — the move places the old bytes, then the link rewrite overwrites them — because that second write is doing real work.
