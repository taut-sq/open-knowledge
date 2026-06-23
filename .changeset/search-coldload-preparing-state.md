---
"@inkeep/open-knowledge": patch
---

Stop the command palette from showing a false "Search failed." right after a project opens.

When you opened a project and searched immediately, the body-text search could fire before the workspace had finished loading and lose the race with the palette's request timeout, surfacing "Search failed." even though nothing was wrong. The palette now waits for the page list to finish its initial load before running the server search, and shows a "Preparing search" status in that window instead. Once the page list is ready the search runs automatically, and file- and folder-name matching is available as soon as the list has loaded.
