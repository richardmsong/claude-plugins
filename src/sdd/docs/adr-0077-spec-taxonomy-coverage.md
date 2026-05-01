# ADR-0077: Spec Taxonomy and Coverage Enforcement

**Status:** draft  
**Date:** 2026-05-01

## Context

Spec creation in the SDD workflow is reactive — specs are created when an ADR happens to need one. There's no proactive mechanism to detect missing spec coverage. In practice, this means components grow code without corresponding specs, and the gap is only discovered when an evaluator agent trips over undocumented behavior.

The root problem: there's no definition of what spec coverage means for a component. Without a taxonomy, the question "should a spec exist here?" has no formal answer.

## Decision

### 1. Per-project spec taxonomy

A project-level file `docs/spec-taxonomy.md` defines the categories of specs and which components they apply to. The taxonomy is the menu — each component picks what applies.

Common categories:

| Category | What it answers |
|----------|----------------|
| **Capabilities** | What can users do? What problems does this solve? |
| **API contracts** | What are the interfaces? Request/response shapes, error codes |
| **Data model** | What's stored, how it's structured, what the invariants are |
| **Flows / sequences** | How do multi-step interactions work end-to-end? |
| **Configuration** | What's tunable, what the defaults are, what the constraints are |
| **Error handling** | What fails, how we detect it, what we do about it |
| **Security** | AuthN/AuthZ model, trust boundaries, data classification |

Not every component needs all of these. The taxonomy file declares which categories apply to which components.

### 2. Coverage evaluator

The implementation-evaluator (or a new spec-coverage evaluator) checks each component's `docs/<component>/` directory against the taxonomy and reports gaps: "component X requires a data-model spec but none exists."

### 3. Prompted spec creation

When /feature-change or /plan-feature authors an ADR that adds a new component, or adds capabilities to an existing component that cross into an uncovered taxonomy category, the master session is prompted to create the missing spec before proceeding to implementation.

## Status

Parked — will be designed fully after ADR-0076 (spec impact view) is implemented.
