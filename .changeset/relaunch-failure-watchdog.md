---
"@inkeep/open-knowledge": patch
---

Surface update-relaunch failures that happen after the relaunch was committed. Squirrel.Mac reports install failures asynchronously (through the updater's error event, or by silently never quitting) — previously every window stayed stuck on the terminal "Relaunching to install the update…" card with no button and no dismiss while the app kept running. Now the main process treats an updater error while a relaunch is in flight as that relaunch failing, backed by a watchdog that fires if the app is still alive 15 seconds after a clean quitAndInstall return. Either trigger restores the staged update, swaps every window back to the actionable "Version X ready to install" banner, and shows a "Relaunch failed — please restart manually" notice with the failure detail. A false watchdog alarm self-heals: if the app does relaunch, the restored state is cleared on the next boot.
