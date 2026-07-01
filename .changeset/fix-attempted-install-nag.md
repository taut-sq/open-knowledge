---
"@inkeep/open-knowledge": patch
---

Stop OK Desktop's "Update to X didn't install" notice from firing spuriously and re-appearing on every launch. The boot-time failed-install detector now handles two cases it previously got wrong:

1. Cross-channel state. The stable and beta builds share one settings file (same app id), so a version that one channel armed as its pending install could poison the other channel's boot check. A beta build would show "Update to 0.23.0 didn't install" for a stable version it can never install (cross-channel updates are blocked), and there was no way for it to clear, so the notice returned on every launch. That stale cross-channel record is now cleared silently.

2. No retry bound. A genuinely stuck install (a persistently-failing installer, a pulled release) re-surfaced the notice on every boot forever. It is now shown at most 3 times per failed update, after which the record is dropped. The 7-day "updates paused" hint remains the backstop.

Genuine same-channel install failures still surface as before, so a real failed update is not hidden.
