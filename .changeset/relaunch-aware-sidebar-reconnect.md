---
"@inkeep/open-knowledge": patch
---

The file sidebar no longer flashes a red "Could not reach server" error during a desktop auto-update relaunch. While the app restarts to install an update, the server is intentionally torn down for a few seconds — the sidebar now shows a calm "Relaunching to install the update…" notice instead, and quietly re-attempts the listing so it self-heals the moment the server returns (for example, when a relaunch is aborted). A genuine outage with no relaunch underway still surfaces the honest error immediately.
