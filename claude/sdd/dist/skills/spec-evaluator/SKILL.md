---
name: spec-evaluator
description: Spec alignment audit — verifies that specs reflect ADR decisions. Spawns the spec-evaluator agent (fresh context, no conversation history). Saves results to .agent/audits/.
version: 1.0.0
user_invocable: true
argument-hint: <adr-path>
---

# Spec Evaluator

Verifies that specs reflect ADR decisions. Spawns the `spec-evaluator` agent which reads only the ADR and the specs — no conversation context, no code.

This is the ADR-to-spec alignment check. For implementation compliance (code vs spec), use `/implementation-evaluator`.

## Usage

```
/spec-evaluator <adr-path>
```

**adr-path**: path to the ADR file to evaluate (e.g. `docs/adr-0053-spec-acceptance-loop.md`).

---

## Algorithm

1. Read the ADR's Impact and Component Changes sections to discover which specs should be checked.
2. `Glob("docs/**/spec-*.md")` to find all spec files. Match against the ADR's references.
3. Spawn the agent:

```
Agent({
  subagent_type: "spec-evaluator",
  description: "Spec evaluator: <slug>",
  prompt: "Evaluate spec alignment for ADR at <adr-path>."
})
```

The prompt contains only the ADR path. The agent's own definition (Phase 1: "Gather specs") discovers spec files by reading the ADR's Impact section and globbing `docs/**/spec-*.md`. No file list or focus hints are passed — the agent must be adversarial and comprehensive (ADR-0075).

4. The agent saves results to `docs/audits/spec-alignment-<slug>-<YYYY-MM-DD>.md` and returns CLEAN or a gap list.

---

## After running

If CLEAN: the specs fully reflect the ADR. Report to the calling skill.

If gaps found: the caller (typically `/plan-feature` or `/feature-change`) fixes the gaps, then re-runs this evaluator. Loop until CLEAN.

### Gap handling by direction

| Direction | Action |
|-----------|--------|
| `SPEC→FIX` | Master session updates the spec to reflect the ADR decision |
| `ADR→FIX` | Master session fixes the ADR (if still in current workstream) |
| `UNCLEAR` | Master session asks the user via AskUserQuestion, then fixes the appropriate side |

