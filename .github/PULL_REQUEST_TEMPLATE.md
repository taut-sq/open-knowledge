## What & why

<!-- One or two sentences on the change and the motivation. Link any related issue. -->

## How this was verified

<!-- How you tested: `bun run check` output, manual steps, before/after screenshots for UI changes. -->

## Checklist

- [ ] Ran `bun run check` (lint, typecheck, tests) locally
- [ ] Added a changeset (`bun run changeset`) if this changes behavior
- [ ] Updated docs if this changes a user-facing surface
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to license my contribution under the project's terms (CLA)

---

### How our PR flow works — please read

This repository is **mirrored from an internal monorepo**. After you open this PR:

1. A bot mirrors your changes internally for review (it posts a link you won't be able to open — that's expected).
2. Maintainer review and full CI (lint, typecheck, tests) happen internally; results are **not** posted back to this PR.
3. Once the change lands internally and syncs back, **your PR is closed — not merged.** Your authorship is preserved.

If you don't hear back within a few business days, commenting to nudge is welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full flow.
