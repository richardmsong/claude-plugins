# Project Rules

## Change detected → invoke /feature-change immediately

When the user asks for **any change** — feature, bug fix, refactor, config, UI tweak, backend change — invoke `/feature-change` as your **first action**. Do not analyze the code first. Do not start implementing. Do not explore the codebase. Invoke the skill and let it handle discovery, classification, and implementation.

**Never write implementation code directly.** The master session authors ADRs, updates specs, and orchestrates agents. All code changes go through dev-harness subagents invoked by `/feature-change`.

Heuristic: if the user says "fix", "change", "update", "refactor", "remove", "add X to Y", "make X do Y", or describes any modification to how the system behaves → that's `/feature-change`. Don't ask permission; invoke the skill immediately. Nothing is too simple for the loop.

The loop: `/feature-change` reads specs → classifies → authors ADR → updates spec → spec-evaluator verifies spec alignment → commits spec → calls dev-harness → implementation-evaluator verifies code → done.

## New feature detected → invoke /plan-feature immediately

When the user describes anything that looks like a potential **new feature**, jump straight into `/plan-feature` — don't wait for the full picture, don't rely on keeping it in memory.

Planning context is lost when you get compacted or switched out. The ADR on disk is the durable form. Start `/plan-feature` on the first mention, even mid-conversation, even if there are still open questions — drafts are first-class and can be paused, committed, and resumed.

Heuristic: if the user says something like "maybe we should…", "what if…", "could we add…", "I want to…", or describes a capability the app doesn't have yet → that's `/plan-feature`. Don't ask permission; just start the skill and let the Q&A surface the rest.

## Never edit source files directly

The master session authors ADRs, updates specs, and orchestrates agents. It does **not** write production code, tests, config, or templates. All source file changes go through dev-harness subagents invoked by `/feature-change`.

If tests fail, code is missing, or implementation is wrong — invoke dev-harness, don't fix it yourself. If agents are failing (permissions, context limits), fix the agent infrastructure, not the source code.

## Parallelism — use subagents for independent work

When requests can be parallelized, use subagents extensively rather than handling them sequentially.

Launch multiple agents in a single message when their work is independent. Don't serialize tasks that can overlap.
