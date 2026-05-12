# ADR: Dashboard respects `spec.adr_dir` from `spec-driven-config.json`

**Status**: accepted
**Status history**:
- 2026-05-12: draft
- 2026-05-12: accepted — design audit CLEAN (Round 2); roundtrip CLEAN on both verifiers

## Overview

The docs-dashboard's `boot()` currently hardcodes its docs directory as `<docsRoot>/docs/`. Under ADR-0078 the docs location is project-configurable via `spec-driven-config.json`'s `spec.adr_dir`, and every methodology consumer of that field was updated except the dashboard. This ADR registers the missing contract: when `boot()` resolves the docs directory it reads `<docsRoot>/spec-driven-config.json` if present and uses `config.spec.adr_dir`; it falls back to `<docsRoot>/docs/` only when no config file exists or the file lacks `spec.adr_dir`. The change supersedes the relevant line of ADR-0050's "docs directory is always `<docsRoot>/docs/`" decision.

## Motivation

The repo's own `spec-driven-config.json` declares `"adr_dir": "src/sdd/docs/"` because SDD dogfoods itself — its ADRs live under `src/sdd/docs/`, not at the repo root. Running `/dashboard` from the repo root prints:

```
[docs-mcp] docs/ directory not found at /Users/rsong/work/agent-plugins/docs
[docs-mcp] Blame scan complete: 0 file(s) processed
```

The dashboard boots but indexes zero docs because `boot.ts:70` resolves the docs dir as `join(docsRoot, "docs")` regardless of config.

Current workaround: launch with `CLAUDE_PROJECT_DIR=…/src/sdd` so the hardcoded `<docsRoot>/docs/` accidentally points at `src/sdd/docs/`. Brittle — relies on a per-project env override that contradicts the config file's intent.

Pre-ADR-0078 the methodology assumed fixed paths. Once `spec.adr_dir` became project-configurable, the Go validator (`methodology.config.spec_adr_dir`, `methodology.validator.cli_walks_adr_dir`) and the docs MCP server were updated; the dashboard's boot path was missed. No registered invariant bound the dashboard to the configured value, so refactors could regress this silently. This ADR fixes the bug and registers the missing contract.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config source | `<docsRoot>/spec-driven-config.json` (only) | Symmetric with the Go validator's `loadConfig`: config sits at the docs root. No upward search. |
| Field consumed | `spec.adr_dir` only | Methodology already registers this single field; registry/glossary/reactions are read by other consumers, not the dashboard's docs dir resolution. Out of scope. |
| Relative path resolution | Resolved relative to docsRoot if not absolute | Mirrors how the Go validator interprets the field. |
| Fallback trigger | No config file, OR `spec.adr_dir` missing/empty/whitespace | Defensible default for legacy projects. |
| Bad-path behavior | If `spec.adr_dir` is set but the resolved path doesn't exist, **honor the value** — let downstream indexers print the same "directory not found" diagnostic they print today. No silent rewrite to a fallback. | Consistent with the Go validator (which errors at validation time, not via silent fallback). The dashboard already handles missing-dir gracefully. Silent rewrite would mask misconfiguration. |
| Malformed JSON behavior | **Exit non-zero** with a clear error message naming the file and the parse error. | Fail fast on broken config. Better than silent fallback because the user explicitly wrote a config and expects it to be honored. `sdd verify` covers this too, but the dashboard's own startup is the right place to surface the error when the dashboard is what's being launched. |
| Banner display | **Yes** — append one line to the startup banner: `Docs dir: <resolved-path>` | Makes the bug class self-diagnostic in the future. Minimal noise (one line). |
| Parser | Plain `existsSync` + `readFileSync` + `JSON.parse` in `boot.ts`; no schema library | Match the codebase's lightweight style. Single field; no need for schema validation. |
| Test framework | New `boot-config-respect.test.ts` under `src/sdd/docs-dashboard/tests/`, Bun test, same shape as `boot-docs-dir.test.ts` | Drop-in alongside existing tests; reuses temp-repo + mock-watcher pattern. |
| Verify-chain inclusion | Append `cd src/sdd/docs-dashboard && bun test tests/` to `spec-driven-config.json`'s `verify[]` array | The verifier file existing satisfies `methodology.registry.verifier_resolves`, but `/feature-change`'s gate is `sdd verify && verify[]` — without including `bun test`, dev-harness has no signal that this verifier is red or green. Scope the include to `tests/` only (not `ui/`) because the UI tests have a pre-existing DOM-environment break unrelated to this work. |
| Relation to ADR-0050 | ADR-0050's decision "docs directory is always `<docsRoot>/docs/`" gets a `> Superseded by adr-0083-dashboard-respects-configured-adr-dir.md` note on the relevant row; no `supersedes:` edge in registry (ADR-0050 registered no invariant) | Skill rule: when a later decision supersedes an earlier one, annotate the old ADR in place rather than rewriting it. |

## User Flow

1. User runs `/dashboard` from the repo root (or any directory).
2. `server.ts` resolves `docsRoot` via the existing `--root` / `CLAUDE_PROJECT_DIR` / `cwd` chain.
3. `boot()` is invoked with the resolved `docsRoot`.
4. `boot()` checks for `<docsRoot>/spec-driven-config.json`:
   - **Present and parseable, with non-empty `spec.adr_dir`:** uses that path (resolved relative to docsRoot if not absolute) as the docs directory passed to `indexAllDocs`, `runLineageScan`, `runBlameScan`, `startWatcher` — including the case where the resolved path does not exist on disk (honored as-given; downstream prints its own diagnostic).
   - **Absent, or present but `spec.adr_dir` is missing/empty/whitespace:** falls back to `<docsRoot>/docs/`. Existing behavior preserved.
   - **Present but malformed JSON:** `boot()` throws an `Error` naming the config file and the parse failure; `main()` catches and exits non-zero.
5. The startup banner prints one extra line: `Docs dir: <resolved-path>`.
6. Index, lineage, blame scans operate on the resolved docs dir as before.

Error cases:
- **Config file present but malformed JSON:** `boot()` throws; `main()` already catches and prints `[dashboard] Boot failed: …` then exits non-zero. The error message names the config path and the parse error.
- **Config file present with `spec.adr_dir` pointing at a nonexistent path:** the resolved path is honored. The existing indexer prints `docs/ directory not found at <path>` and continues with zero results — same diagnostic as the legacy fallback case today.

## Component Changes

### docs-dashboard (`src/boot.ts`)

- New helper `resolveDocsDir(docsRoot: string): string` near the top of `boot.ts`.
- `boot()` replaces `const docsDir = join(docsRoot, "docs");` with `const docsDir = resolveDocsDir(docsRoot);`.
- No new dependencies; uses existing `fs` + `path` imports.
- All downstream calls (`indexAllDocs`, `runLineageScan`, `runBlameScan`, `startWatcher`) take the resolved value unchanged.

### docs-dashboard (`tests/boot-config-respect.test.ts`)

New unit test, same temp-repo + mock pattern as `boot-docs-dir.test.ts`:
- Case 1: config present with relative `spec.adr_dir: "alternate-docs"` → `startWatcher` receives `<docsRoot>/alternate-docs`.
- Case 2: config absent → `startWatcher` receives `<docsRoot>/docs`.
- Case 3: config present but `spec.adr_dir` missing/empty/whitespace → falls back to `<docsRoot>/docs`.
- Case 4: config present with absolute `spec.adr_dir` → that absolute path is used as-is.
- Case 5: config present but malformed JSON → `boot()` throws.
- Case 6: config present with `spec.adr_dir` pointing at a nonexistent path → `startWatcher` still receives that configured (nonexistent) path; no silent fallback.

### docs-dashboard (`src/server.ts` banner)

`buildStartupBanner` gains a new `docsDir: string` parameter and appends one final line of the form `Docs dir: <resolved-path>`. The resolved path is returned from `boot()` (via a new `docsDir` field on `BootResult`) so `main()` can pass it to the banner builder.

### docs-dashboard (`tests/server-banner.test.ts`)

Existing file gains one new test asserting the banner includes a line matching `^Docs dir: <expected>$` when `buildStartupBanner` is invoked with a docsDir argument.

### Out of scope (for this ADR)

- `spec.registry`, `spec.glossary`, `spec.reactions_dir` — the dashboard does not directly read those today; if a future feature needs them, that's a separate ADR.
- No changes to `docs-mcp/src/resolve-docs-root.ts` — that resolves the `--root` chain correctly; the bug is purely in the boot consumer.

## Data Model

No schema changes. `spec-driven-config.json`'s `spec.adr_dir` field is already defined by ADR-0078; this ADR adds a TypeScript consumer.

## Error Handling

| Failure | Behavior |
|---------|----------|
| `spec-driven-config.json` absent | Use `<docsRoot>/docs/` (legacy default). |
| `spec-driven-config.json` present, malformed JSON | `boot()` throws an `Error` naming the file and parse failure; `main()` catches and exits non-zero (existing path). |
| `spec-driven-config.json` present, `spec` field absent or `spec.adr_dir` missing/empty/whitespace | Use `<docsRoot>/docs/`. |
| `spec.adr_dir` present, resolves to a nonexistent path | Honor the value. Downstream indexers print `docs/ directory not found at <resolved-path>` and continue (same diagnostic the existing fallback already produces). No silent rewrite. |

## Security

None — local filesystem read of an already-trusted config file.

## Impact

- `src/sdd/docs-dashboard/src/boot.ts` — small (~25 lines) helper added; one line in `boot()` changed; `BootResult` gains `docsDir: string`.
- `src/sdd/docs-dashboard/src/server.ts` — `buildStartupBanner` gains a `docsDir` parameter and emits `Docs dir: <path>`; `main()` threads the value from `boot()`.
- `src/sdd/docs-dashboard/tests/boot-config-respect.test.ts` — new verifier (~180 lines, 6 cases).
- `src/sdd/docs-dashboard/tests/server-banner.test.ts` — one new test case for the `Docs dir:` line.
- `src/sdd/spec/registry.yaml` — two new entries: `methodology.dashboard.respects_configured_paths`, `methodology.dashboard.banner_shows_resolved_docs_dir`.
- `spec-driven-config.json` — `verify[]` gains `cd src/sdd/docs-dashboard && bun test tests/`.
- `src/sdd/docs/adr-0050-dashboard-unified-docsroot.md` — one-line supersession note appended to the relevant row.

## Scope

**In:**
- Read `spec-driven-config.json` once at boot.
- Resolve `spec.adr_dir` (string, relative-to-docsRoot or absolute).
- Fall back to `<docsRoot>/docs/` when config absent or field empty.

**Out (deferred or never):**
- Hot-reload of config changes.
- Reading `spec.registry`, `spec.glossary`, `spec.reactions_dir` from config in the dashboard.
- Schema validation of `spec-driven-config.json` (the Go validator already does this).

## Invariant Delta

### Added

```yaml
- id: methodology.dashboard.respects_configured_paths
  definition: When `boot()` resolves the docs directory, it reads `<docsRoot>/spec-driven-config.json` if present and uses `config.spec.adr_dir` as the `docsDir` passed to `startWatcher` — resolved relative to docsRoot when not absolute, used as-is when absolute, honored even when the resolved path does not exist on disk; falls back to `<docsRoot>/docs/` only when the config file does not exist or `spec.adr_dir` is missing, empty, or whitespace-only; throws when the config file is present but contains malformed JSON.
  verifier: src/sdd/docs-dashboard/tests/boot-config-respect.test.ts
  requires:
    - methodology.validator.config_spec_adr_dir

- id: methodology.dashboard.banner_shows_resolved_docs_dir
  definition: The dashboard's startup banner includes a line of the form `Docs dir: <resolved-path>` where `<resolved-path>` is the same `docsDir` value `boot()` passes to `startWatcher`.
  verifier: src/sdd/docs-dashboard/tests/server-banner.test.ts
  requires:
    - methodology.dashboard.respects_configured_paths
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why register the contract instead of fixing silently.** The bug is one line in `boot.ts`. A bare commit would fix it but leave nothing to prevent the next refactor from regressing the dashboard against `spec.adr_dir`. The methodology already has `methodology.config.spec_adr_dir` and `methodology.validator.config_spec_adr_dir` for the Go side; the TypeScript dashboard had no analog. Registering `methodology.dashboard.respects_configured_paths` closes that gap and binds the dashboard to the same field every other consumer respects.

**Why a single invariant, not one per fallback case.** Each test case (config present / absent / malformed / bad path) exercises one branch of one decision rule. Splitting them into separate invariants would fragment the contract — the contract IS the resolution rule. The verifier asserts every branch in a single test file; failures localize to the failing case via test name.

**Why no registry-level supersession of ADR-0050.** ADR-0050 registered no invariants — its content was prose decisions about CLI flags and docsRoot resolution. There is nothing in the registry to mark `superseded_by`. The Decisions table row in ADR-0050 that said "docs directory is always `<docsRoot>/docs/`" gets a `> Superseded by adr-0083…` annotation in-place per the skill's rule that mechanical updates to old ADRs are allowed (and a supersession note is mechanical, not semantic).

**Why honor a bad path instead of falling back.** Two consistency arguments pulled in opposite directions: silent fallback would let the dashboard always show *something*, but it would also mask misconfiguration — a user who deliberately wrote `spec.adr_dir: "src/sdd/docs/"` expects that exact path, not a quiet retreat to `<docsRoot>/docs/`. The Go validator errors instead of falling back. The dashboard's downstream code already prints a clear "directory not found at <path>" message — the user sees exactly which path was tried. No magic.

**Why exit non-zero on malformed JSON instead of falling back.** Malformed JSON is a user-authored bug, not an environmental quirk. The dashboard's other boot failures that fall back (lineage scan, blame scan) are operating on data the user didn't write — they fail open because their input is derived. The config file is the opposite: the user wrote it and expects it to drive behavior. Failing fast with a clear message is more useful than starting up "correctly" against the legacy default while ignoring the user's intent.

**Why surface the resolved path in the banner.** This bug class — "dashboard is up but indexing the wrong directory" — is exactly what cost the user a debugging session. One extra banner line (`Docs dir: <path>`) makes the failure mode self-diagnostic: the user can see at a glance which path got picked and immediately notice a mismatch. The cost is one line of console output at startup; the benefit is that the next time something resembling this bug shows up, the banner is the first place to look.

**Why extend `verify[]` to run `bun test tests/`.** Registering the invariant with a TS verifier file satisfies the methodology's structural checks (`methodology.registry.verifier_resolves` only requires the file exist), but `/feature-change`'s success criterion is `sdd verify && verify[]` — if `bun test` isn't in `verify[]`, dev-harness has no way to know the verifier is red or green. Without the include, the contract is registered but unenforced. Scoping the include to `tests/` (not `ui/`) avoids dragging the pre-existing DOM-environment break in `ui/src/__tests__/` into this ADR's scope; that's a separate concern best fixed in its own ADR.

**Why register the bad-path branch as a contract.** The original draft buried the "honor the value even when the path doesn't exist" rule in the Decisions table without a corresponding test or invariant clause. The Layer-1 design audit caught this as a narrative commitment without enforcement. The decision is substantive (it differentiates this dashboard from a silent-fallback design) and worth gating with a test. The 6th test case asserts `startWatcher` receives the configured nonexistent path; the invariant definition now spells out "honored even when the resolved path does not exist on disk."

**Why register the banner line as a separate invariant.** The Layer-1 design audit flagged the banner change as a narrative commitment without enforcement. The banner is the user-visible diagnostic that makes this whole bug class self-resolving — without a test, a future refactor of `buildStartupBanner` could drop the line and we'd lose the only at-a-glance signal of "which path did the dashboard actually pick." A separate invariant (`methodology.dashboard.banner_shows_resolved_docs_dir`) with its own test fits the methodology's "one contract per invariant" rule better than welding the banner clause into the resolution invariant.

**Why `requires:` points at `methodology.validator.config_spec_adr_dir`.** The original draft cited `methodology.config.spec_adr_dir`, but that entry is withdrawn (superseded by the validator-namespaced active version). The active successor is the correct dependency: this invariant operationally presupposes the validator-side contract that the field is structurally validated.

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| Boot with config: `spec.adr_dir = "alternate"` → watcher receives `<docsRoot>/alternate` | Config-respect branch | Temp repo with `.git` + `spec-driven-config.json` + `alternate/` dir | `boot.ts`, mock watcher |
| Boot without config → watcher receives `<docsRoot>/docs` | Fallback branch | Temp repo with `.git` + `docs/` only | `boot.ts`, mock watcher |
| Boot with config but missing `spec.adr_dir` → watcher receives `<docsRoot>/docs` | Fallback branch (partial config) | Temp repo with `.git` + minimal config | `boot.ts`, mock watcher |
| Boot with absolute `spec.adr_dir` | Absolute path passthrough | Temp repo with `.git` + config with absolute path | `boot.ts`, mock watcher |
| Boot with malformed JSON config | `boot()` throws an `Error` naming the config path | Temp repo with `.git` + invalid `spec-driven-config.json` | `boot.ts` |
| Boot with `spec.adr_dir` pointing at nonexistent path | `startWatcher` receives the configured (nonexistent) path; no fallback | Temp repo with `.git` + config pointing at `nonexistent-dir/` | `boot.ts`, mock watcher |
| `buildStartupBanner(port, docsDir, ifaces)` emits `Docs dir: <docsDir>` line | Banner contract | No FS needed — pure function under test | `server.ts::buildStartupBanner` |

These cases are the two verifiers (`boot-config-respect.test.ts` + the new banner test in `server-banner.test.ts`) — there's no separate integration suite for this ADR; the unit tests exercise both contracts end-to-end.

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `boot.ts` resolver + `docsDir` field on `BootResult` | ~30 | ~30k | New helper, one-line wire-up in `boot()`, return-shape extension. |
| `server.ts` banner extension | ~10 | ~15k | `buildStartupBanner` gains `docsDir` parameter; `main()` threads it from `boot()`. |
| `boot-config-respect.test.ts` | ~225 | ~60k | Six-case unit test (already authored by `/compile-invariants`). |
| `server-banner.test.ts` extension | ~10 | ~10k | One new test for the `Docs dir:` line (already authored). |
| ADR-0050 annotation | 1 | ~5k | One-line `> Superseded by…` note. |
| Registry + config-file updates | ~15 | ~5k | Two new invariants in `registry.yaml`; `bun test tests/` added to `verify[]`. |

**Total estimated tokens:** ~125k
**Estimated wall-clock:** ~40 min (most of the test code is authored; dev-harness's job is the production change in `boot.ts` + `server.ts`)
