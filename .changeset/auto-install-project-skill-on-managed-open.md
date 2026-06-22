---
"@inkeep/open-knowledge": patch
---

Opening an existing Open Knowledge project now guarantees the project-local Open Knowledge skill is installed — not just on fresh project setup. Previously, projects onboarded before the project-skill installer existed had Open Knowledge MCP wiring but no skill, and reopening them never healed the gap (the project-open reclaim was refresh-only). Now, when a managed project is opened (OK Desktop) or `ok start` runs, any editor whose project MCP config carries the Open Knowledge marker (`# ok-mcp-v1`) gets its `SKILL.md` created if missing — so a restored session loads the skill, with no manual folder moves. Non–Open Knowledge folders and editors that aren't wired for this project are left untouched, and the project-skill write now runs behind the same symlink-escape guard as `ok init`.
