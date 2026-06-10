---
"@inkeep/open-knowledge": patch
---

Extinguish the non-Playwright flake classes that were dropping merge-queue runs and breaking local tiers. Integration tests can now await the shadow-repo WIP commit deterministically via a new dev-only `POST /api/test-flush-git` route instead of racing the fire-and-forget git pipeline against a 20-second budget (the rename-history class behind three queue drops in six days). Parse-health metrics split wall-clock parse-budget aborts (`parseFallback.wholeDocBudget`, an environmental signal) from structural whole-doc fallbacks (`parseFallback.wholeDoc`, a content-health signal), so fixed-corpus "zero whole-doc" assertions and operator alerts no longer trip when a loaded machine crosses the 500ms defense budget on content that parses fine when idle. The two long-broken a11y PropPanel tests hover-reveal the chrome before clicking the gear. Full audit: `reports/nonplaywright-flake-audit-2026-06/`.
