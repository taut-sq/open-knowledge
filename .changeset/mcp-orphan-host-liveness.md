---
"@inkeep/open-knowledge": patch
---

fix(mcp): exit `ok mcp` when its launching host dies so stale agent-presence icons clear

The `ok mcp` global stdio server opens a per-project keepalive WebSocket on the first tool call. That socket plus its reconnect timer keep the Node event loop alive, which silently disabled the only host-disconnect exit path the server had: the passive "stdin EOF then the event loop drains then the process exits" behavior never fires once a keepalive is open, and there was no active handler watching for the host going away.

As a result, when the launching host process ended (for example a Claude Desktop per-turn agent harness finishing its run), the `ok mcp` process did not exit. It was reparented to launchd, kept its keepalive WebSocket open, and the server's presence heartbeat kept refreshing the entry past both the client 5s TTL and the server 20s eviction, so the agent's presence icon never cleared. Each new run spawned a fresh `ok mcp` process with its own id, so ghost icons accumulated one per run.

`ok mcp` now exits promptly when its host is gone via two signals: an active `stdin` end handler (clean disconnect) and a parent-death watch that polls `process.ppid` and shuts down when the process is reparented (covers the case where a wrapper holds stdin open so no EOF arrives). Once the process exits, the existing keepalive-close to grace-timer to presence-clear path removes the entry. Live, idle agents are unaffected because their host process is still alive.
