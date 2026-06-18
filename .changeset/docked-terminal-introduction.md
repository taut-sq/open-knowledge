---
"@inkeep/open-knowledge": patch
---

Introduce the docked terminal in OK Desktop — an embedded shell beside the editor for running your tools without leaving the app. Toggle it with ⌘J or the new top-level Terminal menu. It ships polished for daily use:

- **Matches your theme** — light, dark, or system, and re-skins live when you switch themes (no restart).
- **Available by default** — opens on first use with no consent dialog; disable it per-project in Settings.
- **Top-level Terminal menu** — New Terminal and Kill Terminal, between View and Window like a native editor.
- **Trash to kill** — actually ends the shell session rather than just collapsing the panel; reopening starts a fresh shell, while collapse keeps the session running.
- **Cleaner agent hand-off** — launching an agent into the terminal no longer appends the web-only "open the editor in web view" line.

Opening or starting a new terminal now focuses the input so you can type right away, and killing a terminal after an agent hand-off opens a blank shell instead of replaying the previous prompt.
