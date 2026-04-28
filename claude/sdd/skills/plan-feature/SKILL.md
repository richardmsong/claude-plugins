---
name: plan-feature
description: Design a new feature through structured Q&A. Produces an ADR (and updates impacted specs) after resolving all ambiguities. Also owns spec maintenance — handles backpressure when dev-harness discovers spec/ADR gaps during implementation.
version: 1.0.0
user_invocable: true
argument-hint: <description of the feature>
---

# Plan Feature

Structured design session for a new feature. Produces an **ADR** at `docs/adr-NNNN-<slug>.md` — and updates any impacted specs (`docs/**/spec-*.md`) in the same commit — after resolving all ambiguities with the user.

ADRs are dated, immutable records of individual decisions. Specs are living, present-tense descriptions of the current design. Git co-commits between an ADR and the specs it touches form the **lineage edge** that the `docs` MCP surfaces via `get_lineage`. This is load-bearing: without the co-commit, future agents cannot discover why a spec section looks the way it does.

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
2. WRITE the draft ADR file to disk NOW — with whatever you know so far, plus
   an "Open questions" section for everything unresolved. Stubs and TODOs are
   fine. This is the durability step — everything from here forward amends
   this file.
3. Ask questions (AskUserQuestion). Immediately after each batch of answers,
   edit the ADR file: remove answered questions, add their decisions to the
   relevant sections, append any new ambiguities surfaced by the answers.
   Repeat until "Open questions" is empty.
   (The draft ADR file may be committed between rounds — convenience, so the
   work survives branch switches. No spec edits, no status promotion.)
4. Finalize the ADR (remove any remaining stubs) and stage impacted spec
   edits (still under `Status: draft`).
5. Design audit (/design-audit) until CLEAN
5b. Spec-edit verification loop: run /spec-evaluator on the ADR until CLEAN
6. Flip the ADR status from `draft` -> `accepted` (append a history line with
   today's date). Commit ADR + spec edits together (single spec commit).
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

## Step 2 — Write the initial draft ADR file (DO THIS BEFORE ASKING QUESTIONS)

Pick a slug and write `docs/adr-NNNN-<slug>.md` to disk now. ADRs are numbered with a zero-padded 4-digit monotonic global counter — compute `N = (ls docs/adr-*.md | wc -l) + 1` at write time. If a later commit reveals the number's already taken, bump by 1 and retry (the rename is mechanical — only the filename changes). The template at the end of this section is the full shape. On this first write:

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

- **Batch questions by theme** — up to 4 questions per AskUserQuestion call
- **Provide concrete options** with descriptions explaining trade-offs
- **Use previews** for UI mockups or code snippets when comparing approaches
- **Put your recommended option first** with "(Recommended)" in the label
- **Don't ask yes/no questions** — offer real alternatives
- **Don't ask questions you can answer from the code** — only ask about decisions
- **Always include design ramifications in the question text** — explain the tradeoffs and consequences of each choice directly in the question, not just in the option descriptions. The user should be able to understand what each choice means for the system without having to ask "what are the ramifications?"

**After each AskUserQuestion returns, the first thing you do is edit the ADR file** — do not queue up the next batch first. Write the user's decisions into the relevant sections, delete the now-resolved entry from `## Open questions`, and append any new ambiguities surfaced by the answers. Only then draft follow-up questions and ask again.

**Keep going until there are zero unresolved ambiguities.** A design with open questions is not done.

**After each round of answers, explicitly audit for remaining ambiguity.** Walk through the entire design end-to-end — every data flow, every error path, every integration point — and ask yourself: "Could I implement this right now without guessing?" If the answer is no anywhere, formulate the ambiguity as a question and ask it. Keep doing this until you can honestly say there are zero open questions. Do not ask the user "is there anything else?" — it's your job to find the gaps, not theirs.

---

## Step 4 — Finalize the ADR + update impacted specs

The ADR file was written in Step 2 and amended through every Q&A round. By now `## Open questions` should be empty and every section should be filled in. This step is the last polish pass before audit — no TODOs, no stubs.

**All output goes in a single working tree change** that will be committed together. The co-commit is the lineage edge.

### 4a. Finalize the ADR

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

### 4b. Update impacted specs

For every surface the feature touches, edit the matching spec file **in the same working tree**:

Use `list_docs category=spec` to discover all specs. Match each change surface to the appropriate spec:

| Change surface                                       | Spec to edit                                  |
|------------------------------------------------------|-----------------------------------------------|
| Cross-cutting spec (touches 2+ components)           | `docs/spec-<concern>.md` (root)               |
| Component-local behavior (single component)          | `docs/<component>/spec-<topic>.md`            |
| Feature-local detail with no cross-cutting impact    | None — ADR alone is enough                    |

Component subfolders are created lazily — the first spec for a component introduces the folder.

### Spec-gap detection

For each component listed in the ADR's "Component Changes" section, check whether a component-local spec exists:

```
Glob("docs/<component>/spec-*.md")
```

If no spec file exists for a component, **create one** following the project's spec conventions. Read the component's production code to populate the spec with current behavior in present tense. Include the new spec in the co-commit with the ADR and other spec edits.

This check detects only the **absence of a spec file** — it does not verify that the new feature's behavior is described in the spec. Adding new behavior to an existing spec is handled by the table above. The two concerns are separate:
- Spec-gap detection: "does this component have any spec at all?" -> create if missing.
- Spec update: "does the spec describe this ADR's changes?" -> edit the existing spec.

When editing a spec, follow the **doc editing rules** below.

---

## Step 5 — Design audit

Run `/design-audit docs/adr-NNNN-<slug>.md` to verify the ADR is self-sufficient.

This calls the `design-evaluator` agent in a loop. The evaluator has no conversation context — it reads only the ADR (and referenced specs) plus the codebase. Between rounds, `/design-audit` classifies gaps (factual vs design decision), fixes factual ones, asks the user about decisions, and re-runs until CLEAN. All findings, fixes, and decisions are logged to `.agent/audits/`.

Do not commit or hand off until the audit passes.

---

## Step 5b — Spec-edit verification loop

After the design audit passes, verify that every ADR decision is reflected in the specs. Run `/spec-evaluator docs/adr-NNNN-<slug>.md` and loop until CLEAN:

```
Loop:
  1. Run /spec-evaluator docs/adr-NNNN-<slug>.md
  2. If gaps with direction SPEC→FIX: fix the spec, go to (1)
  3. If gaps with direction ADR→FIX: fix the ADR (still draft — editable in place), go to (1)
  4. If gaps with direction UNCLEAR: ask the user via AskUserQuestion, fix the appropriate side, go to (1)
  5. If CLEAN: proceed to Step 6
```

The spec-evaluator agent has no conversation context — it reads only the ADR and the specs. This ensures that the spec edits genuinely capture everything the ADR decided, not just what the master session remembered to include.

Do not promote to `accepted` or commit until the spec-evaluator returns CLEAN.

---

## Step 6 — Promote to `accepted` and commit (single spec commit)

Before committing, edit the ADR's header to flip the status:

```markdown
**Status**: accepted
**Status history**:
- YYYY-MM-DD: draft
- YYYY-MM-DD: accepted — paired with <list of spec-*.md files updated, if any>
```

Then stage the ADR together with any spec edits and commit once:

```bash
git add docs/
git commit -m "spec(<area>): <what changed and why>"
```

**This is the lineage edge.** The `docs` MCP reads co-commits to compute `get_lineage`. If the ADR is committed separately from the specs it modifies, lineage does not link them and future agents will have to re-read all ADRs to understand why a spec section exists.

Only `docs/` is staged in this commit. Code changes go through `/feature-change`'s dev-harness loop and commit separately.

### Drafts may be committed too

If the user wants to pause mid-planning, the draft ADR can be committed on its own (no spec edits, no status promotion):

```bash
git add docs/adr-NNNN-<slug>.md
git commit -m "draft(<area>): <what's being planned>"
```

A draft-only commit does **not** form a lineage edge. It only preserves the work-in-progress so it survives branch switches. The next invocation of `/plan-feature --resume` picks up from there.

---

## Step 7 — Hand off

After the ADR + spec edits are committed:

```
The design is complete at docs/adr-NNNN-<slug>.md
(and updates spec-<concern>.md). Run /feature-change to implement.
```

Do NOT write code yourself. The ADR + spec edits are the output. `/feature-change` implements the code.

---

## Doc editing rules

These rules apply whenever a doc is edited — during initial creation (step 4), during audit fixes (step 5), or during backpressure from dev-harness.

### ADRs are immutable

- ADR content is historical. Do not rewrite past decisions. If a later decision supersedes an earlier one, author a **new** ADR dated today that describes the supersession, and add a one-line `> Superseded by adr-NNNN-<slug>.md` note near the affected section (or at the top of the old ADR).
- Mechanical updates to an old ADR are allowed: fixing a broken cross-reference when a file is renamed, fixing a typo, restoring a broken link. These are not semantic changes.
- Never edit an ADR to change *what it decided* — author a new one instead.

### Specs are living

When editing a `docs/spec-*.md`:

**Adding something:**
- Add it to the right section with full payload/schema/wireframe
- Describe inputs, outputs, error cases, failure modes
- If it's a subject/event: include pattern, publisher, subscriber, payload
- If it's a UI element: include wireframe and behavior bullets

**Removing something:**
- Delete it entirely — no stale text, no "deprecated" markers
- Remove every reference to it across the spec

**Changing something:**
- Update in place — old text out, new text in
- Update every place it appears in the spec

**Never:**
- Leave specs and implementation out of sync
- Write implementation details (function names, file paths) in a spec
- Describe future/intended behavior — only what is true now or will be true after this ADR lands

### Commit rule

ADR + impacted specs are always committed together in a single spec-only commit, separate from any code changes:

```bash
git add docs/
git commit -m "spec(<area>): <what changed and why>"
```

---

## Backpressure from dev-harness

During implementation, `/feature-change` runs the dev-harness -> implementation-evaluator loop. Sometimes the dev-harness agent discovers that the ADR or a spec is ambiguous, incomplete, or wrong. This is **backpressure** — the implementation pushes back on the spec.

When `/feature-change` encounters backpressure, the doc update follows these rules:

### 1. Classify the gap

| Gap type | Action |
|----------|--------|
| **Factual error** (wrong endpoint, incorrect field name, stale reference) | Fix directly in the relevant doc. No user input needed. |
| **Missing detail** with obvious answer (from codebase/architecture) | Fill it in directly. |
| **Missing detail** requiring a design decision | Ask the user via AskUserQuestion. Batch related questions. |
| **Contradiction** (doc says X in one place, Y in another) | Determine correct answer from context. If genuinely ambiguous, ask the user. |

### 2. Decide which doc to edit

| What's wrong | Edit |
|--------------|------|
| Gap is in the ADR you just wrote | Edit the ADR (it hasn't been "historicized" by a later decision yet — still in the same workstream) |
| Gap is in a spec the ADR references | Edit the spec |
| Gap exposes a behavior that has no ADR (undocumented historical behavior) | Author a **new corrective ADR** dated today that describes the behavior and rationalizes it |
| A previously-decided ADR needs to be overridden | Author a **new superseding ADR** dated today — do not rewrite the old one |

### 3. Commit separately

```bash
git add docs/
git commit -m "spec(<area>): <what changed — backpressure from dev-harness>"
```

### 4. Return to `/feature-change`

Which re-invokes dev-harness with the updated spec. The loop continues until implementation-evaluator returns CLEAN.

---

## Anti-patterns

- **Don't assume answers** — if you're not sure, ask
- **Don't ask one question at a time** — batch them, the user's time is valuable
- **Don't write code** — this skill produces an ADR and spec edits only (and edits docs during backpressure)
- **Don't skip research** — uninformed questions waste the user's time; the docs MCP makes research cheap
- **Don't present false choices** — if there's only one reasonable option, state it as your recommendation and ask if they agree
- **Don't ask about implementation details** — ask about behavior, scope, and architecture. Implementation is for the dev-harness.
- **Don't rewrite old ADRs** — supersede them with a new ADR instead
- **Don't split the ADR commit from the spec commit** — the co-commit is the lineage edge

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
