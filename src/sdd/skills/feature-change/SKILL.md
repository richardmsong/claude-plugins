
# Feature Change

The entry point for **any change to any part of the project**. Features, bug fixes, refactors, config changes, UI tweaks, backend changes — everything starts here. Under invariant-driven development (see ADR-0078), `/feature-change` reads the registry + accepted ADRs, classifies the change, delegates ADR authoring to `/plan-feature` when a contract changes, and runs the dev-harness → verify-suite loop until `sdd verify && <project verify[]>` passes.

## Usage

```
/feature-change <description of the change>
```

Examples:
- `/feature-change add project creation to control-plane`
- `/feature-change login returns wrong URL to browser clients`
- `/feature-change refactor auth middleware to use context helper`
- `/feature-change remove server URL field from login screen`
- `/feature-change increase JWT expiry to 24h`
- `/feature-change helm chart missing resource limits`

---

## The contract surface

Two kinds of artifacts live under `docs/`:

- **ADRs** (`docs/adr-NNNN-<slug>.md`): immutable records of individual decisions, numbered via a monotonic global counter. Root only — ADRs never nest. Each carries a mandatory `## Invariant Delta` block (`### Added` and/or `### Withdrawn` — empty deltas are invalid). The Decision history section records *why* each non-trivial decision was made.
- **Audits** (`docs/audits/`): reports from the audit chain (`decision-invariant-evaluator`, `invariant-testing-evaluator`, `mutation-tester`). Generated, not authored.

The contract surface is the **registry at `<project>/spec/registry.yaml` + glossary at `<project>/spec/glossary.yaml` + verifier files** the registry points at. ADR Invariant Delta blocks are the audit trail for changes to the registry.

Pre-existing `docs/**/spec-*.md` files are legacy prose annotations under ADR-0078. They are not authored or updated by this workflow. The contract surface is the registry, not the specs.

Use `list_docs` / `search_docs` / `get_lineage` from the `docs` MCP to discover relevant ADRs and prior decisions before changing anything.

---

## The Loop

```
1. Read related ADRs (accepted/implemented status only) + the current
   registry/glossary to understand what contracts already exist.
2. Classify the change (A/B/C/D).
3. If B or C: delegate to /plan-feature to author the ADR + verifier files.
   If A or D: no ADR; go straight to dev-harness.
4. dev-harness -> verify-suite loop per component (until `sdd verify &&
   verify[]` passes).
5. If an ADR was authored in Step 3: flip its status accepted -> implemented
   and commit the status-only update.
6. Validate (SPA changes only — Playwright MCP smoke test).
```

**Not every change earns an ADR.** Under ADR-0078, the rule is "ADR ⇒ at least one invariant delta entry." Bug fixes against an existing invariant (Class A) and pure refactors (Class D) typically don't introduce or retire contracts — they're committed directly with a good message. New features and behavior changes (Class B/C) introduce or modify contracts and earn an ADR through `/plan-feature`.

---

## Step 1 — Read related ADRs + current registry

Use the `docs` MCP for ADR discovery:

- `search_docs` for keywords related to the change.
- `list_docs category=adr` to see all ADRs.
- `get_lineage` on an invariant ID — returns the ADRs that introduced and modified it. Read those first to understand prior decisions.
- `get_section` for targeted reads.

Only ADRs in `accepted` or `implemented` status are load-bearing — drafts, superseded, and withdrawn ADRs are skipped.

Also read the registry:

```bash
# Active invariants in the relevant component namespace
grep -A4 '^- id: <component>\.' <project>/spec/registry.yaml
```

Cross-reference: which existing invariants might this change introduce a `supersedes:` edge to? Which `requires:` edges might it need? Knowing this before Step 2 makes the classification cleaner.

---

## Step 2 — Classify the change

| Class | Meaning | ADR needed? | New verifier? |
|-------|---------|-------------|---------------|
| A — bug | Existing invariant is right, code violates it | No — commit fix directly | No (verifier already exists; goes from red to green) |
| B — new feature | No invariant covers the desired behavior | Yes — via `/plan-feature` | Yes — authored by `/compile-invariants` |
| C — behavior change | Existing invariant's contract changes (supersession) | Yes — via `/plan-feature` | Yes — new verifier supersedes the old |
| D — refactor | No invariant changes; behavior preserved | No — commit fix directly | No |

**A — Bug:** An existing registered invariant accurately describes the desired behavior, and the code doesn't satisfy its verifier. The fix is straightforward: make the verifier go green. No new ADR; commit message references the invariant ID. Example: `methodology.registry.no_and_in_definition` exists, but a registry entry slips through with "and" in its definition. Fix the entry.

**Litmus test for A:** Is there a registered invariant whose verifier is currently failing (or would fail) on the bug? If yes, Class A. If the fix requires adding a contract, configuration knob, or environmental setup the registry doesn't enumerate, escalate to Class C.

**B — New feature:** No existing invariant captures the desired contract surface. `/plan-feature` runs the Q&A loop to surface invariants, authors the ADR with an Invariant Delta block, and invokes `/compile-invariants` to produce verifier stubs. The verifiers start red; `/feature-change` resumes at Step 4 to drive them green.

**C — Behavior change:** An existing invariant's contract is changing in a substantive way. The new ADR has an `### Added` entry with `supersedes: <old_id>`; `/compile-invariants` authors a fresh verifier and removes the predecessor's. Class A/D modifications to an existing invariant's *definition* (typo fix, comments tweak) are direct registry edits without an ADR — git log is the audit.

**D — Refactor:** Internal restructure with no contract change. No new ADR. The verifier suite (`sdd verify && verify[]`) must remain green through the refactor; if any verifier fails along the way, the refactor has broken a contract and it's no longer Class D.

**Default to B/C when in doubt.** Under invariant-driven dev, "is this a new contract?" is a sharper question than "does this need an ADR?" If the change introduces behavior whose correctness can't be derived from existing invariants, register a new invariant.

---

## Step 3 — Delegate to /plan-feature (B/C only)

For Class B or Class C, invoke `/plan-feature` to author the ADR + verifier files:

```
/plan-feature <description> [— class <B/C>, related invariants: <list>, prior ADRs: <list>]
```

Pass context from Step 1–2. `/plan-feature` will:

- Write the draft ADR to disk on the first turn (durable through compaction).
- Run the conversational Q&A loop (1–2 questions per round), walking user flows to surface candidate invariants.
- Populate the mandatory `## Invariant Delta` and `## Decision history (rationale notes)` sections as decisions are made.
- Invoke `/compile-invariants` to author per-invariant verifier stubs (build gate: `go build` + `go vet` must pass; per-test reds are expected for impl-pending contracts).
- Generate impact-only reaction artifacts before the design audit.
- Run `/design-audit` (decision-invariant-evaluator) until CLEAN.
- Commit ADR + verifier files + reaction artifacts in a single commit.
- Promote the ADR's status to `accepted` at commit time.
- Hand back the path to the accepted ADR.

When `/plan-feature` returns, continue at Step 4. The verifier stubs are red until dev-harness lands the implementation.

For Class A or Class D, skip Step 3. Go directly to Step 4.

---

## Step 4 — dev-harness → verify-suite loop (exhaustive)

For each affected component, invoke the `dev-harness` agent and re-invoke until the verify suite passes:

```
Loop:
  1. Agent(subagent_type="dev-harness",
           prompt="<component> — make the verify suite pass.
                   Target verifiers: <invariant IDs from ADR's ### Added,
                   or the failing verifier(s) for Class A/D>.
                   Read `<project>/spec/registry.yaml` for context.
                   Any invariant ambiguity = STOP and backpressure.")
  2. When the agent returns, run: sdd verify && <project verify[] commands>
  3. If failures remain:
     a. Verifier still red, contract is clear (CODE->FIX):
        -> Re-invoke dev-harness with the remaining failures listed.
        -> Go to step 2.
     b. Verifier red because the contract is ambiguous (SPEC->FIX or UNCLEAR):
        -> Handle backpressure (see below).
        -> Go to step 1.
  4. If the verify suite passes (and `sdd verify` exit code is 0):
     -> Proceed to Step 5.
```

The verifier suite IS the success criterion. There is no separate evaluator — failing verifiers ARE the structured feedback. Per-invariant failures localize to specific contracts by ID with specific test names and messages.

**Launching agents:** Always spawn subagents in the background. On Claude Code, use `run_in_background: true`. When components are independent, launch their dev-harness agents in parallel. You will receive completion notifications — **do not poll, tail, or grep output files**. If you have independent work, do that while waiting. Otherwise tell the user what's running and stop until notified.

The dev-harness agent has `maxTurns=500` and is instructed to keep going until verifiers pass. If it hits context limits and returns with failures remaining, re-invoke it immediately with the remaining failure list. Each re-invocation picks up from the last commit.

### Handling backpressure

When dev-harness reports that a contract is ambiguous, contradictory, or missing — that is, the code can't be written because the invariant's definition doesn't say enough:

1. **Classify** the gap:
   - Factual error in the ADR → fix directly.
   - Missing detail with an obvious answer → fill in.
   - Design decision needed → ask the user via `AskUserQuestion`.
   - Contradiction with another invariant → identify which is correct; if genuinely ambiguous, ask.

2. **Decide what to edit:**
   - If the gap is in the ADR you just wrote (still in the current workstream) → edit the ADR's Invariant Delta block; re-run `/compile-invariants` to regenerate the affected verifier.
   - If the gap is a missing invariant for a real contract → add an entry to the ADR's Invariant Delta; run `/compile-invariants`.
   - If the gap exposes a previously-accepted invariant whose contract needs to change → author a new superseding ADR via `/plan-feature` (don't rewrite the old one).
   - If the gap is in the methodology itself (e.g. a structural rule doesn't fit your case) → that's an ADR against ADR-0078 or follow-ups; surface it explicitly.

3. **Commit** the doc/registry/verifier update(s) separately from code.

4. **Re-invoke** dev-harness against the corrected contract surface.

### Rules

- **Never report a task complete until `sdd verify && <verify[]>` exits 0.**
- One failing verifier = one more dev-harness pass (or one ADR/registry update).
- The verify suite runs after EVERY dev-harness pass, not just the first.
- **Never deprioritize a failing verifier** — every failure gets handled immediately.
- If a verifier can't be made green due to environment constraints, the contract is wrong; update the registry/ADR to reflect reality, then re-run.
- Running dev-harness once and summarizing results is NOT acceptable — the loop must close.

---

## Step 5 — Promote ADR to `implemented` (B/C only)

If Step 3 authored an ADR, once every affected component's verify suite is green for the ADR's scope:

1. Edit the ADR header:
   - Change `**Status**: accepted` → `**Status**: implemented`.
   - Append a new line to `**Status history**` with today's date: `- YYYY-MM-DD: implemented — all verifiers green`.

2. Commit **only** the ADR (status header change). No registry edits, no code changes:

```bash
git add <project>/docs/adr-NNNN-<slug>.md
git commit -m "spec(<slug>): promote ADR to implemented"
```

The status flip is intentionally a separate commit so lineage lookup distinguishes "shape the contract" (the `draft → accepted` co-commit with ADR + verifiers) from "lands in code" (the `accepted → implemented` ADR-only commit).

For Class A bug fixes and Class D refactors with no ADR, skip Step 5 — the code commits themselves are the audit trail.

For meta-process ADRs (skill rewrites, workflow changes) where there's no runtime verifier to drive green, promote to `implemented` once the described behavior is in place (the skill file updated, the workflow codified). Every ADR should eventually reach `implemented`.

---

## Step 6 — Validate (SPA changes only)

After CI deploys the preview, use the **Playwright MCP** to validate the golden path directly in the browser. Do not stop at "build passes" — drive the browser through the actual user flow.

```
Validation checklist for SPA changes:
1. Navigate to the preview URL.
2. Log in (use project-specific credentials).
3. Assert the changed screen/behavior matches the ADR's User Flow section.
4. Assert the previous state (before the fix/feature) is gone.
5. Test the specific acceptance criteria stated in the original request.
```

**Tools**: `mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_fill_form`, `mcp__playwright__browser_click`, `mcp__playwright__browser_wait_for`, `mcp__playwright__browser_evaluate`, `mcp__playwright__browser_console_messages`.

**Diagnostic tips** when something looks wrong:
- `browser_console_messages` — check for JS errors.
- `browser_evaluate` — inspect live state.
- Check pod logs or service logs to confirm the backend received the request.

Do not report the task complete until Playwright confirms the acceptance criteria are met in the running preview.

For non-SPA changes (CLI, backend, library, methodology), Step 6 is a no-op — the verify suite is sufficient.

---

## Master session write restrictions

Read `.agent/master-config.json` to determine which directories are agent-only. If the config exists and has a `source_dirs` field, the master session must **never** directly edit files matching those patterns — use dev-harness instead.

If `.agent/master-config.json` doesn't exist, skip restrictions (no master/agent separation configured).

The master session may always write to:

- **ADRs** (`docs/adr-*.md`, root only) — authored via `/plan-feature` in Step 3.
- **Registry + verifier files** (`<project>/spec/registry.yaml`, `<project>/spec/*_test.go`, etc.) — authored by `/compile-invariants` inside `/plan-feature`; the master session orchestrates but the invariant-compiler subagent writes.
- **Glossary** (`<project>/spec/glossary.yaml`) — same as registry.
- **Skill files** (`.agent/skills/` / `src/sdd/skills/` in this project) — process improvements.
- **Agent files** (`.agent/agents/` / `src/sdd/agents/`) — agent instructions.
- **`context.md`** — consumer-facing prose distributed with the plugin payload.
- **Memory files** — feedback, project context.

All implementation changes (production code, tests beyond verifier stubs, configuration, templates) go through dev-harness subagents. The master session classifies, authors ADRs via /plan-feature, orchestrates agents, and reads verifier output — it does not write code.

---

## Reference

- `<project>/spec/registry.yaml` — active invariants (the contract surface).
- `<project>/spec/glossary.yaml` — terminology.
- `<project>/spec/*_test.go` (or per-mechanism equivalents) — verifier files.
- `docs/adr-*.md` — one per decision; use `docs` MCP to search. ADRs live at root only.
- `docs/audits/` — generated audit reports.

Pre-existing `docs/**/spec-*.md` files are legacy under ADR-0078. They remain in place as human-readable prose annotations but are not maintained by this workflow and are not load-bearing. The contract surface is the registry, not the specs.

Use `list_docs` and `search_docs` from the docs MCP. Use `get_lineage` to trace which ADRs introduced or modified an invariant.
