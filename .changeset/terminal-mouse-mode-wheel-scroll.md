---
"@inkeep/open-knowledge": patch
---

Fix jumpy, inconsistent mouse-wheel scrolling inside full-screen terminal apps that capture the mouse (the `claude` TUI, `vim`, `less`, `top`). In mouse-tracking mode xterm.js forwards one mouse-wheel report per OS wheel event with no accumulation, so the high-frequency event stream from trackpad momentum and free-spin/fast-scroll wheels floods the app — scrolling that lurches and can run away ("rocket scroll"). The terminal now accumulates fractional rows of travel and emits one wheel report per whole row of distance crossed, so scroll tracks the actual distance moved regardless of how many events deliver it: gentle drags and fast flicks over the same distance scroll the same amount, with no dead zone and a per-event clamp that absorbs momentum spikes. Normal scrollback (no mouse-capturing app) additionally gets smooth scrolling. Desktop only.
