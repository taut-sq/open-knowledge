---
"@inkeep/open-knowledge": patch
---

Fix the server being unreachable on Windows when your coding agent auto-starts
it over MCP. The server used to bind the `localhost` hostname, which Windows
resolves to IPv6 (`::1`) only, while the tools connecting to it use IPv4
(`127.0.0.1`) — so `edit` / `exec` calls failed with "Server unreachable: fetch
failed". The server now binds numeric `127.0.0.1` directly (still loopback-only),
and the MCP shim and the `ok ui` proxy connect to the same address, so there is
no longer any IPv4/IPv6 mismatch on any platform. You no longer need the
`--host 127.0.0.1` / `HOST=127.0.0.1` workaround. macOS and Linux behavior is
unchanged.
