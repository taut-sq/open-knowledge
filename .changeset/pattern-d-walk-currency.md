---
"@inkeep/open-knowledge": patch
---

Fix silent loss of collaborative edits that land while a document editor is still opening. The editor's pre-warm mount path captures document state at construct time, and a remote or agent edit arriving in the brief window before the editor view binds was never reconciled — the editor showed stale content, and the first click or keystroke could republish that stale copy over the shared document, erasing the missed edit for every peer and on disk. A walk-currency check now rides every pre-warm mount: it watches the document fragment from construction, and if anything changed before the view bound, it invalidates the pre-warm and re-derives the editor content from current state. Quiet mounts keep the full pre-warm fast path.
