---
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge-desktop": minor
---

Add `ok <file>` — open a single markdown file in the editor with zero project setup. Run `ok notes.md` (or `ok open notes.md`) on any `.md` / `.mdx` file and it opens in the WYSIWYG ↔ source editor.

- **Project-aware.** When the file lives inside an existing Open Knowledge project (an ancestor `.ok/`), it opens that project focused on the file — the path is realpath-resolved first, so a symlink into a project routes correctly.
- **No-project mode.** For a loose file, it opens an ephemeral single-file session: a throwaway server scoped to just that one file, with git, MCP, and agents off. Edits save straight back to your original file. **No `.ok/` or other state is written into your directory** — all session state lives in a temporary directory that's removed when you close the window.
- **Opening never reformats.** A file you open but don't edit is left byte-for-byte identical, even when it has an unstable markdown round-trip.
- **Desktop-first with a browser fallback.** Opens in the Open Knowledge desktop app when it's installed; otherwise serves the editor in your browser (Ctrl-C to end the session). Launching from a closed app goes straight to the file in a single window — it doesn't reopen your last project alongside it.
- **Focused chrome.** No-project sessions hide the file sidebar, tabs, project switcher, and Settings — just the file and the editor.

Discoverable via `ok --help`.
