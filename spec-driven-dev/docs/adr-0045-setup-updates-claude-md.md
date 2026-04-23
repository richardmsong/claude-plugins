# ADR: Setup always updates CLAUDE.md and strengthens trigger language

**Status**: accepted
**Status history**:
- 2026-04-23: accepted

## Overview

Change the setup skill to always inject/update the SDD workflow section in CLAUDE.md (even if the file exists), and strengthen the `/feature-change` trigger language to match `/plan-feature`'s immediacy. This lets SDD distribute important updates to downstream projects by re-running `/setup`.

## Motivation

Two problems:

1. **Weak /feature-change trigger**: The `/plan-feature` section has strong trigger language ("jump straight into", "don't wait", heuristics for when to fire). The `/feature-change` section only states a constraint ("never write code directly") but lacks equivalent "invoke immediately when X" language. This causes the model to analyze and start implementing before remembering to invoke the skill.

2. **Setup skip on re-run**: Step 6 (Scaffold CLAUDE.md) skips entirely if CLAUDE.md exists. When SDD distributes updates to the workflow prompt (like the trigger language fix above), re-running `/setup` can't propagate them. Users must manually edit their CLAUDE.md.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLAUDE.md update strategy | Delimit the SDD section with markers; replace between markers on re-run; preserve user content outside markers | Lets setup update its own content without clobbering project-specific rules |
| Marker format | `<!-- sdd:begin -->` / `<!-- sdd:end -->` HTML comments | Invisible in rendered markdown, unlikely to conflict with user content |
| /feature-change trigger | Add "invoke immediately" language + heuristics matching /plan-feature's pattern | Proven effective — /plan-feature's trigger language works reliably |
| Scope of CLAUDE.md content | SDD workflow rules only (feature-change, plan-feature, source restrictions, parallelism) | Project-specific content (component lists, deploy targets) stays outside markers |

## Impact

- Setup SKILL.md — Step 6 changes from "skip if exists" to "upsert between markers"
- CLAUDE.md template — strengthened /feature-change section with trigger heuristics
- `docs/conventions.md` — document the marker convention

## Scope

**In scope:**
- Marker-delimited SDD section in CLAUDE.md
- Upsert logic in setup skill
- Strengthened /feature-change trigger language

**Deferred:**
- Versioning the SDD prompt (comparing current vs new to skip no-op updates)
