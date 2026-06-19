---
"@inkeep/open-knowledge": patch
---

Fix a round-trip fidelity bug for documents that use indented MDX-JSX container components (`<Steps>`, `<Tabs>`, and similar nested components). Editing one of these documents no longer risks silent indentation rewrites, content reordering, or duplication: the editor's bridge now recognizes the serializer's container formatting as equivalent to the authored source, so the document settles to a stable state in a single pass and what you typed is what gets stored.
