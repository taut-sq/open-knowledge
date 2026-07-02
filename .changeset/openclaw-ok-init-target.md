---
"@inkeep/open-knowledge": minor
---

Add first-class OpenClaw support to `ok init`. OpenClaw is now a detected editor: when `~/.openclaw/` exists, `ok init` (and OK Desktop's first-launch consent dialog) register the OpenKnowledge MCP server in `~/.openclaw/openclaw.json` under `mcp.servers`, using the same resilient launcher every other editor gets — it finds `ok` whether you installed the desktop app or the npm CLI, so there's no PATH to hand-configure. OpenClaw is only ever configured when it's actually installed: the detection gate holds even in the desktop consent flow, so `~/.openclaw/openclaw.json` is never written on a machine without OpenClaw. The format-preserving JSON writer now handles editors whose server map nests one level deeper (`mcp.servers.<name>`), preserving comments, key order, and unrelated entries byte-for-byte.
