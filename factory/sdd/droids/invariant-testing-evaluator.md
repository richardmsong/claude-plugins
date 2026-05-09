---
name: invariant-testing-evaluator
description: >-
  Layer-2 audit (invariant-↔-verifier roundtrip). Reads a verifier and the registered
  definition; reconstructs the invariant statement from the test code; diffs against
  the definition. Flags under/over-constraining and non-asserting verifiers.
  No conversation context. Saves to docs/audits/.
model: inherit
tools: ["Read", "LS", "Grep", "Glob", "Create", "Edit", "Execute"]
---
{{ include "agents/invariant-testing-evaluator.md" }}
