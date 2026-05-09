
# Plan Feature

Structured design session for a new feature. Produces an **ADR** at `docs/adr-NNNN-<slug>.md` plus per-invariant verifier stubs (authored by `/compile-invariants` from the ADR's Invariant Delta block) — committed together — after resolving all ambiguities with the user.

ADRs are dated, immutable records of individual decisions. Under invariant-driven development the contract surface is the ADR's Invariant Delta + the registry + the verifiers; pre-existing `docs/**/spec-*.md` files are legacy prose annotations, not maintained by this workflow.

Every ADR carries a **status** (`draft | accepted | implemented | superseded | withdrawn`). This skill starts new ADRs in `draft` and promotes them to `accepted` at the spec-co-commit step. Drafts can be paused and resumed freely; they don't co-commit with specs.

## Write-first principle (LOAD-BEARING)

**Write the draft ADR file to disk on the first turn, before any Q&A.** Context compaction or session switch-out can happen at any time; anything held only in your head evaporates. The file on disk is the durable form.

The initial write is allowed — and expected — to be incomplete:
- Unknown sections get a stub: `TODO: decide <question>` or `(decision pending: <question>)`.
- The `## Open questions` section at the bottom enumerates everything that still needs a user decision.
- Each round of Q&A amends the file in place: answered question -> decision incorporated + removed from open list; new ambiguity surfaced -> appended to open list.

**Never accumulate 3+ answered questions in memory before writing.** After each round of `AskUserQuestion`, the first action is to edit the ADR file with what the user just decided. Only then move on to the next batch of questions. If you get compacted mid-flow, the file already holds everything the user has told you.

## Usage

```
/plan-feature <description of the feature>
/plan-feature --resume [<slug>]
```

Examples:
- `/plan-feature GitHub OAuth for repo access`
- `/plan-feature multi-user support with per-user namespaces`
- `/plan-feature session sharing — let users share a session URL with a teammate`
- `/plan-feature --resume` — list all draft ADRs and pick one to resume
- `/plan-feature --resume session-sharing` — resume the matching draft directly

---

## Algorithm

```
0. If --resume: locate the draft ADR, re-read its current content, and jump into
   the Q&A loop with the remaining open questions.

   Otherwise: check for an existing draft ADR whose slug overlaps with the
   description (grep `docs/adr-*.md` — root only, ADRs never nest — for
   Status: draft, compare slugs). If one exists, offer to resume.

1. Research (read relevant specs + related ADRs via docs MCP)
1b. Big-picture conversation (AskUserQuestion). Share what you found:
   feasibility assessment, how the idea fits the existing system, what shape
   it might take, open unknowns. Ask the user to confirm or redirect before
   writing anything. This is the "do we even agree on what this is?" step.
2. WRITE the draft ADR file to disk NOW — with whatever you know so far, plus
   an "Open questions" section for everything unresolved. Stubs and TODOs are
   fine. This is the durability step — everything from here forward amends
   this file.
3. Ask questions (AskUserQuestion). Immediately after each batch of answers,
   edit the ADR file: remove answered questions, add their decisions to the
   relevant sections, append any new ambiguities surfaced by the answers,
   AND append a one-paragraph rationale note to ## Decision history capturing
   *why* the decision went this way (the pushback, the tradeoff, the option
   not chosen). The Decision history is written as decisions are made, not
   reconstructed at the end.
   Repeat until "Open questions" is empty AND the ## Invariant Delta block
   has at least one entry under ### Added or ### Withdrawn.
   (The draft ADR file may be committed between rounds — convenience, so the
   work survives branch switches. No spec edits, no status promotion.)
3c. Invariant compilation: invoke /compile-invariants <adr-path> to author
    per-invariant verifier stubs for every ### Added entry. The build must
    pass; per-test reds are expected for impl-pending contracts.
4. Finalize the ADR (remove any remaining stubs). No spec-*.md updates —
   the contract surface is the ADR's Invariant Delta + the registry +
   the verifiers, not prose specs.
4c. Reaction generation: walk the requires DAG from each entry in this ADR's
    delta block; for every downstream invariant Y where some new/withdrawn X
    appears in Y.requires, emit one docs/reactions/<...>.yaml artifact with
    introducer ADR + owner identification. Runs inline so blast radius
    informs the design before audit.
5. Design audit (/design-audit) until CLEAN
6. Flip the ADR status from `draft` -> `accepted` (append a history line with
   today's date). Commit ADR + verifier files + reaction artifacts
   together (single commit).
7. Hand off to /feature-change
```

---

## Step 0 — Resume a draft (if applicable)

If the user invoked `/plan-feature --resume [<slug>]`:

1. Find draft ADRs: `Glob("docs/adr-*.md")` (root only — ADRs never nest) -> for each file, read the top ~10 lines and keep those with `**Status**: draft`.
2. If `<slug>` was provided, pick the matching file (substring match). Otherwise, list the drafts to the user and ask which one to resume.
3. Read the full draft in context. Identify open questions (typically marked with TODO, "(decision pending)", or explicit question lists from prior Q&A rounds).
4. Skip Step 1 (research already done) and jump into Step 3 (ask questions) with the remaining opens.

If the user invoked `/plan-feature <description>` **without** `--resume`:

1. Grep `docs/adr-*.md` for `**Status**: draft` and extract each draft's slug from its filename.
2. If any draft's slug overlaps with the description's keywords, tell the user: "Found a draft at `docs/adr-NNNN-<slug>.md` that might match. Resume it, or start fresh?"
3. Otherwise proceed to Step 1.

---

## Step 1 — Research

Use the `docs` MCP to discover and read project documentation:

- `list_docs category=spec` — see every living spec.
- `list_docs category=adr` — see every ADR.
- `search_docs` — keyword search across ADRs and specs for terms related to the feature.
- `get_lineage` on a spec section — returns the ADRs that previously modified it. Read those first.
- `get_section` — targeted reads once you've identified a relevant section.

When globbing directly, ADRs live at `docs/adr-*.md` (root only — never nested) and specs live at `docs/**/spec-*.md` (recursive — cross-cutting at root, component-local under `docs/<component>/`).

Also:
- **Existing code**: grep for related patterns, interfaces, types.
- **Project-specific docs**: check CLAUDE.md for any project-specific doc references or conventions.

Use the Explore agent for broad codebase research. Use Grep/Glob for targeted lookups.

The goal is to understand:
- What exists today that this feature builds on or replaces
- Which specs will be touched
- Which prior ADRs shaped the relevant spec sections — so this ADR extends the lineage rather than contradicting it silently
- What components are affected
- What constraints exist

---

## Step 1b — Big-picture conversation

**Before writing anything**, share what you found in research and have a real conversation about whether this idea is feasible and what shape it should take. The user often has an idea but doesn't know if it's achievable, what its scope is, or how it fits the existing system. Your job here is to give them that picture — and let them redirect you before you commit anything to disk.

Use `AskUserQuestion` (1–2 questions per call). Cover:

- **Feasibility**: what would this require to build? Any blockers, missing infrastructure, or hard dependencies?
- **Shape**: how does this fit into the existing system — does it extend something that exists, replace it, or add a new seam?
- **Scope signal**: is the user imagining something small and targeted, or a bigger rethink? Let their answer shape how you draft.
- **Direction confirmation**: summarize your preliminary understanding of what they're asking for, and ask if you've got it right before proceeding.

This step is not a Q&A about design details — those come in Step 3. This is the "do we agree on what this even is?" conversation. Keep it open-ended and listen.

After this conversation settles the shape, proceed to Step 2 to write the draft.

---

## Step 2 — Write the initial draft ADR file (DO THIS BEFORE ASKING QUESTIONS)

Pick a slug and write `docs/adr-NNNN-<slug>.md` to disk now. ADRs are numbered with a zero-padded 4-digit monotonic global counter — compute N by extracting the highest existing number and adding 1: `N = $(ls docs/adr-*.md | sed 's|.*/adr-||' | cut -c1-4 | sort -n | tail -1) + 1` at write time. Do NOT use `wc -l` — file count diverges from max number when numbers are reused or files deleted. If a later commit reveals the number's already taken, bump by 1 and retry (the rename is mechanical — only the filename changes). The template at the end of this section is the full shape. On this first write:

- Fill in what you can from research: title, motivation, a rough sketch of the user-facing flow, which components are implicated, which specs are likely impacted.
- **Stub every uncertain section** with `TODO: <question>` or `(decision pending: <question>)`. It is better to write a bad first draft that captures what you're thinking than to hold it in your head.
- Enumerate open questions at the bottom under `## Open questions`. Each entry is one line and becomes a question to ask the user.

Identify ambiguities in these categories while you draft:
- **Architecture**: fundamental choices that shape the whole design
- **Behavior**: what happens in specific scenarios
- **Scope**: what's in v1 vs deferred
- **UX**: how the user interacts with it

The file must exist on disk before you invoke `AskUserQuestion` for the first time. Do not skip this step.

---

## Step 3 — Ask questions

Use `AskUserQuestion` to resolve ambiguities. Rules:

- **Ask 1–2 questions per AskUserQuestion call** — keep rounds small so each answer informs the next question before more are asked. This is a conversation, not a form.
- **Follow the user's direction** — after each answer, explicitly consider what it unlocked or changed before drafting the next question. Don't pre-script a fixed interrogation sequence.
- **Provide concrete options** with descriptions explaining trade-offs
- **Use previews** for UI mockups or code snippets when comparing approaches
- **Put your recommended option first** with "(Recommended)" in the label
- **Don't ask yes/no questions** — offer real alternatives
- **Ask about design decisions, not implementation mechanics** — mechanics are how to implement a decision already made (which API, which loop construct); design decisions are what to decide (naming, placement, ownership, inclusion/exclusion, integration with existing systems). Ask about all design decisions with 2+ defensible choices, even if you have a preference. Having a preference does not mean the user shares it.
- **Structural decisions always warrant a question** — the following categories require a question unless a prior ADR or spec has already explicitly resolved them: file/directory placement, naming conventions, which platform or component owns something, what is included vs excluded, how the feature integrates with existing systems, and CI/build impact.
- **State your recommendation but still ask** — never silently adopt a recommended option. Write "(Recommended)" in the option label, explain why, and ask. The loophole "I have a clear answer so I won't ask" is closed.
- **Always include design ramifications in the question text** — explain the tradeoffs and consequences of each choice directly in the question, not just in the option descriptions. The user should be able to understand what each choice means for the system without having to ask "what are the ramifications?"

**After each AskUserQuestion returns, the first thing you do is edit the ADR file** — do not queue up the next batch first. Write the user's decisions into the relevant sections, delete the now-resolved entry from `## Open questions`, append any new ambiguities surfaced by the answers, AND append a one-paragraph rationale note to `## Decision history (rationale notes)` capturing *why* the decision went this way (the pushback, the tradeoff, the option not chosen, any incident or constraint that drove it). Only then draft follow-up questions and ask again.

**Decision history is written as decisions are made, not reconstructed at the end.** Future maintainers reading this ADR shouldn't have to re-derive the *why* from the terse Decisions table. Each note is 1-3 sentences. If a decision was straightforward (only one defensible choice), no rationale note is needed — but if there was a real tradeoff, capture it now while the context is fresh.

**Frame the Q&A around invariants, not just behavior.** The right question is "what contracts is this ADR introducing or withdrawing?" — not "are there any invariants?" Every ADR that touches runtime behavior introduces at least one contract: a new field, a new endpoint, a new constraint, a new flow guarantee. The `## Invariant Delta` block is mandatory — an ADR with zero entries in `### Added` or `### Withdrawn` is invalid (it's not making any commitment, so it shouldn't exist as an ADR; commit it as a regular code change instead).

For every distinct contract the ADR commits to, add an entry under `### Added`:
- `id` — dotted path, e.g., `<component>.<concept>.<facet>`
- `definition` — one-line statement of the contract; no logical AND (split into separate invariants)
- `verifier` — `path` or `path::FuncName` for the test that operationalizes the contract
- `requires` — list of invariant ids this one logically depends on (becomes a DAG edge)
- `supersedes` (optional) — predecessor invariant id, if this is a substantive change to an existing contract

For every contract being retired, add an entry under `### Withdrawn` with `id` and `reason`.

**Keep going until there are zero unresolved ambiguities AND the Invariant Delta block has at least one entry.** A design with open questions or zero contracts is not done.

**After each round of answers, explicitly audit for remaining ambiguity.** Walk through the entire design end-to-end — every data flow, every error path, every integration point — and ask yourself: "Could I implement this right now without guessing?" If the answer is no anywhere, formulate the ambiguity as a question and ask it. Also ask: "What contract does this round of decisions commit to?" — every answered question typically corresponds to a new entry in the Invariant Delta. Keep doing this until you can honestly say there are zero open questions and the delta block reflects every commitment. Do not ask the user "is there anything else?" — it's your job to find the gaps, not theirs.

---

## Step 3b — Decision inventory (before finalizing)

Before moving to Step 4, walk through every design decision embedded in the current ADR draft — including decisions made during research and early drafting that were never explicitly put to the user as a question. For each one, ask: "Did the user explicitly confirm this, or did I decide it autonomously?"

Any decision that was made autonomously and falls into a structural category (placement, naming, ownership, inclusion/exclusion, CI/build impact, integration with existing systems) must be surfaced as a question now if it hasn't been asked yet. Batch them into AskUserQuestion calls (up to 4 per call) following the same rules as Step 3.

Only proceed to Step 3c once every structural decision has an explicit user answer on record — either from a prior Q&A round or from this inventory pass.

## Step 3c — Invariant compilation (verifier stubs)

Once the `## Invariant Delta` block is filled in and stable, invoke `/compile-invariants` to author per-invariant verifier code:

```
/compile-invariants docs/adr-NNNN-<slug>.md
```

This spawns the `invariant-compiler` subagent (fresh context, sees only the ADR + codebase). For every `### Added` entry it creates or appends a compiling test function at the path given by `verifier`. For every `### Withdrawn` entry it removes the predecessor's verifier file or function.

The build is the gate: `go build ./...` and `go vet ./...` must pass. Per-test PASS/FAIL is informational — reds are expected for impl-pending contracts (they'll go green when `/feature-change` lands the implementation).

If the compiler can't produce a compiling test (e.g., the verifier path conflicts with another invariant, or references a nonexistent type that the ADR hasn't defined yet), it stops and reports. Treat the report as backpressure: edit the ADR to resolve the conflict, then re-invoke `/compile-invariants`.

Only proceed to Step 4 once every `### Added` entry has a compiling verifier in the working tree.

## Step 4 — Finalize the ADR

The ADR file was written in Step 2 and amended through every Q&A round. By now `## Open questions` should be empty and every section should be filled in. This step is the last polish pass before audit — no TODOs, no stubs.

The contract surface under invariant-driven development is the ADR's Invariant Delta block + the registry + the verifiers (authored by /compile-invariants in Step 3c). There are no `docs/**/spec-*.md` updates — prose specs are legacy under this methodology. Any pre-existing spec-*.md files remain in place as human-readable narrative but are not load-bearing and not maintained by this workflow.

Re-read the ADR end-to-end. Remove the `## Open questions` section (or leave it empty with a comment). Confirm every section of the template below is present and concrete. If anything is still hand-wavy, go back to Step 3.

The template the file should conform to:

```markdown
# ADR: <Feature Name>

**Status**: draft
**Status history**:
- YYYY-MM-DD: draft

## Overview
One paragraph: what this is, why it exists, what it enables.

## Motivation
Why this change is being made now. Incident, user request, scalability pressure, or other trigger.

## Decisions
Key decisions made during design, with rationale.

| Decision | Choice | Rationale |
|----------|--------|-----------|

## User Flow
Step-by-step from the user's perspective.

## Component Changes

### <Component 1>
What changes, new endpoints/subjects/types, behavior.

### <Component 2>
...

## Data Model
New tables, KV entries, subjects, resources. Full schemas.

## Error Handling
What can go wrong and how each failure is surfaced.

## Security
Auth, token storage, scope, revocation.

## Impact
Which specs are updated in this commit.
Which components implement the change.

## Scope
What's in v1. What's explicitly deferred.

## Invariant Delta

Mandatory section. An ADR with no entries in either `### Added` or `### Withdrawn` is invalid — it's not committing to anything, so it shouldn't be an ADR. Commit the change as a regular code/spec change instead.

### Added

```yaml
- id: <invariant_id>
  definition: <one-line contract; no logical AND>
  verifier: <path>[::<FuncName>]
  requires: [<ids>]
  supersedes: <predecessor_id>   # OPTIONAL; if set, predecessor flips to withdrawn
  comments: |                    # OPTIONAL
    <free-form annotations>
```
*(Verifier file MUST exist and compile in the same commit. If `supersedes` is set, the predecessor's verifier file must be deleted in the same commit.)*

### Withdrawn

```yaml
- id: <invariant_id>
  reason: <terminal removal, no successor>
```
*(Verifier file MUST be deleted in the same commit. Registry entry retained with `status: withdrawn` for historical traceability only.)*

## Decision history (rationale notes)

Mandatory section. Preserves the *why* behind decisions captured tersely in the Decisions table. Each note is 1-3 sentences on a design choice that emerged from pushback during authoring; future maintainers shouldn't have to re-derive these from the conversation transcript (which is gone).

Written **as decisions are made**, not retroactively. After every Q&A round that resolves a non-trivial tradeoff, append a paragraph here.

**Why <decision A>.** <The pushback, the option not chosen, the constraint that drove the choice.>

**Why <decision B>.** ...

## Open questions

(Present during Steps 2-3; deleted before Step 4 finalizes the ADR.)

- <one-line ambiguity — what needs a user decision>
- ...

## Integration Test Cases

Smoke tests that run against the live cluster (or equivalent real infrastructure).
Each test case creates its own test fixtures, exercises the full stack, and cleans
up after itself. These are the project's confidence gate — if they pass, the
feature works end-to-end.

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|

Every ADR that touches auth, data flow, API endpoints, KV/DB state, or
cross-component communication MUST list at least one integration test case.
Purely cosmetic or config-only changes (no runtime behavior) may skip this
section with an explicit note: "No integration tests — change is
<cosmetic/config-only/docs-only>."

## Implementation Plan

Estimated effort to implement this design via dev-harness.

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|

**Total estimated tokens:** N
**Estimated wall-clock:** Xh of Yh budget (Z%)

### How to estimate

Lines of code: count spec lines that describe concrete behavior (endpoints,
subjects, handlers, UI components, schemas). Each spec line typically produces
10-30 lines of production code + 15-40 lines of test code depending on
complexity.

Tokens: dev-harness consumes roughly 50-80k tokens per component category
(build/unit/integration/component/e2e). Multiply categories x 65k as a
baseline, then adjust:
- Simple categories (build, lint, config): ~30k tokens
- Medium categories (unit, mocks, views): ~60k tokens
- Complex categories (integration, component, e2e, failure): ~100k tokens
- First-time component setup: +50k tokens overhead
```

---

## Step 4c — Reaction artifact generation

Before the design audit, walk the requires DAG from this ADR's delta block and generate reaction artifacts for every downstream invariant whose contract may be affected. The artifacts let owners explicitly acknowledge the change before merge.

For each entry in the ADR's `### Added` (with `supersedes`) or `### Withdrawn` blocks:
- Find every active invariant `Y` in the registry where the predecessor's id appears in `Y.requires`.
- For each such `Y`, write `docs/reactions/<adr-slug>-<Y-id>.yaml` with:

```yaml
triggering_adr: docs/adr-NNNN-<slug>.md
affected_invariant: <Y.id>
introduced_by: <ADR that authored Y>
owner: <owner of Y, from registry metadata>
status: pending
disposition: null   # ack | object — filled in by owner
```

For pure `### Added` entries with no `supersedes`, no reactions are generated — nothing downstream is affected by adding a new contract.

This step is **impact-only**: it generates the artifacts so blast radius informs the design before audit. The triage-assistant pass (which fills `llm_suggestion` blocks) is a separate, deferred concern.

The merge gate that enforces ack before merge is also deferred — for now, the artifacts are advisory. But generating them surfaces the impact to the author *now*, which is the load-bearing reason to run this step before the design audit.

If the registry doesn't yet exist in the project (e.g., the ADR is bootstrapping the methodology itself), this step is a no-op. Note that fact in the ADR's Decision history and proceed.

---

## Step 5 — Design audit

Run `/design-audit docs/adr-NNNN-<slug>.md` to verify the ADR is self-sufficient.

This calls the `decision-invariant-evaluator` agent in a loop. The evaluator has no conversation context — it reads only the ADR plus the codebase. Between rounds, `/design-audit` classifies gaps (factual vs design decision), fixes factual ones, asks the user about decisions, and re-runs until CLEAN. All findings, fixes, and decisions are logged to `docs/audits/`.

Do not commit or hand off until the audit passes.

---

## Step 6 — Promote to `accepted` and commit

Before committing, edit the ADR's header to flip the status:

```markdown
**Status**: accepted
**Status history**:
- YYYY-MM-DD: draft
- YYYY-MM-DD: accepted
```

Then stage the ADR together with the verifier files authored in Step 3c, and any reaction artifacts emitted in Step 4c, and commit once:

```bash
git add docs/ <project>/spec/  # spec/ holds the authored verifier files
git commit -m "spec(<area>): <what changed and why>"
```

The verifier files are co-committed because the `### Added` entries' contracts are only honored if their verifiers exist in the same commit (the methodology's `methodology.registry.verifier_resolves` invariant enforces this).

Code changes (the implementations that make red verifiers go green) go through `/feature-change`'s dev-harness loop and commit separately.

### Drafts may be committed too

If the user wants to pause mid-planning, the draft ADR can be committed on its own (no status promotion):

```bash
git add docs/adr-NNNN-<slug>.md
git commit -m "draft(<area>): <what's being planned>"
```

The next invocation of `/plan-feature --resume` picks up from there.

---

## Step 7 — Hand off

After the ADR + verifiers are committed:

```
The design is complete at docs/adr-NNNN-<slug>.md.
Run /feature-change to implement until the verify suite passes.
```

Do NOT write code yourself. The ADR + verifier stubs are the output. `/feature-change` implements the code that makes the red verifiers go green.

---

## Doc editing rules

These rules apply whenever a doc is edited — during initial creation (step 4), during audit fixes (step 5), or during backpressure from dev-harness.

### ADRs are immutable once accepted

- ADR content is historical. Do not rewrite past decisions in `accepted` or `implemented` ADRs. If a later decision supersedes an earlier one, author a **new** ADR dated today that describes the supersession (with a `supersedes:` entry in its Invariant Delta), and add a one-line `> Superseded by adr-NNNN-<slug>.md` note near the affected section.
- Mechanical updates to an old ADR are allowed: fixing a broken cross-reference, fixing a typo, restoring a broken link. These are not semantic changes.
- ADRs in `draft` status are editable in place — the same workstream can refine them.

### Pre-existing spec-*.md files are legacy

Pre-existing `docs/**/spec-*.md` files retain value as human-readable prose annotations of past decisions. Under invariant-driven development they are **not load-bearing** — the contract surface is the registry, glossary, and ADR delta blocks. This skill does not author new spec-*.md files and does not update existing ones. If a stale spec causes confusion, address it as a docs-only commit outside this workflow; do not let it block the ADR.

### Commit rule

ADR + verifier files are always committed together in a single commit, separate from any code changes:

```bash
git add docs/ <project>/spec/
git commit -m "spec(<area>): <what changed and why>"
```

---

## Backpressure from dev-harness

During implementation, `/feature-change` runs the dev-harness → verify-suite loop. Sometimes a verifier failure (or the dev-harness agent's own analysis) reveals that the ADR, registry, or spec is ambiguous, incomplete, or wrong. This is **backpressure** — the implementation pushes back on the contract surface.

When `/feature-change` encounters backpressure, the doc update follows these rules:

### 1. Classify the gap

| Gap type | Action |
|----------|--------|
| **Factual error** (wrong endpoint, incorrect field name, stale reference) | Fix directly in the relevant doc. No user input needed. |
| **Missing detail** with obvious answer (from codebase/architecture) | Fill it in directly. |
| **Missing detail** requiring a design decision | Ask the user via AskUserQuestion. Batch related questions. |
| **Contradiction** (doc says X in one place, Y in another) | Determine correct answer from context. If genuinely ambiguous, ask the user. |

### 2. Decide what to edit

| What's wrong | Edit |
|--------------|------|
| Gap is in the ADR you just wrote (still draft or in same workstream) | Edit the ADR. If a registered invariant changed, update the Invariant Delta block and re-run `/compile-invariants` to regenerate the verifier. |
| Gap is a missing invariant for a real contract | Add an entry to the ADR's Invariant Delta block, run `/compile-invariants` to author the verifier. |
| Gap exposes a behavior with no ADR (undocumented historical behavior) | Author a **new corrective ADR** dated today with a populated Invariant Delta. |
| A previously-accepted ADR's contract needs to change | Author a **new superseding ADR** with `supersedes: <predecessor>` in its delta — do not rewrite the old one. |

### 3. Commit separately

```bash
git add docs/
git commit -m "spec(<area>): <what changed — backpressure from dev-harness>"
```

### 4. Return to `/feature-change`

Which re-invokes dev-harness with the updated spec. The loop continues until the verify suite (`sdd verify && verify[]`) passes.

---

## Anti-patterns

- **Don't assume answers** — if there are 2+ defensible choices, ask regardless of whether you have a preference
- **Don't ask one question at a time** — batch them, the user's time is valuable
- **Don't write code** — this skill produces an ADR + verifier stubs only. Production code is the dev-harness's job.
- **Don't author new spec-*.md files** — under invariant-driven development, contracts go in the ADR delta + registry, not in prose specs. Pre-existing spec-*.md files stay as legacy.
- **Don't skip research** — uninformed questions waste the user's time; the docs MCP makes research cheap
- **Don't present false choices** — if there's only one reasonable option, state it as your recommendation and ask if they agree. But if there are two or more reasonable options, never silently pick one.
- **Don't ask about implementation details** — ask about behavior, scope, and architecture. Implementation is for the dev-harness.
- **Don't rewrite accepted ADRs** — supersede them with a new ADR instead
- **Don't split the ADR commit from the verifier commit** — the verifier files are the executable form of the ADR's contract; they ship together.
- **Don't author an ADR with an empty Invariant Delta** — if the change isn't worth a contract, it isn't worth an ADR. Commit the change directly.
- **Don't reconstruct Decision history at the end** — write rationale notes as each decision is made, while the pushback is fresh. Retroactive notes always lose the *why*.
- **Don't ship an `### Added` entry without its compiling verifier** — `/compile-invariants` runs after Q&A; the build must pass before finalize. The verifier is the contract's executable form.
- **Don't combine multiple contracts into one invariant** — definitions match `\band\b` should be split. Two contracts in one entry conflate failures and lose per-contract signal.

---

## Skill authoring conventions (when the output is a SKILL.md)

These apply whenever `plan-feature` is designing a new skill (i.e. the ADR describes changes to a SKILL.md):

**External binaries**
- List every required binary in a `## Prerequisites` section with a one-line install command.
- Always invoke binaries by name only — never hardcode an absolute path (e.g. `nats`). Rely on PATH.
- Example:
  ```bash
  ## Prerequisites
  which nats   # install: brew install nats-io/nats-tools/nats
  which kubectl
  which helm
  ```

**Idempotency**
- All setup steps must be safe to re-run (`--dry-run=client -o yaml | kubectl apply -f -`, `helm upgrade --install`, etc.).

**No hardcoded user paths**
- No `/Users/<name>/...` paths anywhere in a skill. Use env vars (`$HOME`, `$KUBECONFIG`) or relative paths.
