# ADR-0075: Unbiased Evaluator Prompts

**Status:** accepted  
**Date:** 2026-05-01

## Context

When the master session spawns evaluator agents (design-evaluator, spec-evaluator, implementation-evaluator) and the dev-harness, it passes prompts that include discovery results (spec file lists) and priority hints (`Prioritize: <description>`). While documented as "priority, not scope," any guidance in the prompt risks biasing the agent toward specific areas and away from comprehensive evaluation.

The evaluator agents are designed to be adversarial — fresh-context auditors that find what the author can't see. Their agent definitions already contain complete discovery algorithms (e.g., spec-evaluator Phase 1 "Gather specs," implementation-evaluator Phase 1 "Gather docs and code"). Passing pre-discovered file lists or priority context undermines this by:

1. Narrowing the agent's attention to files the master session already knows about, potentially missing specs the master session didn't consider.
2. Implicitly telling the agent which findings matter more, which defeats adversarial completeness.
3. Making evaluation iterative toward the master session's understanding of the spec, rather than iterative toward what the spec actually says.

## Decision

### Evaluator prompts: target only, no discovery results

Each evaluator prompt contains only the target identifier — enough for the agent to know WHAT to evaluate, but nothing about WHERE to look or WHAT to prioritize. The agent's own definition contains the discovery and evaluation algorithm.

**Design evaluator** (no change — already minimal):
```
"Evaluate the design document at <path>. Report all blocking gaps or CLEAN."
```

**Spec evaluator** — remove the spec file list:
```
Before: "Evaluate spec alignment for ADR at <path>. Check all specs listed in the ADR's Impact section and any specs implied by its Component Changes section. ADR path: <path>. Spec files to check: <list>."
After:  "Evaluate spec alignment for ADR at <path>."
```
The agent's Phase 1 ("Gather specs") already discovers spec files by reading the ADR's Impact section and globbing `docs/**/spec-*.md`.

**Implementation evaluator** — remove spec file list, keep component root:
```
Before: "Evaluate the <component> component. Component root: <root>. Spec files: <list>. Also read cross-cutting specs at docs/spec-*.md. Read all spec docs and compare against the component's code."
After:  "Evaluate the <component> component. Component root: <root>."
```
The agent's Phase 1 already discovers specs via glob and groups by directory. Telling it which specs to read pre-empts that discovery.

### Dev-harness prompts: remove priority hints

**Initial invocation** — remove `Prioritize: <description>`:
```
Before: "<component> — audit the entire component against every accepted/implemented ADR and every docs/**/spec-*.md that references it. Close every drift. Prioritize: <description>. Any spec ambiguity = STOP and backpressure, never a guess."
After:  "<component> — audit the entire component against every accepted/implemented ADR and every docs/**/spec-*.md that references it. Close every drift. Any spec ambiguity = STOP and backpressure, never a guess."
```
The dev-harness agent definition already states: "You always audit the full component." Removing the priority hint ensures it doesn't unconsciously weight certain gaps over others.

**Re-invocation** — keep the remaining-gaps list:
```
"<component> — continue full-component audit. Close these remaining gaps: <list>. Any spec ambiguity = STOP and backpressure."
```
This is retained because: (a) the gaps were found by an independent evaluator agent, not the master session's opinion; (b) without it, the dev-harness would re-audit from scratch each time, wasting context on already-fixed issues; (c) this is an implementation directive ("fix these"), not an evaluation bias ("look here").

### Update skill files and feature-change SKILL.md

The prompt templates in the following skill files are updated:
- `skills/spec-evaluator/SKILL.md` — remove spec file list from prompt
- `skills/implementation-evaluator/SKILL.md` — remove spec file list from prompt (both single and all-components modes)
- `skills/feature-change/SKILL.md` — remove `Prioritize: <description>` from dev-harness invocation prompt, update the commentary that explains priority vs scope

### Documentation update

Remove the line in `skills/feature-change/SKILL.md` that says "The invocation prompt gives the harness *priority*, not *scope*" — since the priority hint is removed, this commentary is no longer applicable.

## Impact

| Component | Files |
|-----------|-------|
| skills | `skills/spec-evaluator/SKILL.md`, `skills/implementation-evaluator/SKILL.md`, `skills/feature-change/SKILL.md` |

## Component Changes

### skills

- `skills/spec-evaluator/SKILL.md`: Simplify the `Agent()` prompt to contain only the ADR path.
- `skills/implementation-evaluator/SKILL.md`: Simplify both single-component and all-components `Agent()` prompts to contain only the component name and root directory.
- `skills/feature-change/SKILL.md`: Remove `Prioritize: <description>` from the dev-harness invocation template. Remove the "priority, not scope" commentary. Keep the re-invocation template with gap list.
