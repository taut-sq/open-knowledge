---
"@inkeep/open-knowledge": minor
---

Agent writes now get advisory mermaid feedback, delivered on a new unified `warnings` channel. The `write`/`edit` MCP tools (and the underlying `POST /api/agent-write-md` / `POST /api/agent-patch` routes) validate every ` ```mermaid ` fence of the post-write document with the same mermaid version the editor renders with, and report parse failures as `warnings` entries (`kind: "mermaid-parse-error"` — fence locator + mermaid's line-numbered message) plus a `⚠` line in the tool response text — so the authoring agent can fix a broken diagram in the same session instead of the reader discovering the error chrome. Strictly advisory: writes land byte-faithfully regardless.

The `warnings` array is the one advisory channel going forward: it also carries the existing write-integrity kinds (`content-divergence`, `disk-edit-reconciled`) on every mutating write surface (write, write-md, patch, frontmatter-patch, rollback / `restore_version`), so co-occurring advisories no longer mask one another. The single-valued `warning` field and the MCP `structuredContent.document.contentDivergence` nesting are deprecated — `warning` keeps emitting its highest-precedence integrity entry in parallel for one deprecation window; new consumers should read `warnings`.

The `palette` tool's Mermaid entry now teaches the grammar sharp edges (raw `;`/`#` terminate sequence-family message text — use commas or `#59;`/`#35;`; quote flowchart labels containing punctuation), and the tool-description footer points at it.
