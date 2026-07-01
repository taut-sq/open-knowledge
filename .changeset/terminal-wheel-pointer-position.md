---
"@inkeep/open-knowledge": patch
---

Fix mouse-wheel scrolling in the desktop terminal for TUIs that hit-test mouse coordinates (opencode, bubbletea apps). The terminal's mouse-mode wheel reports were pinned to cell 1;1 — fine for claude/vim/less, which ignore the position, but coordinate-dispatching TUIs route the wheel to the component under the reported cell, and the top-left corner is never the scrollable region, so scrolling silently did nothing. Wheel reports now carry the pointer's actual cell (with a viewport-center fallback when the renderer hasn't measured yet), and SGR-pixels mode reports CSS-px coordinates. This also corrects scroll targeting in window-under-pointer TUIs: vim/neovim splits and tmux panes previously always scrolled the top-left window regardless of where the pointer was; they now scroll the hovered one, matching native terminals.
