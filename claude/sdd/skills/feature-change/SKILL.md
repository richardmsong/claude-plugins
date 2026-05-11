---
name: feature-change
description: Universal entry point for any change to the project — new features, bug fixes, refactors, config changes, anything. Classifies the change; delegates contract-introducing changes (new feature, behavior change) to /plan-feature for ADR + verifier authoring; runs the dev-harness -> verify-suite loop until `sdd verify && verify[]` exits 0. Bug fixes and pure refactors against existing invariants skip ADR authoring per ADR-0078.
version: 1.0.0
user_invocable: true
argument-hint: <description of the change>
---
{{ include "skills/feature-change/SKILL.md" }}
