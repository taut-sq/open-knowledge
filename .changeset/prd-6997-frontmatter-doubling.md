---
"@inkeep/open-knowledge": patch
---

Fix `write` doubling frontmatter when `content` already has a `---` block and a `frontmatter` param is also supplied. The two are now merged into a single block (the `frontmatter` param wins per key, embedded-only keys survive) instead of stacking a second block on disk. A malformed embedded block is rejected with a clear error rather than silently doubled.
