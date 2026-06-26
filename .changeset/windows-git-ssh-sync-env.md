---
"@inkeep/open-knowledge": patch
---

Fix Git auto-sync when server-spawned Git needs the user's home directory, SSH agent, or credential-helper environment to reach a remote. This most visibly affected Windows repositories using SSH remotes, where `ok sync` and editor sync could fail with "Could not read from remote repository" while the same `git fetch` or `git push` worked in a terminal.

Because preserving the home directory also lets server-spawned Git read the user's global config, OK now pins `commit.gpgsign=false` and `core.autocrlf=false` for its own Git commands only (via `-c`, leaving the user's own Git untouched): the first prevents the unattended sync commit from aborting when a global signing config can't prompt for a passphrase, and the second keeps line-ending conversion from churning content against OK's byte-exact round-trip.
