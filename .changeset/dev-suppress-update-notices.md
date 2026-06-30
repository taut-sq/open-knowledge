---
"@inkeep/open-knowledge-desktop": patch
---

Stop showing auto-update notices in unpackaged dev builds. A dev desktop app never downloads or installs updates, so the boot-time "Update to X didn't install" banner, the staged-update relaunch banner, and the "what's new" toast were all noise driven by stale local state. They're now gated on the same signal that gates update checks (`app.isPackaged`), with the `OK_UPDATER_FORCE_DEV` escape hatch preserved for the manual update smoke.
