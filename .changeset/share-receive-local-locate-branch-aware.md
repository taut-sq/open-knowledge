---
"@inkeep/open-knowledge-desktop": patch
"@inkeep/open-knowledge-app": patch
---

fix(open-knowledge): branch-aware "I already have it locally" share-receive

Opening a share link for a branch you don't have checked out, for a repo that
isn't in your recent projects, now shows the branch-switch dialog when you
locate the repo via "I already have it locally" — the same prompt you already
get when the shared repo is in your recent projects. Previously this path opened
the project on whatever branch happened to be checked out and silently showed
the wrong (or an empty) document; the branch-switch choice only appeared on a
second click, once locating the repo had added it to your recent projects. The
receive flow now reads the located clone's current branch and, on a mismatch
with the share's branch, routes to the branch-switch surface (open on the
current branch vs switch to the shared branch) instead of opening on the wrong
branch.
