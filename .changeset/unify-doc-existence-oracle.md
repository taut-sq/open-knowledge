---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge": patch
---

Stop the file-watcher's indexing lag from making freshly-written docs look missing across link, title, and dead-link results. The file index the watcher maintains can lag an in-session write — or permanently drop the create event for a file written into a just-created subfolder — which made a brand-new doc render as a raw red-link name (instead of its title) and could flag a valid link to it as dead, until a server restart. Two complementary fixes close the gap: doc-existence now also trusts the link graph (updated in-process on every write), and the agent write/edit/frontmatter-patch handlers register the doc they just wrote into the file index immediately, mirroring page creation. Both paths honor content-scope exclusions, so a gitignore/okignore'd doc never leaks its title through these endpoints.
