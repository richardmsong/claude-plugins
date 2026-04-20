# ADR: Harness Loops Backpressure on Spec Ambiguity

**Status**: accepted
**Status history**:
- 2026-04-20: accepted

## Overview

The `dev-harness` agent, the `/feature-change` skill, and the `spec-evaluator` agent are tightened so that any spec ambiguity encountered during the implementation loop halts the loop and pushes the ambiguity back to the master session for a spec update, rather than being resolved silently by the harness picking a "reasonable" interpretation. Spec-evaluator is tightened in parallel to refuse marking ambiguous matches `IMPLEMENTED` — they are `PARTIAL [SPEC→FIX]`.

## Motivation

On 2026-04-20, the stop-button bug fix (ADR-0022) exposed a failure mode in the current loop:

1. Spec said `✕ Stop button (only when working)` — with no definition of *"working"*.
2. `dev-harness`, instructed by its then-current rule to "implement the minimal interpretation and note the ambiguity in the commit message," silently decided `working = {running | requires_action | plan_mode | waiting_for_input}` and landed the fix.
3. `spec-evaluator` accepted the match as CLEAN because the code implemented *a* plausible reading of the spec line.
4. The spec itself was never updated, so the next reader still encounters the undefined term and must re-derive the enumeration from code.

User feedback, verbatim: *"the spec and app behaviour should never have drift, and that's why the ADRs should act as that planning layer. but that's why if spec is ambiguous, it needs to be called out and corrected."*

ADRs are the planning layer. Specs are their present-tense projection. If the harness silently reconciles an ambiguity in code without pushing the decision back to the spec, the doc layer loses the decision and the system accumulates invisible drift. Every future agent has to re-derive the same choice.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dev-harness on ambiguity | STOP and raise backpressure, never guess | Aligns with the existing "missing required spec" rule. A reasonable interpretation is still a decision the master session has to own. |
| Dev-harness scope on invocation | Audit the full component every run; the invocation prompt provides *priority*, not *scope* | The old invocation pattern (`"focus on X"`) encouraged narrow fixes that left other drift untouched. The harness is an auditor-against-spec, not a narrow executor. |
| Spec-evaluator verdict rules | Any spec condition with an undefined qualifier or un-enumerated referent where the code had to pick among plausible readings → `PARTIAL [SPEC→FIX]`, not `IMPLEMENTED` | Without this, the evaluator rubber-stamps the exact drift the harness just introduced. |
| ADR status | Stays `accepted`, no `implemented` promotion | Per `/feature-change` Step 7, meta-process ADRs with no runtime code to evaluate remain at `accepted`. |

## Impact

Files edited in this commit (the co-commit lineage edge):

- `.agent/agents/dev-harness/AGENT.md` — replace the "minimal interpretation" clause in Spec Discipline with an unconditional STOP+backpressure rule; add explicit scope language that the harness audits the whole component every run regardless of focus.
- `.agent/skills/feature-change/SKILL.md` — Step 6 invocation template rewritten so the prompt hands the harness priority, not scope; reinforce that ambiguity is routed back to master.
- `.agent/agents/spec-evaluator/AGENT.md` — Phase 1 verdict rules add a clause that undefined or un-enumerated qualifiers in spec text block the `IMPLEMENTED` verdict.

No `docs/spec-*.md` changes. The affected surface is the process layer, not the product spec.

## Scope

In v1:
- The three file edits above.
- All future `/feature-change` runs follow the new loop.

Deferred:
- A formal pre-flight linter for undefined terms in specs (could catch `working`, `complete`, `idle`, etc. statically). Out of scope — the evaluator's Phase 1 rule covers it reactively for now.
- Retroactive audit of previously-implemented ADRs for silently-resolved ambiguities. Out of scope — they'll surface naturally when any future change touches the same sections.
