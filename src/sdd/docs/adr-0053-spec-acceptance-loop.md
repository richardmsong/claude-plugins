# ADR: Spec acceptance loop — verified spec edits before co-commit

**Status**: implemented
**Status history**:
- 2026-04-24: draft
- 2026-04-24: accepted
- 2026-04-24: implemented — all scope CLEAN (meta-process ADR: agent/skill files updated)

## Overview

Add a formal spec-edit verification loop between the design audit passing and the `draft → accepted` co-commit. Today, once the design audit is CLEAN, the master session edits specs and co-commits the ADR status change + spec edits — but there's no verification that the spec edits actually capture everything the ADR decided. This ADR introduces a **spec-evaluator** (new agent) that reads only the ADR and the specs, calls out gaps where the ADR says X but the spec doesn't reflect X, and loops until CLEAN. Only then does the co-commit happen. Additionally, the existing `spec-evaluator` agent is renamed to `implementation-evaluator` since it evaluates code compliance, not specs.

## Motivation

The current `draft → accepted` transition in `/plan-feature` (Step 6) and the spec-edit phase in `/feature-change` (Step 4) are informal. The master session edits the spec based on its reading of the ADR, then co-commits. No independent agent verifies the spec edits against the ADR. This creates a gap:

- The design audit verified the ADR is self-sufficient and implementable.
- But nobody verified that the spec was actually updated to reflect every decision in the ADR.
- The spec-evaluator (implementation evaluator) only catches this later, during the dev-harness loop, when code and spec diverge because the spec was never updated.

This is the same pattern that ADR-0023 (harness backpressure) solved for code ambiguity: catch drift at the earliest possible point rather than letting it propagate downstream.

The rename of `spec-evaluator` to `implementation-evaluator` is a naming hygiene fix: the current agent evaluates implementation compliance, not spec quality. The new agent that actually evaluates specs against ADRs should own the name "spec-evaluator."

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New agent | `spec-evaluator` — reads ADR + all specs, reports gaps where ADR says X but spec doesn't reflect X | Fresh context, unbiased. Same pattern as design-evaluator and implementation-evaluator. |
| Rename existing | `spec-evaluator` → `implementation-evaluator` across all files (agent, skill, skills references in other skills) | The current agent evaluates code against specs, not specs against ADRs. "Implementation-evaluator" is what it actually does. |
| Loop location | Between design audit CLEAN and the co-commit (new step in /plan-feature and /feature-change) | Earliest point where spec drift can be caught. |
| Loop mechanics | Master edits specs → spec-evaluator runs → if gaps, master fixes → re-run → until CLEAN → co-commit | Same pattern as dev-harness → implementation-evaluator loop. |
| Evaluator scope | ADR-to-spec only: does the spec reflect the ADR's decisions? | Not code — that's the implementation-evaluator's job. Not ADR quality — that's the design-evaluator's job. |
| Gap directions | `SPEC→FIX` (spec missing something the ADR decided) or `ADR→FIX` (ADR contradicts itself or the spec is actually right) | Symmetric — sometimes the ADR is the problem, same principle as implementation-evaluator. |
| What "reflects" means | Every concrete decision in the ADR (behavior, field, endpoint, flow, error case) has a corresponding present-tense statement in the relevant spec | The spec is the living doc; the ADR is the historical record. The spec must absorb the ADR's decisions. |
| Cross-cutting vs component-local | Evaluator globs all specs for discovery, but reads only those listed in the ADR's Impact section plus those implied by Component Changes. Not a full-spec scan. | The ADR declares which specs it touches; the evaluator verifies the claim against those specific specs. |
| Skill rename | `/spec-evaluator` skill → `/implementation-evaluator`. New `/spec-evaluator` skill invokes the new ADR-to-spec agent. | Clean naming: skill name = agent name. Breaking change accepted — names should be correct. |
| Reverse pass | Forward pass only (ADR → spec). No reverse pass (spec → ADR). | Focused on the immediate problem: verifying spec edits before co-commit. Stale spec cleanup is a separate concern — defer it. |
| No-spec ADRs | Evaluator reads the ADR even when Impact says no specs touched. Verifies the claim. | Catches misclassification — e.g., a "bug fix" that actually introduces new behavior the spec should describe. Slower but prevents drift from lazy classification. |

## User Flow

### In /plan-feature (after design audit, before acceptance)

```
Current flow:
  Step 5: Design audit → CLEAN
  Step 6: Flip draft → accepted, co-commit ADR + spec edits

New flow:
  Step 5: Design audit → CLEAN
  Step 5b: Spec-edit loop:
    a. Master edits specs based on ADR
    b. Spec-evaluator agent runs (reads ADR + specs only)
    c. If gaps with direction SPEC→FIX: master fixes specs, go to (b)
    d. If gaps with direction ADR→FIX: master fixes the ADR (still draft — editable), go to (b)
    e. If gaps with direction UNCLEAR: master asks user via AskUserQuestion, then fixes the appropriate side, go to (b)
    f. If CLEAN: proceed
  Step 6: Flip draft → accepted, co-commit ADR + spec edits
```

### In /feature-change (after spec commit, reinforced)

```
Current flow:
  Step 4: Update impacted specs
  Step 5: Commit ADR + spec edits

New flow:
  Step 4: Update impacted specs
  Step 4b: Spec-edit verification loop:
    a. Spec-evaluator agent runs (reads ADR + specs only)
    b. If gaps with direction SPEC→FIX: master fixes specs, go to (a)
    c. If gaps with direction ADR→FIX: master edits the ADR (still in current workstream — editable per plan-feature backpressure rules), go to (a)
    d. If gaps with direction UNCLEAR: master asks user via AskUserQuestion, fixes the appropriate side, go to (a)
    e. If CLEAN: proceed
  Step 5: Commit ADR + spec edits
```

## Component Changes

### New agent: `.agent/agents/spec-evaluator.md`

The new spec-evaluator agent:
- Fresh context, no conversation history
- Reads the target ADR and all referenced specs
- For each concrete decision in the ADR (behavior, field, endpoint, flow, error case, schema, constraint), finds the corresponding spec statement
- Reports gaps where ADR says X but spec is silent or says Y
- Reports gaps where spec says something the ADR contradicts
- Output format matches design-evaluator/implementation-evaluator pattern: CLEAN or numbered gap list
- Saves results to `.agent/audits/spec-alignment-<slug>-<YYYY-MM-DD>.md`

Algorithm:

#### Phase 0 — Gather
1. Read the target ADR in full.
2. Read the ADR's Impact section to identify which specs it claims to touch. Also read the Component Changes section to identify any additional specs implied by component names (e.g., `docs/<component>/spec-*.md`).
3. `Glob("docs/**/spec-*.md")` to discover all spec files. Then read only the specs identified in step 2 — the glob is for discovery, not for reading everything. If the ADR references a spec that doesn't exist, that's a gap (SPEC→FIX: spec file should be created).
4. If the ADR's Impact says "no spec update needed": still proceed to Phase 1 (verify the claim — read the ADR's decisions and confirm none require spec changes).

#### Phase 1 — ADR → Spec (forward pass)
Walk the ADR section by section. For each concrete decision (behavior, field, endpoint, flow, error case, schema, constraint, configuration):
1. **Quote** the ADR text (exact line or meaningful excerpt).
2. **Find** the corresponding spec statement — search all referenced specs for a present-tense description of this decision.
3. **Verdict**:
   - `REFLECTED` — spec has a concrete, present-tense statement that captures this ADR decision.
   - `GAP` — ADR decides X, spec is silent on X or says something different.
   - `PARTIAL` — spec partially captures the decision but misses details.
4. **Direction** (for GAP and PARTIAL):
   - `SPEC→FIX` — the spec should be updated to reflect the ADR decision.
   - `ADR→FIX` — the ADR contradicts itself or the spec's existing text is actually correct and the ADR is wrong.
   - `UNCLEAR` — can't determine which side should change.

Skip non-decision content: motivation, historical context, deferred scope, implementation estimates.

#### Phase 2 — Summarize
Count REFLECTED, GAP, PARTIAL. If zero gaps: CLEAN. Otherwise list all gaps with direction.

Output format matches design-evaluator/implementation-evaluator: `CLEAN` or numbered gap list with directions.

### Renamed agent: `.agent/agents/spec-evaluator.md` → `.agent/agents/implementation-evaluator.md`

- File renamed, `name:` field in frontmatter updated
- All internal references to "spec-evaluator" in the agent description updated to "implementation-evaluator"
- Audit output filename prefix changes from `spec-<component>-` to `impl-<component>-` to avoid collision with the new spec-evaluator's `spec-alignment-<slug>-` prefix
- No other behavioral changes — same algorithm, same phases, same verdict format

### Renamed skill: `.agent/skills/spec-evaluator/` → `.agent/skills/implementation-evaluator/`

- Directory renamed
- SKILL.md updated: invokes `implementation-evaluator` agent instead of `spec-evaluator`
- Frontmatter `name:` updated to `implementation-evaluator`

### New skill: `.agent/skills/spec-evaluator/`

New SKILL.md. Unlike `/implementation-evaluator` (which takes a component name), this skill takes an **ADR path** as its argument:

```
/spec-evaluator docs/adr-NNNN-<slug>.md
```

The skill:
1. Reads the ADR's Impact and Component Changes sections to discover which specs should be checked.
2. Spawns the `spec-evaluator` agent with this prompt:

```
Agent({
  subagent_type: "spec-evaluator",
  description: "Spec evaluator: <slug>",
  prompt: "Evaluate spec alignment for ADR at <adr-path>. Check all specs listed in the ADR's Impact section and any specs implied by its Component Changes section. ADR path: <adr-path>. Spec files to check: <list of discovered spec paths>."
})
```

3. Returns CLEAN or the gap list.

When invoked without arguments from `/plan-feature` or `/feature-change`, those skills pass the ADR path of the ADR they're currently processing.

### Updated skill: `.agent/skills/feature-change/SKILL.md`

- Step 4b added: spec-edit verification loop before co-commit
- Step 6 references updated: `spec-evaluator` agent → `implementation-evaluator` agent
- All prose mentioning "spec-evaluator" updated to "implementation-evaluator" where it means the code-vs-spec check

### Updated skill: `.agent/skills/plan-feature/SKILL.md`

- Step 5b added: spec-edit verification loop between design audit CLEAN and acceptance co-commit

### Updated context.md

`src/sdd/context.md` currently contains no references to "spec-evaluator" — nothing to rename. The pipeline description on line 11 is:

```
The loop: /feature-change reads specs → classifies → authors ADR → updates spec if needed → commits spec → calls dev-harness → implements and tests.
```

This should be updated to mention the spec-edit verification step:

```
The loop: /feature-change reads specs → classifies → authors ADR → updates spec → spec-evaluator verifies spec alignment → commits spec → calls dev-harness → implementation-evaluator verifies code → done.
```

This is the only change to context.md.

## Data Model

No new data. The spec-evaluator agent writes audit files to `.agent/audits/` following the existing naming convention.

## Error Handling

| Failure | Behavior |
|---------|----------|
| Spec-evaluator finds gap that is actually an ADR error | Direction: `ADR→FIX`. In `/plan-feature`, the ADR is still `draft` — editable in place. In `/feature-change`, the ADR was just authored in the current workstream and hasn't been "historicized" by a later decision — it's editable per the backpressure rules in plan-feature ("Gap is in the ADR you just wrote → edit the ADR"). Master fixes the ADR, re-runs evaluator. |
| Spec-evaluator reports `UNCLEAR` direction | Master asks the user via AskUserQuestion, determines which side to fix, applies the fix, re-runs evaluator. Same pattern as the implementation-evaluator's UNCLEAR handling in `/feature-change` Step 6. |
| Spec-evaluator and design-evaluator disagree | Design-evaluator is authoritative for ADR quality; spec-evaluator is authoritative for spec-vs-ADR alignment. If the spec-evaluator finds something the design-evaluator missed, it's because the design-evaluator doesn't check specs. |
| No specs to evaluate (ADR with no cross-cutting impact) | Evaluator returns CLEAN immediately — nothing to verify. |
| Evaluator is too strict (flags non-decisions as gaps) | Same "only blocking gaps" rule as design-evaluator. Style, formatting, structure suggestions are not gaps. |

## Security

No change — same agent sandboxing as existing evaluators.

## Impact

Affects:
- `.agent/agents/spec-evaluator.md` — renamed to `implementation-evaluator.md`
- `.agent/agents/spec-evaluator.md` — new file (the ADR-to-spec evaluator)
- `.agent/skills/spec-evaluator/SKILL.md` — updated to invoke `implementation-evaluator`
- `.agent/skills/feature-change/SKILL.md` — Step 4b added, agent name references updated
- `.agent/skills/plan-feature/SKILL.md` — Step 5b added
- `src/sdd/context.md` — pipeline description updated

No spec updates needed — this is a process change to the SDD workflow itself.

## Scope

### In v1
- New spec-evaluator agent (ADR-to-spec alignment)
- Rename existing spec-evaluator → implementation-evaluator (agent file, frontmatter, all skill references)
- Spec-edit verification loop in /plan-feature Step 5b
- Spec-edit verification loop in /feature-change Step 4b
- Update context.md pipeline description

### Deferred
- Automated spec-evaluator in CI (run on every docs/ change)
- Spec-evaluator checking for stale spec sections that no accepted ADR references
- Dashboard integration showing spec alignment status

(All open questions resolved.)
