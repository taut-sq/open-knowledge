---
"@inkeep/open-knowledge-app": patch
---

Make sharing reachable from more places.

Keep the editor-header Share button usable when nothing is open or selected. Previously the trigger was disabled whenever there was no active doc and no selected folder (a freshly opened project, or after deselecting everything), leaving no way to grab a link to the project as a whole. The genuinely-empty editor now defaults to sharing the content root via the folder-scope share's empty-string root sentinel, so Share is no longer a dead control just because nothing is focused. Non-shareable surfaces — asset previews, skill-bundle files, missing docs, and managed skill/template tabs — still keep the trigger disabled, since those have a target or synthetic doc name and never fall through to the root default.

Add a Share item to the file-tree right-click menu. It appears for folders and docs (never assets) and only when the project has a GitHub remote, reusing the same share-link path as the header button — folder rows share the folder, doc rows share the doc, and the link is copied to the clipboard with a confirmation toast.

Make the project-root context menu reachable. Right-clicking the project-root header row (the project name at the top of the sidebar) previously did nothing — it was suppressed as an interactive control. It now opens the existing project-scoped menu, which gains a Share item that shares the content root (and shows alongside New file/folder, Reveal, Copy path, etc.). Root Share is likewise gated on a GitHub remote.
