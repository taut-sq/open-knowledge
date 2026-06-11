---
"@inkeep/open-knowledge": patch
---

Hide the sidebar "New from template" entry when a folder or the project has no templates. Previously, right-clicking a folder always showed a "New from template" submenu that opened to an empty list, and the project empty-space menu showed the entry greyed-out rather than hidden. Both surfaces now drop the entry entirely when there are no templates to pick, matching the toolbar and the editor empty-state.
