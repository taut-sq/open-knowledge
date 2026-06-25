---
"@inkeep/open-knowledge-desktop": patch
---

Dev: set `OK_INSTANCE=<name>` to run multiple desktop dev instances in parallel. Electron keys its single-instance lock on the `userData` directory, so two `electron-vite dev` processes normally collide and the second quits. `OK_INSTANCE` relocates each launch's `userData` to a named sibling directory (`Open Knowledge (<name>)`), giving every instance its own lock and its own isolated Chromium storage and recents. Honored only on unpackaged builds; packaged releases are unaffected.
