# ADR: plan-feature must ask about design decisions, not just ambiguities

**Status**: implemented
**Status history**:
- 2026-04-29: accepted
- 2026-04-29: implemented — all scope CLEAN

## Overview

`/plan-feature` currently asks questions only when something is genuinely ambiguous — when the agent cannot determine the answer from context. This is too narrow. Many design decisions look "answerable" to the agent but represent real choices the user would make differently. The skill must ask about all decisions with meaningful alternatives, not just ones the agent finds confusing.

## Motivation

During ADR-0066/0067/0068 authoring, the agent made the following autonomous decisions without asking:
- Where ADRs should live (`docs/` at repo root vs `src/sdd/docs/` inside the plugin)
- How to number new ADRs (started at 0001 without discovering existing numbering)
- Which platform's `plugin.json` is the canonical version source (`factory` vs neutral `src/sdd/`)
- What the CI `git add` scope should cover (Claude-only vs all platforms)
- Whether `dist/` and `docs-dashboard/` are Claude-specific (they are not)

All of these were "answerable from context" in the sense that a plausible answer existed. None were genuinely ambiguous. All were wrong or contentious. The user had to discover and correct them after the fact.

The root cause is the anti-pattern "Don't ask questions you can answer from the code." This rule conflates two very different things:
- Implementation mechanics: how to write a loop, which API to call. These need no questions.
- Design decisions: naming, placement, ownership, inclusion/exclusion, cross-cutting impact. These always need questions if there are multiple defensible choices.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Threshold for asking | Ask about any decision with 2+ defensible choices, regardless of whether the agent has a preference | The agent having a preference does not mean the user shares it |
| Replace "can answer from code" anti-pattern | Replace with "ask about design choices, not mechanics" | Mechanics = how to implement a decision already made. Design = what to decide. |
| Structural decisions always warrant a question | File placement, naming, ownership/authority, inclusion/exclusion, integration with existing systems, CI/build impact | These are the categories that caused today's failures; treat them as a mandatory question class |
| Decision inventory before finalizing | Before Step 4 (finalize), explicitly enumerate every design decision made autonomously and surface any that weren't explicitly confirmed by the user | Catches decisions made during research+drafting that slipped past the Q&A rounds |
| Framing of questions | Include the ramification of each choice in the question body, not just the option label — the user must understand what they're choosing without follow-up | Already in the skill; reinforce with examples of what "ramifications" means |
| "Obvious" options | State your recommendation but still ask — never silently adopt it | Removes the loophole of "I have a clear recommendation so I won't ask" |

## Impact

- `src/sdd/.agent/skills/plan-feature/SKILL.md` — update Step 3 (Ask questions), update the anti-patterns section, add decision inventory sub-step before Step 4
- No specs require updating; skill file only

## Scope

`/plan-feature` skill only. `/feature-change` has no Q&A phase and is a separate concern.

## Integration Test Cases

No runtime behavior — change is to a skill instruction file only.
