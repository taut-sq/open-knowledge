---
"@inkeep/open-knowledge": patch
---

Desktop: stop showing the sticky "Installed CLI shims." startup toast when an app upgrade only repoints the internal `~/.ok/bin` symlinks. The startup PATH-reclaim toast now fires only for changes the user can see or act on — a shell rc-file edit, an opt-out, a legacy-symlink cleanup, or a failure. A no-op symlink repoint (the common case on every upgrade or bundle-path change) is now silent; the repoint still happens and still emits the structured `path-install-symlink-success` event for operators. Restores the spec's "silent if no meaningful user-facing change" contract.
