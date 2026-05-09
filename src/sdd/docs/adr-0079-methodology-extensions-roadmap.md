# ADR-0079: Methodology Extensions — Deferred Roadmap

**Status**: draft
**Status history**:
- 2026-05-08: draft

## Overview

ADR-0078 establishes the invariant-driven development methodology with the parts that ship in its bootstrap commit (registry, glossary, ADR delta block, `sdd verify`, `/plan-feature` extension, `/compile-invariants`, reaction artifact generator — impact-only). Several extensions were declared **(deferred)** because they're either lower-priority, depend on tooling that doesn't exist yet, or warrant their own design discussion.

This ADR is a **parking lot** — it captures the deferred subsystems so they're not lost, with enough detail that each can be picked up via `/plan-feature --resume` (or split into a per-subsystem ADR) when work begins. While in `draft`, this ADR has no committed Invariant Delta — each subsystem's invariants are authored when its dedicated ADR is finalized, not now.

## Motivation

ADR-0078 is already large. Stuffing every deferred subsystem's full design into it would obscure the bootstrap. Pulling them out into a separate roadmap document keeps ADR-0078 focused on what's shipping while preserving a durable record of what's planned.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| ADR scope | Parking lot for ADR-0078's deferred items | Drafts are first-class; this gets the deferred work out of ADR-0078 without forcing premature design on each subsystem. |
| Invariant Delta in this draft | Empty during draft; each deferred subsystem's invariants ship in its own follow-up ADR when work begins | A draft can have an empty delta block. Promoting this ADR to `accepted` is not the goal — it stays draft until split. |
| Documentation specs | Excluded entirely | Pre-existing `docs/spec-*.md` are legacy; new contracts ship as registry entries, not prose specs. See ADR-0078's Decision history. |
| Per-subsystem split | Each deferred subsystem may be promoted to its own ADR via `/plan-feature` when work starts | Allows independent pacing; this roadmap is just a placeholder. |

## Deferred Subsystems

Each subsection below is a future `/plan-feature` candidate. Anyone resuming this work should pick a subsystem, draft a per-subsystem ADR, and remove the corresponding subsection here as it gets superseded.

### Reaction process — gates and CLI

ADR-0078 ships the **reaction artifact generator** (impact-only, in scope). The deferred pieces:

- **Reaction merge-gate** — CI status check that fails until every reaction artifact is `acked` (with `update`) or expired with an acceptable disposition. The generator currently emits artifacts; nothing forces ack. The gate is what turns the artifacts into a real workflow contract.
- **Object-clear gate** — CI status check that fails when any reaction artifact has `disposition: object`. Blocks merge until the objection is resolved.
- **Reaction CLI** — `/list-reactions`, `/show-reaction`, `/ack-reaction`, `/draft-followup`, `/object-reaction`. Modify artifact YAML in the working tree; CI revalidates on push.

**Open questions for its ADR:** What's the ack window (time-based expiry vs unlimited)? How is the artifact schema versioned? How does ack interact with supersession chains?

### Audit ritual extensions

The core layered audit chain (decision-invariant-evaluator decision-↔-invariant, statement-↔-verifier roundtrip, mutation tester, `/audit-invariants` orchestrator) is **in scope under ADR-0078**. The pieces that remain deferred here:

- **Differential-regen runner** — separate ritual: rm production × N, regenerate from invariants, diff against the rm'd version. Classifies divergence as appropriate-freedom vs. spec-gap. Heavier and orthogonal to the layered chain in ADR-0078; warrants its own design.
- `journey-author` subagent — generates failure-mode journeys from happy paths. Audit-time helper.
- `triage-assistant` subagent — pre-classifies pending reactions for the owner; fills `llm_suggestion` block in the artifact. Never auto-acks `core` invariants; never auto-objects. (For the reaction process, not the audit chain.)

**Open questions for their ADR:** What's the cadence (weekly cron, on-demand, per-PR)? How are findings persisted (artifact files in `docs/audits/`, dashboard surface, or both)? Should differential-regen run against the head of main or per-PR?

### Discovery (read-only)

Surfacing invariants to humans and LLMs at query time. Deferred:

- `docs-mcp` invariant indexer — extends the existing docs-mcp with registry/verifier/glossary node types and the edge types declared in ADR-0078's Lineage section.
- **MCP tools** — `list_invariants`, `search_invariants`, `get_invariant`, `get_invariant_lineage`, `get_adr_invariants`, `get_verifier_invariants`.
- **Dashboard extensions** — Invariants tab (sortable list with computed stability badge), invariant detail (registry entry + glossary term links + verifier link + supersession chain + citation list), reliance graph (force-directed), drift heatmap (last-audit-status overlay), reactions queue. Write-action parity with CLI slash commands.

**Open questions for its ADR:** Does docs-mcp embed the registry directly or query it on demand? How does the dashboard auth model work for write actions?

### Per-mechanism dispatch

`sdd run <invariant-id>` reads `dispatch{}` patterns from `spec-driven-config.json`, matches the entry's verifier path, runs the corresponding shell command. Selective per-invariant execution. Useful for audit rituals and targeted re-verification. Deferred until an audit ritual wants it.

**Open questions for its ADR:** What are the canonical token names (`{path}`, `{fn}`, `{dir}`, others)? How does dispatch interact with non-Go mechanisms (semgrep, buf, etc.)?

### Distributed context update

- `agent-plugins/src/sdd/context.md` — adds a one-line mention of the `## Invariant Delta` block convention so consumer LLMs (which read the distributed `context.md`) know the convention exists. Small, non-breaking; bundled with whichever follow-up ADR ships first.

**Open questions for its ADR:** None expected — this is a one-line documentation update, not a design.

## User Flow

Not applicable for a roadmap ADR. Each deferred subsystem will have its own user flow when its dedicated ADR is authored.

## Component Changes

This ADR makes no component changes by itself. It records what *will* change when each deferred subsystem is picked up.

## Data Model

Not applicable — no data model changes here.

## Error Handling

Not applicable.

## Security

Not applicable.

## Impact

No specs touched. No code changes. No verifiers added. This is a planning artifact.

## Scope

**In scope:** Capturing the deferred subsystems from ADR-0078 in one durable document so they're not lost.

**Explicitly deferred:** Every subsystem listed above. Each gets its own ADR + Invariant Delta when work begins.

## Invariant Delta

This ADR's delta is intentionally empty during `draft`. Per ADR-0078, an ADR with an empty delta cannot be promoted to `accepted` — that's the point: this stays draft until each deferred subsystem is split into its own ADR (which will carry the real invariants).

When a subsystem is promoted out of this roadmap into its own ADR, the corresponding subsection above is removed from this document.

### Added

(empty — see note above)

### Withdrawn

(empty)

## Decision history (rationale notes)

**Why a parking-lot ADR rather than per-subsystem ADRs upfront.** Six deferred subsystems × full Q&A each would be premature — most subsystems aren't on a critical path yet, and authoring six ADRs at once would burn design budget on speculative scope. The roadmap captures enough that nothing's lost; each subsystem's design is paid for when work actually begins.

**Why the empty Invariant Delta is acceptable here.** ADR-0078's rule says "ADR ⇒ at least one invariant delta" applies to ADRs that are promoted to `accepted` (the commitment surface). Drafts are explicitly allowed to be incomplete and committed (per ADR-0078's "Drafts may be committed too"). This ADR stays in `draft` indefinitely; if it ever needs to be promoted, the contents are first split into per-subsystem ADRs and this roadmap is withdrawn.

**Why documentation specs are excluded entirely.** Pre-existing `docs/spec-*.md` files are legacy under ADR-0078's framing. New contracts ship as registry entries, not prose specs. See ADR-0078's Decision history note "Why pre-existing spec-*.md docs become legacy, not load-bearing." The one exception (`context.md`) is captured as its own deferred subsystem above because it's distributed with the plugin and consumed by downstream LLMs.

## Open questions

(None — see per-subsystem questions above.)

## Integration Test Cases

No integration tests — change is planning-only, no runtime behavior.

## Implementation Plan

No implementation work for this ADR itself. Each deferred subsystem's implementation cost is estimated when its dedicated ADR is authored.
