---
"@inkeep/open-knowledge": patch
---

Fix the appearance theme toggle flickering other open project windows. With more than one project open, switching Light/Dark/System made every non-focused window flicker rapidly before settling on the right appearance. The cause was the window-chrome translucency material being re-applied to every open window on every theme change — work that scales with the number of windows and rebuilds the macOS vibrancy view each time, even though the material never needs to change on a light/dark switch. The desktop app now skips re-applying a window's translucency when it is unchanged, so theme switches are flicker-free across all open windows. Genuine "Reduce transparency" accessibility changes still apply to every window.
