---
"@inkeep/open-knowledge": patch
---

Add always-on desktop startup instrumentation. Every launch now emits one structured `desktop.startup-timeline` log line with bounded per-phase durations (app-ready → bootstrap → server spawn → lock-ready → window → load → shown, plus the server's HTTP-listen / seed-walk / index / ready timings and the renderer's page-list and first-content marks). The server exposes its boot timings on `GET /api/server-info`, and the file-watcher seed walk and index phases are now traced (`ok.boot.seed-walk`, `ok.boot.indexes`). When OpenTelemetry is enabled, the three processes (Electron main, server, renderer) join into a single correlated `ok.app-startup` trace via W3C traceparent propagation. This is instrumentation only; startup behavior and timing are unchanged.
