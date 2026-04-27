# Harness Maturity Scorecard — Spec-Driven Development Adoption

> Generated 2026-04-27. Updated with independent platform research.
> Measures each platform's ability to run the full SDD workflow loop.
> Scored on two axes: **Hooks Platform** and **Subagents Platform**.
>
> **Scoring principle**: Enforcement must be hard. Soft enforcement (AGENTS.md rules
> that vanish on context compaction) counts as **Missing**, not Partial. If the platform
> cannot mechanically prevent the master session from editing source files, any workflow
> that depends on that separation is downgraded — the loop may execute, but it is
> structurally unsound.

## Summary

| Platform | Hooks | Subagents | Total | Status |
|----------|:-----:|:---------:|:-----:|--------|
| **Claude Code** | **6 / 6** | **4 / 4** | **10 / 10** | Production — gold standard |
| **Devin CLI** | **4 / 6** | **4 / 4** | **8 / 10** | Hooks disabled (ADR-0062), enforcement absent |
| **Factory / Droid** | **5 / 6** | **4 / 4** | **9 / 10** | Hooks disabled (ADR-0062), enforcement absent |

---

## Hooks Platform

Both Droid and Devin share the same structural gap: no `agent_type`/`subagent_type` in PreToolUse hook input. Source-guard is impossible on both. **Per ADR-0062, PreToolUse hooks (source-guard + blocked-commands) are temporarily disabled on both platforms.** Only UserPromptSubmit (workflow-reminder) remains active.

| # | Capability | Claude Code | Devin CLI | Factory/Droid | Notes |
|---|-----------|:-----------:|:---------:|:-------------:|-------|
| 1 | PreToolUse (blocked-commands) | F | F | F | Pattern matching works on all three. Value is limited without source-guard. |
| 2 | UserPromptSubmit (workflow enforcement) | F | F | F | Supported on all three (ADR-0059). Sole compaction-surviving enforcement mechanism. |
| 3 | Source-guard (master/subagent separation) | F | M | M | **Same gap**: neither Devin nor Droid expose `agent_type` in hook input. Verified against Factory docs and ADR-0060 \S3. |
| 4 | Hook recovery (block -> agent retry) | F | M | F | **Devin-only gap**: hook block kills agent turn, goes silent. Droid shows stderr to agent (same as Claude). |
| 5 | PostToolUse hooks | F | F | F | All three support post-tool hooks |
| 6 | SessionStart / SessionEnd / PreCompact | F | F | F | Lifecycle hooks work on all three |

**Hooks subtotal**: Claude 6, Devin 4, Droid 5. The source-guard gap is identical on Droid and Devin. Devin additionally loses hook recovery.

---

## Subagents Platform

Scores mechanical subagent capability only. Enforcement is a hooks concern — scored there.

| # | Capability | Claude Code | Devin CLI | Factory/Droid | Notes |
|---|-----------|:-----------:|:---------:|:-------------:|-------|
| 1 | Subagent tool access | F | F | F | All platforms functional. |
| 2 | Dev-harness delegation | F | F | F | Mechanically functional on all three platforms. |
| 3 | Evaluator spawning (fresh context) | F | F | F | Read-only auditors — no enforcement dependency. |
| 4 | Backpressure loops | F | F | F | Loop mechanically executes on all three platforms. |

**Subagents subtotal**: Claude 4, Devin 4, Droid 4.

---

## Shared Infrastructure (both platforms equivalent)

| Capability | Claude Code | Devin CLI | Factory/Droid |
|-----------|:-----------:|:---------:|:-------------:|
| Skill discovery & invocation | F | F | F |
| Context injection (CLAUDE.md / AGENTS.md) | F | F | F |
| Cross-platform model slugs (ADR-0058) | F | F | F |
| Plugin distribution | F | P | F |

---

## The Symmetry

| Shared gap | Droid | Devin |
|-----------|:-----:|:-----:|
| No `agent_type` in hook input | Yes | Yes |
| Source-guard impossible | Yes | Yes |
| Hard enforcement absent | Yes | Yes |


| Unique gap | Droid | Devin |
|---------------|:-----:|:-----:|

| Hook block kills agent turn | No | **Yes** |

Droid (9) leads Devin (8) by 1 point. Devin's unique gap is the hook-block
turn-kill. Neither platform can enforce the SDD contract (no `agent_type` in
hooks), so neither is production-ready.

---

## Why Soft Enforcement Fails

The SDD workflow relies on a structural invariant: **only subagents write source code**.
This is not a suggestion — it is the mechanism that forces every change through
spec -> dev-harness -> evaluator -> backpressure.

Without hard enforcement:

1. **Context compaction erases AGENTS.md rules.** After compaction, the master session
   has no memory of the "never edit source files" instruction. The workflow-reminder
   hook re-injects a nudge, but nudges are not blocks.

2. **The model will take shortcuts.** Given a simple bug fix and no mechanical barrier,
   the master session will edit the file directly rather than spawning a 500-turn
   dev-harness subagent. This is rational model behavior, not a bug.

3. **The loop becomes optional.** If the master *can* bypass delegation, then delegation
   is a convention, not a contract. Conventions erode under pressure. Contracts don't.

Claude Code solves this with `agent_type` in PreToolUse stdin: the hook sees who is
calling, blocks the master, allows the subagent. No model compliance needed. No
compaction risk. Hard enforcement.

---

## Open Issues by Priority

| Priority | Platform | Issue | Impact |
|----------|----------|-------|--------|
| P0 | **Both** | No `agent_type`/`subagent_type` in PreToolUse hook input | Source-guard impossible. Hard enforcement absent. SDD contract unenforceable. |
| P1 | Devin | Hook `block`/`deny` kills agent turn silently | Hooks that fire become UX hazards; manual recovery required |

| P3 | Devin | No plugin install mechanism | Manual directory copy |

---

## What Each Platform Needs to Reach Production

### Both platforms (shared, P0)
1. Platform adds `agent_type`/`subagent_type` to PreToolUse hook input — **non-negotiable for SDD adoption**
2. Build step rewrites tool names in agent definitions for each platform

### Droid
3. (No remaining Droid-specific items)

### Devin
3. Devin team changes hook-block behavior to return reason to agent (enables self-correction)
4. Build a distribution mechanism (even a simple install script)
