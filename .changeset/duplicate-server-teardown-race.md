---
"@inkeep/open-knowledge": patch
---

Fix duplicate servers per project during teardown/restart windows. Previously a
server released its `server.lock` seconds before its process actually exited
(and, after an idle shutdown, sometimes never exited at all), so restart flows —
desktop relaunch, auto-update, MCP auto-start — could spawn a second server
alongside a still-live predecessor, losing in-app threads and splitting writes
from the preview. The lock now stays owned (marked `draining`) until the process
truly exits; spawners wait out a draining predecessor instead of racing it; the
desktop waits for process death rather than lock disappearance before
respawning; and idle shutdown now exits the process explicitly, logging any
leaked handles that previously produced immortal zombie servers. Lock identity
also moved from the OS hostname (which macOS renames on network changes) to a
stable per-machine ID at `~/.ok/machine-id` — a hostname rename no longer lets a
new server silently steal a live server's lock; ambiguous cases now fail closed
with a clear "already running" error. When the desktop can't open a project
because a conflicting server holds its lock, the error dialog now offers
"Stop Server & Retry" to resolve it in one click.
