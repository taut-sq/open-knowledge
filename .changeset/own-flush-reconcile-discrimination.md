---
"@inkeep/open-knowledge-server": patch
---

Re-land the three-way disk-reconcile guard for agent writes with own-write discrimination. The guard that merges divergent on-disk edits before an agent write now recognizes the server's own in-flight persistence flush (disk content matching the flush snapshot mid-commit) and skips reconciliation instead of misclassifying it as foreign divergence. This fixes spurious 409 doc-in-conflict refusals — including a permanent wedge where every subsequent agent write was refused — that could occur when an agent write raced the server's own debounced disk flush on large documents. Genuinely foreign disk edits still reconcile (or refuse) exactly as before.
