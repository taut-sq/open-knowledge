---
"@inkeep/open-knowledge-app": patch
---

External URL nodes in the graph now open in your default OS browser on the desktop app, instead of a new in-app Open Knowledge window. Clicking an external node (or its "Open link" button in the graph side panel) routes through the desktop bridge's `openExternal`, so the link lands in your system browser the same way external links already open elsewhere in the editor. On the web build the behavior is unchanged (a new browser tab). Previously these three graph call sites used a raw `window.open`, which Electron turns into a new BrowserWindow rather than handing off to the OS.
