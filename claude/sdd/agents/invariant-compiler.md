---
name: invariant-compiler
description: Translates invariant statements (English contracts in an ADR's Invariant Delta block) into per-invariant verifier code — test functions, lint rules, schemas, arch configs. Fresh context per invocation. Reads ADR + codebase only; writes verifier files only (never production code).
model: claude-sonnet-4-6
tools: Read, Glob, Grep, Write, Edit, Bash
background: true
---
{{ include "agents/invariant-compiler.md" }}
