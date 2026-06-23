---
"@inkeep/open-knowledge": patch
---

UI polish across the terminal dock and the empty-state onboarding:

- Terminal tabs: the new-terminal (+) button now has a "New terminal" tooltip, and each tab's close (×) button reveals on hover or keyboard focus while staying persistently visible on the active tab.
- Terminal canvas gains a small left/right gutter, and the exit notice is restyled (muted message, outlined "Restart terminal" action, transparent in dark mode).
- Empty-state onboarding replaces the trailing "or create a new file" link with a dashed "blank file" escape-hatch card in the starter-pack grid, and the starter-pack picker dialog is a touch wider.
- Small-icon buttons (`size="icon-xs"`) now render their glyphs at 14px, so the tab close/new icons match the rest of the icon-button set.
