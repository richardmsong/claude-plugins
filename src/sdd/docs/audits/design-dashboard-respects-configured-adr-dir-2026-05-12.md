## Audit: 2026-05-12T14:37:57Z

**Document:** src/sdd/docs/adr-0083-dashboard-respects-configured-adr-dir.md

### Round 1

**Gaps found: 3 (+ 1 advisory)**

1. **Bad-path behavior is decided but unregistered + untested** — Decisions table commits to "honor the value when `spec.adr_dir` points at a nonexistent path," but neither the invariant definition nor the verifier test cases cover this branch. A refactor could regress silently.
2. **Banner display is decided but unregistered + untested** — Decisions table commits to appending `Docs dir: <resolved-path>` to the startup banner; no invariant, no test case, `server-banner.test.ts` not listed in Impact.
3. **User Flow step 4 stale placeholder** — User Flow still reads "behavior pending decision" for malformed-JSON and bad-path branches that are now decided elsewhere in the doc.

**Advisory (non-blocking):** `requires` cites `methodology.config.spec_adr_dir` (status: withdrawn, superseded by `methodology.validator.config_spec_adr_dir`). Should point to the active successor.

#### Fixes applied

| # | Gap | Cause | Resolution | Type |
|---|-----|-------|-----------|------|
| 1 | Bad-path behavior unregistered + untested | Decision was committed in the table but never propagated to invariant + verifier | User chose: register the contract. Extended invariant definition with "honored even when the resolved path does not exist on disk"; added Case 6 to `boot-config-respect.test.ts`. | decision |
| 2 | Banner display unregistered + untested | Same as #1 — narrative commitment without enforcement | User chose: register the contract. Added second invariant `methodology.dashboard.banner_shows_resolved_docs_dir` with verifier in `server-banner.test.ts`. | decision |
| 3 | User Flow step 4 stale placeholder | User Flow drafted before the Decisions resolved the malformed-JSON / bad-path questions | Rewrote step 4 to spell out all three branches | factual |
| 4 | `requires:` points at withdrawn invariant | Original author cited the methodology.config.* form before noting the validator namespace had superseded it | Updated `requires` to `methodology.validator.config_spec_adr_dir` (active) | factual |

### Round 2

CLEAN — no blocking gaps found.

One non-blocking advisory: Implementation Plan table was stale (referenced old 4-case test, missed banner row). Updated in the same edit pass.

### Result

**CLEAN** after 2 rounds, 4 total gaps resolved (2 factual fixes, 2 design decisions).
