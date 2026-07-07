---
"@inkeep/open-knowledge": patch
---

Fixed the desktop in-app terminal failing on every open with "The terminal stopped unexpectedly." in v0.25.0 (Restart Terminal included). Moving node-pty to optionalDependencies had stopped electron-vite from externalizing it, so the packaged pty host bundled node-pty's loader and could no longer reach the native binding. node-pty is now explicitly externalized in the main-process build, and a packaging guard test pins the seam.
