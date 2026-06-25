---
"@inkeep/open-knowledge-app": patch
---

Fix: in the Markdown source editor, Find (Cmd/Ctrl+F) now scrolls an off-screen match into view. Previously, searching for text below the fold selected the match but left the viewport unchanged, so the result stayed hidden. In full-page source mode the editor renders at content height and the page scroller is an ancestor element, where CodeMirror's default "scroll to match" (nearest) is a no-op; the source editor now forces a top-aligned scroll so found matches land just below the toolbar.
