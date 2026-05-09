---
name: compile-invariants
description: Given an ADR with an Invariant Delta block, invokes the invariant-compiler subagent to author per-invariant verifier code (test stubs, lint rules, schemas) for every Added entry and remove verifiers for every Withdrawn entry. Invokable inline by /plan-feature or standalone.
version: 1.0.0
user_invocable: true
argument-hint: <path to ADR>
---
{{ include "skills/compile-invariants/SKILL.md" }}
