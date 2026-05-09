---
name: decision-invariant-evaluator
description: Layer-1 audit (decision-↔-invariant roundtrip). Reads an ADR; reconstructs decisions implied by the Invariant Delta and diffs against the actual Decisions table; flags drift in either direction plus narrative commitments not registered as invariants. No conversation context. Saves to docs/audits/.
model: claude-sonnet-4-6
tools: Read, Glob, Grep, Write, Bash, Agent
background: true
---
{{ include "agents/decision-invariant-evaluator.md" }}
