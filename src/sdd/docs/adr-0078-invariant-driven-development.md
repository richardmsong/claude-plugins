# ADR: Invariant-Driven Development with Compiled Verification (spec-driven-dev v2)

**Status**: draft
**Status history**:
- 2026-05-08: draft

## Overview

Evolve the `spec-driven-dev` plugin from markdown-spec methodology (v1) to **invariant-driven development with compiled verification** (v2). Named **invariants** — not markdown spec prose — become the canonical contract surface, and verification is performed by deterministic CPU-bound mechanisms (test files, lint rules, schemas, type-system checks) rather than LLM-as-judge spec-evaluators. LLMs appear only at *authoring* time (compiling invariants into verifier code) and *audit* time (quarterly differential regeneration to detect spec gaps and dead code), never in the recurring CI validation path.

The methodology is **additive**, not a parallel mode. ADRs that introduce invariants include an Invariant Delta block; ADRs that don't, don't. Existing markdown-spec ADRs continue to work as-is — the registry/CI/glossary machinery only activates when an ADR has invariants to register. No per-component mode flag, no dispatch logic, no formal cutover.

The plugin's own development uses v2 from Day 1 — `agent-plugins` is the bootstrap project, registering the methodology's own ~7–10 invariants first to prove the registry/glossary/CI-gate machinery before any consumer (the first being mclaude per its ADR-0100) bets on it.

## Motivation

The v1 SDD pipeline has a structural weakness: every gap between markdown spec and code is checked by an LLM evaluator doing fuzzy alignment. This carries:

- **Recurring per-CI cost.** spec-evaluator + implementation-evaluator run on every change; tokens accumulate and outcomes vary across model versions.
- **Non-deterministic outcomes.** Two runs of the same evaluator on the same code can disagree. Trust erodes.
- **Inability to detect dead/erroneous code.** Static evaluation answers "does the code reflect the spec?" but cannot answer "does any spec line require this code?" — leaving stale subtrees in place.
- **Spec drift at the vocabulary layer.** "Active user", "registered host", "valid session" — fuzzy English terms drift across the spec without anyone noticing because nothing pins them.
- **Premature crystallization vs. unconstrained drift.** Markdown specs offer no mechanism to distinguish "load-bearing contract" from "implementation detail we wrote prose about." The two get conflated.

V2 shifts the contract surface from prose to executable artifacts (test files + lint rules + schemas), with a typed invariant registry as the meta-layer that names, indexes, and coverage-checks every claim. This is not a rejection of SDD's discipline — ADRs continue to carry decisions and rationale — but the *spec* layer becomes deterministically verifiable, and dead code becomes mechanically detectable via differential regeneration.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Spec form | Tests as spec: language-native test files (`*_test.go` for Go, `*.test.ts` for TypeScript) + architecture-rule files (`.arch/`, `depguard.yaml`) + schema files (`.proto`, `.cue`) + lint analyzers, all indexed by an invariant registry | Tests pin behavior deterministically; lint rules pin structure; schemas pin contracts. The full set is the executable spec. Markdown can't be deterministically verified at acceptable cost. |
| Decomposition unit | Named **invariants** with stable IDs (e.g. `topology.user_has_one_namespace`) | ADRs are too coarse (one ADR makes many decisions); unit tests are too granular (no semantic naming). Invariants give a registry that is coverage-checkable, roundtrippable, and evolvable deltawise. |
| Invariant lifecycle | ADRs declare deltas (add/modify/remove invariants) on a running registry; the registry is the source of truth for "what this system promises now" | Specs collapse history; the registry is timeless. Roundtripping the *current* invariants from the test suite is well-defined; roundtripping a historical ADR from the spec is not. |
| Verification taxonomy | The methodology recognizes mechanisms (unit, table, property, architectural-rule, AST, type-system, schema, codegen-completeness, integration, journey) as documentation of the menu. Mechanism is NOT stored per-invariant — the verifier path itself indicates the runner (`*.go::Func` → `go test`, `*.semgrep.yml` → `semgrep`, etc.). | Mechanism enum was documentation-only, not driving anything operational. Storing it per-invariant added validation overhead without operational value. Path extension carries the dispatch info; the methodology's menu of mechanisms is described in prose. |
| LLM role | Authoring + audit only, never recurring validation | Token cost is paid once per invariant (compilation) and once per quarter (audit), not per CI run. CI is pure CPU, sub-minute, deterministic. |
| Language binding | Spec encoded in the *consumer language* (Go test files for Go projects, TS test files for TS projects); the language is part of the contract | Goroutine semantics, `context.Context` propagation, error-wrapping conventions, async/await idioms are load-bearing. "Recompile to a different language" would silently drop them. |
| Constraint scope | Constrain contracts (user-visible, cross-component, security-critical); leave internals liquid | Overconstraint causes refactor friction and premature crystallization. Differential regeneration tells us when the line is drawn wrong (divergence-with-correctness = appropriate freedom; divergence-with-incorrectness = real spec gap). |
| Vocabulary precision | Hybrid: types-as-glossary primary (entities → language types, predicates → methods); explicit `glossary.md` for cross-cutting concepts and ambiguous domain terms | Invariant statements use *terms*; un-pinned terms drift at the vocabulary layer. Types carry most of the load (compile-checked, refactor-safe); a small glossary covers what types can't express. CI gate: every term in an invariant statement resolves to a typed binding or glossary entry. |
| Registry framework approach | Custom thin per-language layer (~200 LOC) + reuse of per-mechanism tools; no off-the-shelf "invariant registry framework" exists that fits | Closest adjacent frameworks (ArchUnit, fitness functions, TLA+, OPA/Rego, CUE, Concordion, JML, Cucumber) cover slices but none combines named registry + multi-mechanism verification + CI-gateable coverage. Building thin and reusing mature per-mechanism tools is the right shape. |
| Per-mechanism tool choices (Go projects) | Behavior: `go test` + table tests; Property: `rapid`; Architecture: `go-arch-lint` + `depguard`; AST: `semgrep` + `go/analysis`; Schema: `protobuf` + `buf`; Type system: `exhaustive`, `nilaway`, sealed interfaces; Codegen completeness: `go:generate` + reflection; Mutation: `go-mutesting` (audit-only) | Mature, Go-native, refactor-friendly. Other languages get analogous default toolchains documented in the methodology spec. |
| Plugin shape | Evolution of spec-driven-dev. Existing skills (`/plan-feature`, `/feature-change`) extend to support invariants additively. ADRs without Invariant Delta blocks remain valid. | Solo-developer-friendly: no parallel modes, no dispatch logic, no formal cutover. Invariants are an opt-in feature per ADR. |
| Bootstrap project | agent-plugins itself; methodology's own invariants register first (Day 1), consumer-project invariants follow (Day N) | Self-application is evidence of generality. Proving the framework on its own meta-level before consumers bet on it de-risks adoption. |
| Stability is computed | No `tier` field. Stability is derived from `citation_count(X) = |{Y : Y in Registry, X in Y.Requires}|`. Thresholds (configurable): 0 → uncited, 1-2 → stable, ≥3 → core. The dashboard renders this as a computed badge. | Stability is observed, not declared. An invariant becomes stable as the system organically depends on it; no manual promotion ceremony, no evidence-gathering ADRs. The methodology surfaces stability empirically. Manual override (`manual_stability: core`) exists for rare upfront declarations (security boundaries) but defaults are computed. |
| Invariant status | Two states: `active` / `withdrawn`. `withdrawn` invariants may have `superseded_by` set if there's a successor; otherwise terminal. | Deprecation as a separate state was redundant — the warning function is served by the reaction process when withdrawal is proposed. Superseded as a separate state was redundant — supersession is a relationship recorded on the new invariant, with old marked withdrawn. Two states are sufficient. |
| ADR meta-edges to invariants | Two only: `introduces` (with optional `supersedes` sub-field on each Added entry) and `withdraws` (terminal). All other lifecycle events are computed or fold into these. | Modify (Class A) is registry edit only — git log is the audit; no ADR delta needed. Modify (Class B/C) becomes Supersession (introduce new version superseding old). Promote/Deprecate are emergent or unnecessary. Two meta-edges keep the methodology's structural events minimal. |
| Conflict resolution authority | Authority hierarchy: statement > verifier > code. Operational reality: verifier is what CI runs. When statement and verifier conflict at audit, the verifier is the bug (it should be a deterministic encoding of the statement). Statement is revised only when audit reveals the original statement was ambiguous. | Three artifacts encoding the same truth means drift is possible. An explicit hierarchy gives a deterministic resolution rule rather than living with silent drift. |
| Verifier-required at ADR drafting | Every `### Added` entry ships with its per-invariant test file in the same commit. ADRs cannot finalize while any newly-added invariant lacks a test that **compiles** in the working tree (function exists, references resolve). Whether the test **passes** is dev-harness's gate, not the ADR's — for genuinely-new contracts the test starts red and goes green when implementation lands. The `invariant-compiler` subagent is invoked inline during ADR authoring. | Invariant statements are provisional until the test exists — writing the test is the precision-forcing function that exposes ambiguities the prose hides. Compile-vs-pass distinction matches the lifecycle: `/plan-feature` produces the contract; `/feature-change` makes code satisfy it. Speculative invariants ("nice if we tracked X") get filtered because they can't survive test-authoring. |
| Independence rule | Registered invariants are pairwise logically independent. If A's truth implies B's truth, B is not a separate invariant — consolidate into A or document as a corollary in A's prose. The registry is a minimal set of claims, not a decomposed catalog. New claims become new invariants if and only if they are not logically implied by any existing one. | Bounds registry growth deterministically. Decomposition isn't "lazy" or "eager" — it's a consequence of the independence rule. A schema's per-field validations are implied by "schema well-formed" and don't get registered separately; cross-row uniqueness isn't implied and does. |
| Edge taxonomy | DAG edges between invariants are `requires` and `supersedes` only. `requires` (operational): A's verifier presupposes B's truth; A can't be checked if B is broken. `supersedes` (temporal): B replaces A in time. `composed_of` and `implies` are dropped — the first is redundant aggregation; the second indicates a registration error (consolidate or document inline). | Two edge types, both encoding non-logical relationships. The DAG is purely operational dependency, used for verification ordering, withdrawal cascade, audit prioritization. Logical relationships between invariants don't earn an edge type because they shouldn't exist between *registered* invariants. |
| No composite invariants | The methodology has no concept of composite/aggregate invariants. Cross-cutting contracts (cross-row uniqueness, referential integrity, aggregate counts, ordering, etc.) are themselves standalone invariants with `requires` edges to the field/row invariants they presuppose. They are not composed of those leaves; they are independent claims that happen to depend on those leaves operationally. | "Composite as conjunction-of-leaves" is redundant aggregation (smell). "Composite as cross-cutting claim" is misnamed — it's just a standalone invariant. Either way, the term "composite" adds no operational meaning. Drop it; everything in the registry is a standalone invariant connected by `requires` and `supersedes` edges. |
| Definition vs Comments fields | Registry entry has two text fields: `Definition` (the contract; changes trigger Modified deltas and reactions) and `Comments` (free-form annotations: insights, edge cases, performance notes, historical context; changes do not trigger reactions; freely editable). | Most documentation refinement isn't a contract change. Splitting allows informational annotations to accumulate without ceremony, while keeping the contract surface stable. Comments are advisory — wrong comments don't fail CI; the audit flags suspect ones. LLM tools (compiler, triage, audit) read comments as context. |
| Invariant registry format | YAML (`<project>/spec/registry.yaml`); embedded and parsed via `gopkg.in/yaml.v3`. | Cross-references in the registry (`Verifier`, `Requires`, `Supersedes`, `GlossaryTerms`) are stringly-typed regardless of host language; YAML's compile-time advantage is illusory. YAML is more honest about the registry's stringly-typed nature, easier to read, diff, and edit. |
| Glossary form | YAML (`<project>/spec/glossary.yaml`); same parsing path as registry. | Symmetric with registry; same trade-offs. Typed bindings remain the primary glossary surface; YAML covers what types can't express. |
| Per-invariant test layout | Tests live in the project's native test layout under `<project>/spec/` (or co-located by convention). Verifier path in the registry is what binds invariant ID to test function. | The tests are project code in the project's language; they have to exercise project code, so they live where the project's test runner expects them. |
| ADR delta block structure | Dedicated `## Invariant Delta` section with `### Added` and `### Withdrawn` sub-blocks. | Visibility wins over duplication; embedding in Decisions table or Component Changes obscures the structured-data nature of deltas. Parser scans for `## Invariant Delta` heading. |
| Tooling architecture | `sdd verify` CLI does structural validation (registry/glossary/ADR-delta well-formed, DAG integrity, no orphans, delta reconciliation) using the methodology's own invariants as its built-in checks. The CLI also shells out to commands listed in `spec-driven-config.json`'s `verify[]` for per-mechanism runners. Per-invariant tests run via the project's native runner (`go test ./...`, `pytest`, etc.); selective per-invariant execution is a path-dispatch wrapper (`sdd run <id>`) reading `dispatch{}` from config. | Centralized adapter framework was over-engineering: all dispatch is shell commands; per-project config is the right place to specify them. The methodology owns structural validation (universal); projects own their tooling lineup (specific). |
| ADR ⇒ at least one invariant delta | An ADR that introduces no `### Added` and retires no `### Withdrawn` entries is not an ADR. Cosmetic/docs-only changes don't earn an ADR; they're git commits. | Reverses the "is this an invariant?" Q&A framing. ADRs are the methodology's commitment surface; if a change isn't worth an invariant, it's not worth the ADR ceremony either. Forces the "what contract is changing?" question on every ADR. |
| Differential regeneration cadence + owner | (decision pending: quarterly + manual, nightly + scheduled, on-demand only; who triages divergence) | |
| Skill suite scope | (decision pending: which become first-class `/`-commands vs. fold into existing skills) | |

## User Flow

The development cycle for a v2 component (in any consumer project):

1. **Change request enters.** User asks for a feature, fix, refactor, etc.
2. **Master session authors an ADR draft** via `/plan-feature`. If the ADR will introduce or withdraw invariants, the author includes the structured **Invariant Delta** block (`### Added` and/or `### Withdrawn`). If not, the ADR proceeds as a standard markdown ADR.
3. **Invariant decomposition + verifier authoring (single step).** Each new invariant is named and stated in one line, AND its verifier is authored in the same commit. The skill blocks ADR finalization until every Added entry has a verifier file that compiles and runs. Authoring the verifier is the precision-forcing function — invariants that can't be operationalized into a deterministic check are inadmissible.
4. **Glossary check.** A deterministic script (`/check-glossary` or run inline) verifies every term in invariant statements resolves to a typed binding or a glossary entry. New terms either get typed or get glossary entries before the ADR finalizes.
5. **LLM compiles invariants → verifier code.** The `invariant-compiler` subagent reads the new/modified invariants from the ADR delta and generates the corresponding test files, lint rules, schemas. Output is staged alongside the ADR.
6. **Human reviews compiled verifiers.** Same review bar as hand-written code. The LLM's output is not blessed because an LLM wrote it; it's blessed because a human read it and understood what each verifier proves.
7. **Implementation follows.** `/feature-change` invokes dev-harness. If the ADR introduced invariants, the verifier suite (`<lang> test` + lint + schema runs) is the success criterion. If not, the existing implementation-evaluator path is used. The two are complementary, not exclusive.
8. **CI runs the verifier suite on every commit.** Pure CPU, sub-minute, no model dependency. Failures localize to specific invariants by ID.
9. **Periodic differential regeneration audit** (`/audit-invariants`). Quarterly or per major refactor checkpoint: `rm` production code, regenerate from invariants × N, diff results. Convergence-with-correctness validates spec precision. Divergence-with-correctness reveals appropriate underconstraint. Divergence-with-incorrectness localizes spec gaps to specific decisions. Output is a triaged Markdown file reviewed by a human; spec changes are authored as new ADRs.
10. **Periodic LLM audit run (advisory).** Reads the invariant registry plus recent ADRs, suggests missing journeys, missing invariants, drift between ADR rationale and registry contents. Output is advisory; never blocks.

## Component Changes

The methodology requires a stack of tooling beyond ADR machinery. This section enumerates it by operational layer; each item is marked **(built)** if code/files ship in this commit, **(in scope)** if it ships before this ADR finalizes, or **(deferred)** if it lands in a follow-up. The methodology's commitment surface is what's marked built or in scope.

### Authoring (used during ADR drafting)

- `/plan-feature` extension — adds mandatory `## Invariant Delta` and `## Decision history (rationale notes)` sections to the ADR template; reframes Q&A from "any invariants?" to "what invariants?" (an ADR with zero delta entries is invalid); writes Decision history rationale **as decisions are made**, not retroactively at finalization; invokes `invariant-compiler` inline during Q&A; runs the impact-only reaction generator before finalizing so blast radius informs the design. **(in scope)**
- `/compile-invariants` skill — given a delta block, invokes the `invariant-compiler` subagent to author per-invariant test code. Invokable inline by `/plan-feature` or standalone. **(in scope)**
- `invariant-compiler` subagent — translates invariant statements into per-invariant test code (and lint rules / schemas / arch configs as appropriate). Fresh context per invocation. **(in scope)**

### Verification (CI-runnable, deterministic, no LLM)

The methodology's enforcement spine. The architecture: **`sdd verify` does structural validation universally; project-specific runners are config-driven shell commands.**

- `sdd verify` CLI — Go binary in this repo. Reads `<project>/spec/registry.yaml` + `glossary.yaml` and walks `<project>/docs/adr-*.md` for `## Invariant Delta` blocks. Performs structural validation using the methodology's own invariants as built-in checks (registry/glossary well-formedness, requires-DAG acyclicity, no orphans, delta reconciliation, supersedes targets withdrawn, glossary completeness). After structural checks pass, shells out to commands listed in `spec-driven-config.json`'s `verify[]` array. **(in scope)**
  - **Structural checks** are the methodology's invariants applied to the project's data — same set for every consumer; consumers don't write them. The current `src/sdd/spec/*_test.go` files become the implementation of `sdd verify`. **(built as Go tests; in scope as CLI)**
  - **Per-mechanism dispatch** for selective execution: `sdd run <invariant-id>` reads `dispatch{}` patterns from config, matches the entry's verifier path, runs the corresponding shell command. **(deferred — when an audit ritual wants it)**
- **No-AND check** — `definition` text matched against `\band\b` (case-insensitive). An entry like "user has email and phone" should be two invariants; the verifier conflates two contracts and failures lose the per-contract signal. Trivially deterministic; built into `sdd verify` alongside the structural checks. **(in scope)**
- **Independence rule** — "A's truth implies B's truth" is semantic reasoning over English definitions; no regex or AST catches it. Maintained as **discipline** (authors check the registry before adding), supplemented by **audit advisory** (LLM pairwise check, audit-time only) and **reaction triage** (downstream invariants that track an upstream change trivially are probably implied). **Not CI-gateable by design** — same shape as "no global state" in a coding standard. Pairwise is naive and gets expensive fast (O(N²) LLM calls); accepted for now, optimization deferred until the registry size demands it.

### Lifecycle (reaction process)

- **Reaction artifact generator (impact-only)** — walks the Requires DAG from the triggering ADR's delta block to find affected invariants `Y where X ∈ Y.Requires`; emits one `docs/reactions/<...>.yaml` per affected invariant with introducer ADR + owner identification. Does NOT generate `llm_suggestion` (the triage-assistant pass). Runs inline during `/plan-feature` so blast radius informs design; runs again on PR open as the formal record. **(in scope — generator only; triage-assistant deferred)**
- **Reaction merge-gate** — CI status check; fails until every reaction artifact is `acked` (with `update`) or expired-with-acceptable-disposition. **(deferred)**
- **Object-clear gate** — CI status check; any `objected` artifact blocks merge. **(deferred)**
- **Reaction CLI** — `/list-reactions`, `/show-reaction`, `/ack-reaction`, `/draft-followup`, `/object-reaction`. Modify artifact YAML in working tree; CI revalidates on push. **(deferred)**

### Audit ritual (layered, LLM-assisted)

The audit is a chain of three abstraction-layer checks, run in order. Each layer's check only matters if the layer above is sound — if your decisions don't ladder to invariants, fixing tests is moot; if your tests don't ladder to invariants, mutation testing is moot.

- **Layer 1 — `decision-invariant-evaluator` agent (decision-↔-invariant roundtrip).** Reads the ADR. Reconstructs the decisions implied by the Invariant Delta constellation; diffs against the actual Decisions table; flags drift in either direction. Also catches commitments smuggled into narrative prose (User Flow, Component Changes, Data Model) without a corresponding delta entry. Runs in `/design-audit`'s loop on every ADR before promotion. **(in scope)** The agent file is rewritten in this commit from the legacy generic-gap-finder to this focused roundtrip checker.
- **Layer 2 — `invariant-testing-evaluator` agent (invariant-↔-verifier roundtrip).** Reads a verifier's code; reconstructs the invariant statement from the test code alone; diffs against the registered `definition`. Flags under-constraining, over-constraining, and non-asserting verifiers. Runs per-edit inside `/compile-invariants`'s loop (right after the build gate, replacing the slot the retired spec-evaluator used to occupy) AND registry-wide via `/audit-invariants`. **(in scope)**
- **Layer 3 — `mutation-tester` subagent.** Runs `go-mutesting` (or per-language equivalent) against verifiers; reports silent mutations (changes that don't fail any verifier — proves the test doesn't actually bite) and catastrophic mutations (changes that fail many verifiers — possible coupling smell). Audit-only, never a CI gate. **(in scope)**
- **`/audit-invariants` skill.** Orchestrates the three layers in order against the current registry. Produces a triaged Markdown audit per layer. Skips layers 2-3 if layer 1 reports drift, since fixing those is moot until the decisions track the invariants. **(in scope)**
- **Differential-regen runner.** Separate ritual: rm production × N, regenerate from invariants, diff against the rm'd version. Classifies divergence as appropriate-freedom vs. spec-gap. Complementary to the roundtrip layers above; runs less frequently. **(deferred — this is heavier and orthogonal to the layered chain)**
- `journey-author` subagent — generates failure-mode journeys from happy paths. Audit-time helper. **(deferred)**
- `triage-assistant` subagent — for the reaction process, not the audit chain. **(deferred — see ADR-0079 reaction process)**

### Discovery (read-only)

- `docs-mcp` invariant indexer — extends the existing docs-mcp with registry/verifier/glossary node types and the edge types declared in the Lineage section of Methodology Governance. **(deferred)**
- **MCP tools** — `list_invariants`, `search_invariants`, `get_invariant`, `get_invariant_lineage`, `get_adr_invariants`, `get_verifier_invariants`. **(deferred)**
- **Dashboard extensions** — Invariants tab (sortable list with computed stability badge), invariant detail (registry entry + glossary term links + verifier link + supersession chain + citation list), reliance graph (force-directed), drift heatmap (last-audit-status overlay), reactions queue (per-owner pending reactions with deadlines). Write-action parity with CLI slash commands; both venues modify the same artifact files. **(deferred)**

### Existing skills/agents extended

- `setup/SKILL.md` — Step 2's default `spec-driven-config.json` template gains the `spec`, `verify`, and `dispatch` keys (see Configuration section below). Existing configs are reseeded idempotently — missing top-level keys are added with defaults; existing values are never overwritten. **(in scope)**
- `feature-change/SKILL.md` — the dev-harness success criterion becomes "`sdd verify && <project verify[]>` passes." Step 6 is rewritten as a dev-harness → verify-suite loop; backpressure rules updated to recognize that missing invariants are part of the contract surface. **(in scope)**
- `dev-harness.md` agent — success criterion is the verify suite passing. Per-invariant verifier failures are the structured feedback the harness operates on. **(in scope)**

### Retired components

- **`implementation-evaluator` skill and agent — removed entirely.** Under the invariant-driven methodology, every contract is a registered invariant with an executable verifier. The verify suite (`sdd verify && verify[]`) IS the implementation gate; an LLM-based evaluator on top of it would only re-derive what the verifiers already check, and would do so less precisely (prose gap reports vs. per-test failures with names and messages). Files deleted in this commit:
  - `src/sdd/skills/implementation-evaluator/` (and its `claude/sdd/`, `factory/sdd/` mirrors)
  - `src/sdd/agents/implementation-evaluator.md` (and the `factory/sdd/droids/` mirror)
  - All references in `feature-change/SKILL.md`, `dev-harness.md`, and `context.md` updated to point at the verify suite. **(in scope)**
- **`spec-evaluator` skill and agent — removed entirely.** Same logic: the spec-evaluator's job was checking ADR-vs-spec alignment. Under invariant-driven development the contract surface is the ADR's Invariant Delta + the registry + the verifiers; pre-existing `docs/**/spec-*.md` files are legacy prose annotations, not maintained by this workflow. There is nothing for spec-evaluator to keep aligned. Files deleted in this commit:
  - `src/sdd/skills/spec-evaluator/` (and its `claude/sdd/`, `factory/sdd/` mirrors)
  - `src/sdd/agents/spec-evaluator.md` (and the `factory/sdd/droids/` mirror)
  - `/plan-feature` Step 5b (spec-edit verification loop) and `/feature-change` Step 4b removed; both skills no longer author or update spec-*.md files. **(in scope)**

### Documentation surface

The pre-existing `docs/spec-*.md` prose files in `agent-plugins/src/sdd/` are **legacy**. They retain value as human-readable prose annotations but are **no longer the load-bearing contract surface** — the registry + glossary + ADR delta blocks are. New invariants don't ship a spec-*.md; they ship a registry entry and a verifier. Existing spec-*.md files remain in place and may be updated opportunistically, but they are not part of this methodology's commitment surface.

The one piece of distributed prose still worth maintaining is `agent-plugins/src/sdd/context.md` — it ships in the plugin payload (`claude/dist/context.md`, `factory/dist/context.md`) and is read by consumer LLMs. Adding a one-line mention of the `## Invariant Delta` convention to it surfaces the methodology to consumers. **(deferred — folded into the parking-lot ADR-0079)**

### Methodology's own registry

`src/sdd/spec/registry.yaml` + `src/sdd/spec/glossary.yaml` — the methodology's own registry and glossary, embedded and parsed at package init. Verifiers live alongside in `src/sdd/spec/*_test.go`. The Day-1 registry's active entries are all authored under Pattern B (each schema field is its own invariant — the bloat-fighter):

- **Registry-entry invariants** — `methodology.registry.{id_field, definition_field, verifier_field, status_field, glossary_terms_field, no_and_in_definition}`. Pattern B (one per schema field) plus the no-AND content rule; verifiers in `registry_test.go`.
- **Glossary-entry field invariants** — `methodology.glossary.{term_field, definition_field, resolves_to_field, scope_field}`. Verifiers in `glossary_test.go`.
- **ADR delta sub-block invariants** — `methodology.adr_delta.{added_block, withdrawn_block}`. Verifiers in `adr_delta_test.go`; fixture at `testdata/adr-9001-fixture.md`.
- **Cross-cutting** — `methodology.registry.verifier_resolves`, `methodology.registry.verifier_unique`, `methodology.tests.bound_to_registry`, `methodology.adr.delta_reconciles`, `methodology.adr.requires_delta`, `methodology.adr.requires_decision_history`, `methodology.glossary.complete`, `methodology.registry.requires_targets_exist`, `methodology.registry.requires_dag_acyclic`, `methodology.registry.supersedes_targets_exist`. Verifiers in `cross_cutting_test.go`.
- **Config field invariants** — `methodology.config.{spec_registry, spec_glossary, spec_adr_dir, spec_reactions_dir, verify_array_well_formed}`. Verifiers in `config_test.go`.
- **CLI behavior invariants** — `methodology.cli.{verify_runs_structural_checks, verify_exit_codes, verify_shells_to_config, verify_walks_adr_dir}`. Integration-style; verifiers in `cli_test.go`.

The DAG of `requires` edges is rooted at the field invariants (no `requires`); cross-cutting invariants depend on the field invariants whose schema they presuppose. Future invariants (audit, reaction process, dashboard, MCP) join as their tooling lands; speculative or aggregation-style invariants are excluded by the independence rule.

Each invariant in the registry has working verifier code in the same commit — no draft-without-verifier state. The `methodology.adr.delta_reconciles` invariant ensures the running registry equals the integral of (Added − Withdrawn) across all ADR delta blocks.

## Data Model

### Invariant registry entry

```
- id: <stable_dot_separated_name>
  definition: <one-line contract; no AND; substantive changes are supersessions>
  comments: <free-form notes; advisory only; freely editable>
  verifier: <path/to/test_file.go::TestName | path/to/rule.yaml | ...>
  requires: [list of invariant IDs this verifier presupposes]   # operational DAG edges
  supersedes: <invariant ID this one replaces, if any>          # set on Added with supersedes sub-field
  glossary_terms: [list of terms in definition that need resolution]
  status: active | withdrawn
  manual_stability: <optional override: stable | core>          # rare; for upfront declarations
```

**Computed (not stored):**

```
  citation_count = |{Y : Y in Registry, X in Y.Requires}|       # invariants that require X
  stability       = manual_stability OR
                    0 → "uncited"; 1-2 → "stable"; ≥3 → "core"
  superseded_by   = <successor_id> iff some Y in Registry has Y.Supersedes == X.ID
                    (i.e., reverse lookup; not a stored field)
```

`definition` is the contract surface; substantive changes route through Supersession (not Modified). `comments` is advisory; edits don't trigger reactions. `requires` is the operational DAG; CI gate enforces acyclicity. `supersedes` records that this invariant replaces a predecessor — the predecessor's `status` flips to `withdrawn`. Stability is computed; `manual_stability` is the rare override for upfront declarations.

### Glossary entry (format pending)

```
- term: <noun phrase or predicate>
  definition: <one-line operational definition>
  resolves_to: <typed binding (Type.Method) | invariant ID | another glossary entry>
  scope: methodology | project-cross-cutting | component-local
```

### ADR Invariant Delta block

Two sub-block kinds, no more:

````markdown
## Invariant Delta

### Added
```yaml
- id: <invariant_id>
  definition: <one-line contract>
  verifier: <path>[::<FuncName>]
  requires: [<ids>]
  supersedes: <predecessor_id>   # OPTIONAL; if set, predecessor flips to withdrawn
  comments: |                    # OPTIONAL
    <free-form annotations>
```
*(Verifier file MUST exist and compile in the same commit. If `supersedes` is set, the predecessor's verifier file must be deleted in the same commit.)*

### Withdrawn
```yaml
- id: <invariant_id>
  reason: <terminal removal, no successor>
```
*(Verifier file MUST be deleted in the same commit. Registry entry retained with `status: withdrawn` for historical traceability only.)*
````

The CI gate verifies that the running registry equals the sum of `Added` − `Withdrawn` deltas (where supersession also marks the predecessor withdrawn). Citation count and stability are computed from the registry's `Requires` graph.

**Mechanical edits** — typo fix in `definition` or `comments`, verifier path update — are direct registry edits without an ADR. The git commit is the audit trail. Substantive changes to a `definition` (the contract surface) are not edits; they route through Supersession (introduce a successor invariant; predecessor flips to `withdrawn`).

## Configuration

Per-project configuration extends the existing `spec-driven-config.json` written by `/setup`. The methodology adds three keys; v1 keys (`source_dirs`, `blocked_commands`) are unchanged. Existing v1 consumer configs stay valid; new keys are absent until the consumer re-runs `/setup` or hand-edits.

```json
{
  "source_dirs": ["**/src/**"],
  "blocked_commands": [...],

  "spec": {
    "registry": "spec/registry.yaml",
    "glossary": "spec/glossary.yaml",
    "adr_dir": "docs/",
    "reactions_dir": "docs/reactions/"
  },
  "verify": [
    "go test ./...",
    "semgrep --config .semgrep.yml",
    "buf lint"
  ],
  "dispatch": {
    "*.go::{fn}": "go test -run {fn} {dir}",
    "*.semgrep.yml": "semgrep --config {path}",
    "*.proto": "buf lint {dir}"
  }
}
```

| Key | Purpose | Used by |
|---|---|---|
| `spec.registry` | Path to the project's invariant registry. Default `spec/registry.yaml`. | `sdd verify` |
| `spec.glossary` | Path to the project's glossary. Default `spec/glossary.yaml`. | `sdd verify` |
| `spec.adr_dir` | Directory containing ADR files (delta blocks are scanned from `adr-*.md`). Default `docs/`. | `sdd verify` (delta reconciliation), reaction generator |
| `spec.reactions_dir` | Directory where reaction artifacts are written. Default `docs/reactions/`. | reaction generator, reaction CLI (deferred) |
| `verify[]` | Shell commands `sdd verify` runs *after* its built-in structural checks. Project's CI command is `sdd verify`. | `sdd verify` |
| `dispatch{}` | Pattern → shell-command map for selective per-invariant execution. Tokens: `{path}`, `{fn}`, `{dir}`. | `sdd run <id>` (deferred) |

**Why config-driven dispatch.** Mechanism dispatch is "run X with these args" — every variation is just a different shell command. Centralizing into a Go adapter framework would force the methodology to ship one row of `dispatch{}` per supported tool and version; the project's config does this trivially per-project.

**Methodology's own config.** `agent-plugins/spec-driven-config.json` gets these keys in this commit, pointing at `src/sdd/spec/registry.yaml` etc. The methodology dogfoods its own config schema.

## Self-Application: Methodology as Zeroth Invariant Set

The methodology is self-applicable. The same registry, glossary, CI gates, and skill conventions that verify consumer-project invariants also verify *the methodology's own invariants*. This isn't a curiosity — it's evidence the framework is general, and it determines the implementation order.

**Bootstrap is DAG-shaped, not temporally phased.** Invariants ship as their verifiers are authorable. The DAG of `requires` edges determines order: a `requires`-leaf invariant (one whose verifier doesn't presuppose another invariant) can be authored standalone; a deeper invariant needs its prerequisites in place first.

**DAG roots** (no `requires` edges; verifiable with just parsers):
- Schema-validity invariants on registry entries, glossary entries, ADR delta blocks. These are the foundational set.

**DAG layers grow as tooling lands:**
- Layer 1 invariants (those that `require` schema-validity) ship after the registry/glossary parsers exist.
- Audit-related invariants ship after `/audit-invariants` exists.
- Reaction-process invariants ship after the reaction artifact generator exists.
- Dashboard / MCP invariants ship after those tools exist.

The methodology's own registry grows leaf-up. Most invariants don't exist on the first commit; they enter the registry as their verifiers become authorable. Consumer projects (mclaude per ADR-0100) start adopting once enough of agent-plugins's own DAG is verifiable to prove the machinery.

**Where the recursion bottoms out** (trusted primitives — not invariant-checked):
- Language toolchain (`go build`, `go test`, type system, AST parser).
- Filesystem and `git`.
- Human judgment for the differential regeneration audit triage.
- Day-0 bootstrap: this ADR (English) is the schema for the registry until the registry exists to hold its own invariants.

## Invariant Delta

This ADR introduces the methodology's own Day-1 registry. All entries are authored under Pattern B (each schema field is its own invariant). Verifier files live at `src/sdd/spec/*_test.go`; their names match each entry's `verifier:` field. The `methodology.adr.delta_reconciles` invariant verifies that this block sums to the running registry contents at `src/sdd/spec/registry.yaml`.

### Added

```yaml
- id: methodology.registry.id_field
  definition: Every registry entry has an `id` field that is a unique non-empty string matching the dotted-path regex.
  verifier: registry_test.go::TestRegistryIDField
  requires: []

- id: methodology.registry.definition_field
  definition: Every registry entry has a `definition` field that is a non-empty single-line string.
  verifier: registry_test.go::TestRegistryDefinitionField
  requires: []

- id: methodology.registry.verifier_field
  definition: Every registry entry has a `verifier` field that is a non-empty string in the form `path` or `path::FuncName`.
  verifier: registry_test.go::TestRegistryVerifierField
  requires: []

- id: methodology.registry.status_field
  definition: Every registry entry has a `status` field whose value is in {active, withdrawn}.
  verifier: registry_test.go::TestRegistryStatusField
  requires: []

- id: methodology.registry.glossary_terms_field
  definition: Every registry entry has a `glossary_terms` field that is a (possibly empty) list of non-empty strings.
  verifier: registry_test.go::TestRegistryGlossaryTermsField
  requires: []

- id: methodology.glossary.term_field
  definition: Every glossary entry has a non-empty `term` field unique within its scope.
  verifier: glossary_test.go::TestGlossaryTermField
  requires: []

- id: methodology.glossary.definition_field
  definition: Every glossary entry has a non-empty `definition` field.
  verifier: glossary_test.go::TestGlossaryDefinitionField
  requires: []

- id: methodology.glossary.resolves_to_field
  definition: Every glossary entry has a `resolves_to` field that names a typed binding, an existing registry entry ID, or another glossary term.
  verifier: glossary_test.go::TestGlossaryResolvesToField
  requires: [methodology.glossary.term_field]

- id: methodology.glossary.scope_field
  definition: Every glossary entry has a `scope` field whose value is in {methodology, project-cross-cutting, component-local}.
  verifier: glossary_test.go::TestGlossaryScopeField
  requires: []

- id: methodology.adr_delta.added_block
  definition: Every `### Added` entry parses to (id, definition, verifier, requires) with valid types; may include an optional `supersedes` sub-field naming a predecessor invariant.
  verifier: adr_delta_test.go::TestADRDeltaAddedBlock
  requires: []

- id: methodology.adr_delta.withdrawn_block
  definition: Every `### Withdrawn` entry parses to (id, reason); the named invariant's verifier file must be deleted in the same commit.
  verifier: adr_delta_test.go::TestADRDeltaWithdrawnBlock
  requires: []

- id: methodology.registry.verifier_resolves
  definition: Every active registry entry's verifier reference resolves to an existing file or existing test function as appropriate for its mechanism.
  verifier: cross_cutting_test.go::TestVerifierResolves
  requires: [methodology.registry.id_field, methodology.registry.verifier_field, methodology.registry.status_field]

- id: methodology.registry.verifier_unique
  definition: No verifier reference is named by more than one active registry entry.
  verifier: cross_cutting_test.go::TestVerifierUnique
  requires: [methodology.registry.id_field, methodology.registry.verifier_field, methodology.registry.status_field]

- id: methodology.tests.bound_to_registry
  definition: Every test function under `<project>/spec/` matching the verifier path convention is named by at least one active registry entry's `verifier` field.
  verifier: cross_cutting_test.go::TestTestsBoundToRegistry
  requires: [methodology.registry.verifier_field, methodology.registry.status_field]

- id: methodology.adr.delta_reconciles
  definition: The current registry contents equal the integral of (Added minus Withdrawn) deltas across all live ADRs; supersession is recorded as Added with a supersedes sub-field, marking the predecessor withdrawn.
  verifier: cross_cutting_test.go::TestDeltaReconciles
  requires: [methodology.registry.id_field, methodology.registry.status_field, methodology.adr_delta.added_block, methodology.adr_delta.withdrawn_block]

- id: methodology.glossary.complete
  definition: Every term listed in `glossary_terms` of any active registry entry resolves to a typed binding or a glossary entry.
  verifier: cross_cutting_test.go::TestGlossaryComplete
  requires: [methodology.registry.glossary_terms_field, methodology.registry.status_field, methodology.glossary.term_field]

- id: methodology.registry.requires_targets_exist
  definition: Every invariant ID listed in any registry entry's `requires` field references an invariant that exists in the registry.
  verifier: registry_test.go::TestRegistryRequiresTargetsExist
  requires: [methodology.registry.id_field]

- id: methodology.registry.requires_dag_acyclic
  definition: The directed graph formed by registry entries' `requires` edges is acyclic.
  verifier: registry_test.go::TestRegistryRequiresDAGAcyclic
  requires: [methodology.registry.id_field, methodology.registry.requires_targets_exist]

- id: methodology.registry.supersedes_targets_exist
  definition: Every registry entry's `supersedes` field, when set, references an existing registry entry whose status is `withdrawn`.
  verifier: registry_test.go::TestRegistrySupersedesTargetsExist
  requires: [methodology.registry.id_field, methodology.registry.status_field]

- id: methodology.config.spec_registry
  definition: `spec-driven-config.json` declares `spec.registry` as a non-empty string path.
  verifier: config_test.go::TestConfigSpecRegistry
  requires: []

- id: methodology.config.spec_glossary
  definition: `spec-driven-config.json` declares `spec.glossary` as a non-empty string path.
  verifier: config_test.go::TestConfigSpecGlossary
  requires: []

- id: methodology.config.spec_adr_dir
  definition: `spec-driven-config.json` declares `spec.adr_dir` as a non-empty string path.
  verifier: config_test.go::TestConfigSpecADRDir
  requires: []

- id: methodology.config.spec_reactions_dir
  definition: `spec-driven-config.json` declares `spec.reactions_dir` as a non-empty string path.
  verifier: config_test.go::TestConfigSpecReactionsDir
  requires: []

- id: methodology.config.verify_array_well_formed
  definition: `spec-driven-config.json`'s `verify` field is a list whose elements are non-empty shell command strings.
  verifier: config_test.go::TestConfigVerifyArray
  requires: []

- id: methodology.cli.verify_runs_structural_checks
  definition: `sdd verify` invokes every active built-in structural check from the methodology's registry on each run.
  verifier: cli_test.go::TestVerifyRunsAllStructuralChecks
  requires: [methodology.registry.id_field, methodology.registry.status_field]

- id: methodology.cli.verify_exit_codes
  definition: `sdd verify` exits non-zero whenever any structural check or shell-out command fails.
  verifier: cli_test.go::TestVerifyExitCodes
  requires: []

- id: methodology.cli.verify_shells_to_config
  definition: `sdd verify` executes every shell command in `spec-driven-config.json`'s `verify[]` in declared order after structural checks pass.
  verifier: cli_test.go::TestVerifyShellsToConfig
  requires: [methodology.config.verify_array_well_formed]

- id: methodology.cli.verify_walks_adr_dir
  definition: `sdd verify` parses `## Invariant Delta` blocks from every `adr-*.md` file under the configured `spec.adr_dir`.
  verifier: cli_test.go::TestVerifyWalksADRDir
  requires: [methodology.config.spec_adr_dir, methodology.adr_delta.added_block, methodology.adr_delta.withdrawn_block]

- id: methodology.registry.no_and_in_definition
  definition: No active registry entry's `definition` field matches the case-insensitive regex `\band\b`.
  verifier: registry_test.go::TestRegistryNoAndInDefinition
  requires: [methodology.registry.definition_field, methodology.registry.status_field]

- id: methodology.adr.requires_delta
  definition: Every `adr-*.md` file under `<spec.adr_dir>` contains a `## Invariant Delta` section with at least one entry in either `### Added` or `### Withdrawn`.
  verifier: cross_cutting_test.go::TestADRRequiresDelta
  requires: [methodology.config.spec_adr_dir, methodology.adr_delta.added_block, methodology.adr_delta.withdrawn_block]

- id: methodology.adr.requires_decision_history
  definition: Every `adr-*.md` file under `<spec.adr_dir>` contains a `## Decision history (rationale notes)` section.
  verifier: cross_cutting_test.go::TestADRRequiresDecisionHistory
  requires: [methodology.config.spec_adr_dir]
```

## Decision history (rationale notes)

This section preserves the *why* behind decisions captured tersely in the Decisions table. Each note is 1-3 sentences on a design choice that emerged from pushback during authoring; future maintainers shouldn't have to re-derive these.

**Why the audit ritual moved from deferred to in-scope, and why it's layered.** Originally deferred for ADR size reasons. Reconsidered when the question "who checks decisions → invariants?" surfaced. The honest answer is the same roundtrip mechanism we use for invariant → verifier, just one abstraction layer up. Once the roundtrip pattern was identified as the canonical mechanism, deferring the audit ritual meant shipping the methodology with no mechanism to detect drift between abstraction layers — a real hole. Pulling it in costs little because the per-layer runners are simple LLM prompts; the only structurally heavy piece (differential-regen) stays deferred. The chain is layered (decision-invariant-evaluator → statement-↔-verifier → mutation tester) because each layer's check only matters if the layer above is sound; mixing them in one runner obscures the gating. decision-invariant-evaluator evolves from a generic ambiguity finder into the layer-1 roundtrip checker — its prior job (find any gap a developer would have to ask about) is dissolved into the more specific question "does the constellation of invariants ladder up to the decisions, and vice versa?"

**Why `spec-evaluator` is retired entirely along with implementation-evaluator.** The spec-evaluator checked ADR-vs-spec alignment in the pre-ADR-0078 dual-surface model where ADRs and `docs/**/spec-*.md` were both load-bearing. Under invariant-driven development the contract surface is the ADR's Invariant Delta + registry + verifiers; spec-*.md files are legacy prose annotations that aren't authored or updated by this workflow. There is nothing for spec-evaluator to keep aligned. Same as implementation-evaluator, considered demoting to optional doc-hygiene tool but full retirement removes the temptation for the workflow to drift back into spec-*.md authoring. /plan-feature and /feature-change no longer touch `docs/**/spec-*.md`.

**Why `implementation-evaluator` is retired entirely, not demoted.** The pre-ADR-0078 workflow used an LLM-based evaluator to check spec-vs-code alignment after dev-harness ran. Under invariant-driven development this becomes redundant: every contract IS a registered invariant with an executable verifier, so the verify suite (`sdd verify` + `verify[]`) gives per-invariant pass/fail with specific test names and messages — strictly more structured than a prose gap report. Considered demoting to an audit-only tool (manual `/implementation-evaluator <component>` for fresh-context spec-vs-code reads), but kept-but-deprecated tools tend to drift back into the loop through habit; full retirement removes the temptation. If a fresh-context evaluation is ever needed, it can be reconstructed as a one-off Agent invocation without dedicated machinery.

**Why pre-existing spec-*.md docs become legacy, not load-bearing.** Before this ADR, the spec-driven-dev plugin's contract surface was prose `docs/spec-*.md` files. The new methodology replaces that with the registry + glossary + ADR delta blocks — precise, machine-readable, with verifier hooks. Pre-existing spec-*.md files retain value as human-readable prose annotations but are no longer authoritative; new contracts ship as invariants, not as additions to spec-*.md. Avoids two parallel contract surfaces drifting against each other. Consumer-facing prose (`context.md`, distributed in the plugin payload) is the one exception worth maintaining.

**Why the ack enum is `update` + `object` only.** Started at 5 (`re-pin`/`update`/`migrate`/`accept-unpinning`/`object`). `re-pin` and `migrate` collapsed because both meant "edge auto-redirects via supersession chain"; renamed to `migrate` then dropped because under verifier-required + tightly-coupled tests, "the invariant changed but no code change needed" is structurally rare (verifier IS the operational expression of the invariant; they evolve together). `accept-unpinning` collapsed because dropping any edge requires touching ADR delta blocks (immutable history) → that's a follow-up ADR → that's `update`.

**Why ADRs don't have `relies_on` edges.** An ADR's stake in any pre-existing invariant should be captured by the *invariants it introduces* whose verifiers `requires` the existing one. If an ADR has prose-level decisions depending on X without operationalizing those decisions as invariants, that dependency is hidden — methodology can't catch it. So `relies_on` from ADRs is replaced by `requires` between invariants.

**Why meta-edges trigger reactions but don't count toward `core`.** The original "no double-counting via meta-edges" rule conflated two concerns: (a) citation count anti-gaming for `core` computation, (b) reaction trigger eligibility. Decoupled them: anti-gaming for `core` excludes meta-edges (so introducing ADRs don't auto-bump their introduced invariants to core); but meta-edges DO trigger reactions (so introducing ADRs get notified when their introduced invariants are affected by later changes).

**Why composite invariants don't exist.** Cross-row uniqueness, referential integrity, etc. were initially called "composites." User pushback: those aren't composed of leaves; they're standalone invariants with `requires` edges to the leaves they presuppose. `composed_of` as edge type was either redundant aggregation (smell — "row well-formed" tells reliers nothing about which fields they actually depend on) or a misnamed standalone with `requires`. Drop the concept entirely; everything in the registry is a standalone invariant connected by `requires` and `supersedes`.

**Why `tier` field, `core` flag, and lifecycle events were collapsed into computed stability.** Stability is *observed* (architectural usage), not *declared* (authorial promotion). Citation count from invariant→invariant `requires` edges is the metric: 0 → uncited, 1-2 → stable, ≥3 → core. Eliminates the entire promotion ADR machinery, deprecation phases, Class A/B/C modification policy, and `### Promoted` / `### Deprecated` / `### Modified` / `### Superseded` sub-blocks. Manual override (`manual_stability`) exists for rare upfront declarations (security boundaries) but defaults are computed.

**Why ADR meta-edges collapsed to `introduces` + `withdraws`.** When adr-B "supersedes X with X'," the substantive event is *X' replaces X* — that's a property of X' (and X), not of adr-B. adr-B is the historical record of when this happened. Encoding supersession as a sub-field of `Added` (rather than a separate `### Superseded` block) follows from this. Same logic eliminates `Modified` (Class A is registry edit only; Class B/C become Supersession), `Promoted` (tier is computed), `Deprecated` (warning function is served by reaction process when withdrawal is proposed).

**Why mechanism field was dropped.** It wasn't driving anything operational — CI ignored it; reactions ignored it; verifier reference is what runs. Just enum validation against itself. Documentation/tag, not contract. If audit dashboards or triage hints later want it, can come back as part of the ADR that actually uses it.

**Why YAML over Go slice for the registry.** The "compile-time validation" claim for Go was overstated: most cross-references in registry entries (`Verifier`, `Requires`, `Supersedes`, `GlossaryTerms`) are stringly-typed regardless. Go would only catch enum violations and field-name typos — both replicable by YAML schema validation. YAML is more honest about the registry's stringly-typed nature, easier to read, diff, and edit. Trade-off accepted: parsing happens at runtime instead of compile time.

**Why each field is its own invariant (Pattern B over Pattern A).** Bloat-fighting discipline: an invariant shouldn't exist unless something depends on it; therefore a field shouldn't exist unless its invariant earns its place. AI-generated bloat-fields can't survive the requirement to author their invariant + verifier. Pattern A (one schema invariant aggregating all fields) would have logically implied each field invariant — violates the independence rule.

**Why "introducing ≠ relies_on" with anti-gaming rationale.** If introducing ADRs auto-counted toward citation, every newly-introduced invariant would be `core` immediately (its introducer always cites it). Citation count needs to measure *external* architectural significance — invariants other ADRs depended on without authoring them — not the trivial fact that an invariant has an author.

**Registry is event-sourced view of ADR history; only `comments` is non-event-sourced.** All stored fields are mostly computed from cumulative ADR deltas. `comments` is the exception (free-form, freely editable, no event source, doesn't trigger reactions). `delta_reconciles` enforces consistency between events (ADRs) and current state (registry). Both are complementary canonical sources, not one-derives-the-other.

**Verifier path format.** `path::FuncName` for Go tests; just `path` for non-Go verifiers (lint configs, schemas). Format is decided in code (`splitVerifierRef`); the verifier-field invariant validates the form.

**Glossary uniqueness scoping.** Glossary terms are unique *within scope*, not globally. Different scopes (methodology, project-cross-cutting, component-local) can have terms with the same name carrying different meanings.

**Stability thresholds are configurable.** Default 0/1-2/≥3 → uncited/stable/core. Per-project tunability deferred (not currently implemented; the defaults are hardcoded in `StabilityOf`).

**Why `sdd verify` over a per-language test orchestration framework.** The earlier draft proposed a "verifier orchestrator" that discovered all verifiers and routed to per-mechanism runners. User pushback: that's over-engineering. The methodology's universal job is *structural* validation (registry/glossary/ADR-delta well-formedness, DAG, orphans, reconciliation) — same checks for every project. Per-mechanism execution is "run X with these args" — every variation is a different shell command, so it lives in per-project config (`spec-driven-config.json`'s `verify[]` and `dispatch{}` keys). Methodology owns universal; project owns specific.

**Why `go test ./...` covers most of the gap.** A Go-only project's CI runs every Go test, including the per-invariant tests. `sdd verify` adds the structural layer; the project's existing test command runs the semantic layer. No orchestrator needed. Mixed-mechanism projects (Go tests + semgrep + buf + ...) list each runner in `verify[]`; `sdd verify` runs them in order, same as the project would do today without the methodology.

**Why per-invariant test compiles vs. passes are different gates.** `/plan-feature` produces the contract; the per-invariant test exists in the working tree and *compiles* (function exists, references resolve). For a brand-new contract, the test starts red — the implementation doesn't exist yet. `/feature-change` (dev-harness) makes the implementation, and the test goes green. Conflating these gates would either force `/plan-feature` to also write the implementation (couples the steps) or let `/feature-change` finalize without the test having ever existed (loses the precision-forcing function). Two gates at two lifecycle points.

**Why ADR ⇒ at least one invariant delta.** If a change is worth documenting in an ADR, it's worth pinning at least one contract. If no contract surface is touched, it's a git commit with a good message. This reverses the Q&A framing — `/plan-feature` doesn't ask "any invariants?" (which invites "no" for any ADR the author doesn't want to bother with), it asks "what invariants?" The pressure is symmetric: an ADR with no delta is a smell that the design audit catches; a contract change with no ADR is the same smell from the other direction.

**Why mandatory Decision history written-as-decided.** Decision rationale captured retroactively at finalization is reconstructed memory, not a record. The skill must require Decision history edits *after every Q&A round, before the next batch of questions*, same write-first discipline as the ADR draft itself. This makes context-compaction recoverable: even mid-draft, the rationale for every decision so far is on disk. Empty Decision history at finalization is a signal that nothing surprising came up — fine, but still a positive declaration, not an oversight.

**Why reactions during planning, not solving.** Reaction artifacts list which past ADRs are affected by this ADR's deltas. Generating them is cheap with a pre-indexed registry (ms). What's expensive is the triage-assistant's `llm_suggestion` — that's what costs tokens. During planning, the author needs *awareness* of impact (so design scope can shrink/grow) but does NOT need pre-computed solutions. Reactions surface as a list; the author decides how to scope. Solving the reactions (ack/object/draft-followup) is its own loop, post-merge or in a separate session.

**Why `spec-driven-config.json` extension over a new file.** The file already exists in v1, written by `/setup`, holding `source_dirs` and `blocked_commands`. Adding `spec`, `verify`, `dispatch` keys keeps the project's per-tool config in one place. Existing v1 configs stay valid (new keys absent until re-run); new consumers get the full schema by default.

## Methodology Governance

The Decisions table captures *what* the rules are; this section captures *how* the rules play out across change events, reactions, and conflict resolution. The methodology has three load-bearing artifacts that encode the same truth in three forms — invariant statement (intent, English), verifier (enforcement, deterministic), production code (implementation, runtime) — and the rules below keep them aligned without process overhead exploding.

### Stability and modifications

**Stability is computed from citation count.** No `tier` field; no promotion ADR; no deprecation phase. The dashboard reads `citation_count(X) = |{Y : Y in Registry, X in Y.Requires}|` and derives a badge per the configurable thresholds (default `0 → uncited`, `1-2 → stable`, `≥3 → core`). Manual override (`manual_stability: stable | core`) exists for upfront declarations (e.g., security boundaries) but defaults are computed.

**Modifications route by impact:**

| Change shape | Routing |
|---|---|
| Typo fix in `definition` or `comments`; verifier path update | Direct registry edit; git log is the audit trail. No ADR ceremony. |
| Substantive change to `definition` (contract surface) | **Supersession.** Introduce successor invariant in an `### Added` entry with `supersedes: <predecessor>`; predecessor flips to `withdrawn`; predecessor's verifier file is deleted in the same commit. |
| Withdrawal with no successor | `### Withdrawn` entry; verifier file deleted in same commit; registry entry retained with `status: withdrawn` for historical traceability. |

The hard rule: if the contract is changing, withdraw and introduce a new ID. Relying invariants explicitly redeclare reliance on the new ID — which is the *right* behavior, since their authors should review whether the new form still supports their dependencies.

### Reaction process

When an ADR introduces an `### Added` entry with `supersedes: X` or a `### Withdrawn` entry naming `X`, every invariant `Y` with `X in Y.Requires` is operationally affected. The reaction process forces explicit acknowledgment from the introducing ADR of each affected `Y` before the triggering ADR can merge.

**Reactions cascade via the invariant `Requires` DAG, not via explicit ADR `relies_on` edges.** ADRs do not have `relies_on` declarations; an ADR's stake in any invariant is captured structurally by the `Requires` of the invariants it introduces. So when `X` changes, the affected ADRs are those that introduced any `Y` requiring `X`.

**Ack options (owner picks one per pending reaction):**

| Ack | Meaning | Effect |
|---|---|---|
| `update` | "I'll author a follow-up ADR amending the dependent invariant." | Triggering ADR can merge once the follow-up commits (the follow-up amends or withdraws the dependent invariant). |
| `object` | "Don't proceed with this change." | Triggering ADR blocked until objection is resolved through human discussion. |

`migrate` and `accept-unpinning` were considered and dropped: under verifier-required + tightly-coupled tests, "the invariant changed but no code change is needed" is structurally rare (the verifier IS the operational expression of the invariant); dropping any edge requires touching ADR delta blocks (immutable history), which is itself a follow-up ADR — i.e., `update`.

**Reaction artifact** (one per affected invariant `Y`, written under `docs/reactions/<triggering_adr>-<X>-<introducer_adr>.yaml`):

```yaml
triggering_adr: adr-NNNN
target_invariant: X
delta_kind: supersession | withdrawal
new_invariant: <successor_id>     # for supersession only
affected_invariant: Y
introducer_adr: adr-MMMM           # ADR that introduced Y
introducer_owner: <git author or explicit Owner: frontmatter>
state: pending | acked | objected | expired
ack: null | update | object
ack_rationale: null
```

CI hooks generate one artifact per affected invariant on PR open; the merge-gate requires every artifact reach `acked` (with `ack: update`) before allowing merge. `object` blocks indefinitely until resolved.

**Anti-gaming for citation count.** Citation count measures *external* architectural significance — invariants that other ADRs depended on without authoring them. Two concerns are decoupled: (a) for `core` computation, the ADR-`introduces`-`X` meta-edge does not vote (otherwise every invariant would be `core` from birth, since its introducer trivially "cites" it); (b) for reaction triggering, the meta-edge DOES count (an introducing ADR is notified when its introduced invariants are affected by later changes). Internal `Requires` between invariants introduced in the same ADR still count toward citation — they reflect real operational dependency, not authorial accounting.

### Lineage and discovery

The methodology builds a typed graph over its artifacts, surfaced via docs-mcp and the lineage dashboard.

**Node types:** ADR · Spec · Invariant · Verifier · Glossary term.

**Edge types:**

| Edge | From → To | Source of truth |
|---|---|---|
| `introduces` | ADR → Invariant | ADR `### Added` block |
| `withdraws` | ADR → Invariant | ADR `### Withdrawn` block, or `### Added` with `supersedes` (predecessor flips to withdrawn) |
| `requires` | Invariant → Invariant | Registry `requires` field |
| `supersedes` | Invariant → Invariant | Registry `supersedes` field |
| `pinned_by` | Invariant → Verifier | Registry `verifier` field |
| `uses_term` | Invariant → Glossary term | Registry `glossary_terms` field |
| `defines_term` | Type/Method → Glossary term | Glossary `resolves_to` field |

Two ADR meta-edges (`introduces`, `withdraws`); two invariant-to-invariant edges (`requires` operational; `supersedes` temporal). `relies_on`, `modifies`, `promotes`, `deprecates` are not edges in this methodology — modifications route to direct registry edit or Supersession; promotion and deprecation are subsumed by computed stability.

**MCP tools** (extension of existing docs-mcp): `list_invariants`, `search_invariants`, `get_invariant`, `get_invariant_lineage`, `get_adr_invariants`, `get_verifier_invariants`.

**Dashboard views:** Invariants tab (sortable list with computed stability badge), invariant detail (registry entry + glossary term links + verifier link + supersession chain + citation list), reliance graph (force-directed), drift heatmap (last-audit-status overlay), reactions queue (per-owner pending reactions with deadlines). Write-action parity with CLI slash commands; both venues modify the same artifact files.

### Conflict resolution

Three artifacts encode the same truth: statement (intent), verifier (enforcement), code (implementation). Drift is a fact of life; the methodology declares an explicit hierarchy.

**Authority order (intent):** statement > verifier > code.
**Operational reality (what CI checks):** verifier is what actually runs.

| Conflict | Resolution |
|---|---|
| Statement ↔ verifier disagree | Verifier under- or wrong-captures the statement. Re-author the verifier. If statement was ambiguous, sharpen it first, then re-derive. |
| Statement ↔ code disagree | Code violates the contract. Fix code. The verifier should have caught this; if it didn't, also fix the verifier. |
| Verifier ↔ code disagree (CI fails) | Default: code is wrong. If statement was ambiguous and the verifier interpreted incorrectly, fix verifier too. |
| All three pass but statement is silently wrong | Audit ritual catches this — see drift detection below. |

**Drift detection mechanisms** (resolution rules are useless without detection):

1. **Statement-↔-verifier roundtrip** at audit time. Feed verifier to a fresh LLM, ask it to write the statement, diff against the registered statement. Mismatch = drift.
2. **Differential regeneration.** Regenerate code from the statement; if regenerated code differs in *behavior* but both pass the verifier, the verifier under-captures the statement.
3. **Mutation testing of the implementation.** Mutate code in ways that should violate the statement; verifier should fail.
4. **Coverage-of-statement audit (LLM-assisted, quarterly).** Read invariant + verifier together; ask "does this verifier fully prove this statement?" Output is advisory.

When statement and verifier conflict in audit, treat the verifier as the bug — it's the artifact that's *supposed* to be a deterministic encoding of the statement. The statement only gets revised when the audit reveals the original statement was itself ambiguous, in which case the fix is "sharpen the statement, re-derive the verifier."

## Error Handling

- **Verifier compilation failure** (LLM produces invalid code): build break; human authors fix or re-runs compilation with corrected ADR.
- **Differential regeneration produces incorrect implementations**: surfaces as a spec gap; failing invariants identify which decisions weren't constrained enough. Author follow-up ADR with sharpened invariants.
- **Invariant registry drift** (entry has no live verifier; verifier pins unknown invariant): CI gate fails; must be resolved before merge.
- **Glossary coverage failure** (term in invariant statement resolves to nothing): authoring blocked until term is typed or added to glossary.

## Security

The methodology itself does not introduce new security boundaries, but enables consumer projects to:
- Encode tenant isolation invariants as deterministic checks rather than markdown promises.
- Encode JWT format, NATS subject permissions, and credential flows as schemas (proto+buf) with breaking-change detection.
- Encode architectural invariants ("no `net/http` server outside JWT issuer") as enforceable lint rules.

The `invariant-compiler` subagent runs in a fresh context per invocation (per `methodology.subagent.fresh_context`); no cross-invocation prompt injection surface.

## Impact

Specs updated in this commit (in agent-plugins):
- `src/sdd/docs/spec-invariant-driven-development.md` — **new**, canonical methodology reference.
- `src/sdd/docs/spec-invariant-registry.md` — **new**, registry format (pending decision resolution).
- `src/sdd/docs/spec-verifier-conventions.md` — **new**, per-mechanism translation conventions.
- `src/sdd/docs/spec-glossary.md` — **new**, methodology's own glossary.
- `src/sdd/docs/spec-agents.md` — extended with new subagents.
- `src/sdd/docs/context.md` — extended with v2 dispatch rules.

Plugin source changes:
- `src/sdd/.agent/skills/plan-feature/`, `feature-change/`, `setup/` — extended for v2 dispatch.
- `src/sdd/.agent/skills/compile-invariants/`, `audit-invariants/`, `check-glossary/`, `check-registry-coverage/` — new.
- `src/sdd/.agent/agents/invariant-compiler.md` — new.
- `src/sdd/spec/registry.yaml` — methodology's own registry (Day-1 bootstrap; see `## Invariant Delta` section).
- `src/sdd/spec/glossary.yaml` — methodology's own glossary.
- `src/sdd/spec/*_test.go` — verifiers, one per invariant.
- `src/sdd/spec/glossary.md` (or chosen format) — methodology's own glossary.

Consumer projects: each authors its own *adoption* ADR in its own repo, citing this ADR as the methodology source. mclaude's ADR-0100 is the first such adoption ADR; others follow per project.

## Scope

In v1 of this ADR (i.e., spec-driven-dev v2.0):
- Methodology declaration (artifacts, cycle, principles, taxonomy).
- Methodology's own invariant registry (Day 1 contents listed).
- Plugin source extensions (new skills, new subagent, extended existing skills).
- Bootstrap implementation in agent-plugins itself.
- Documentation (4 new specs).

Explicitly deferred:
- Consumer project adoption — each consumer authors its own adoption ADR (e.g. mclaude ADR-0100). This methodology ADR doesn't author them.
- TypeScript / non-Go language bindings — methodology is language-agnostic in principle but Day-1 implementation targets Go (since agent-plugins's docs-mcp is Go and mclaude is Go). TS/Python/Rust per-mechanism tool choices documented but not yet implemented.
- Mutation testing as a CI mechanism — defined in the taxonomy but Day-1 use is audit-only (`go-mutesting` quarterly).
- Journey authoring as a separate skill — invariants of journey-shape are supported, but the dedicated `journey-author` subagent is deferred.
- v1 retirement — v1 markdown-spec mode stays available indefinitely. Future ADR may sunset it once all known consumers migrate.

## Open questions

Resolved (during this ADR's authoring):

- ~~Invariant registry format~~ — **YAML** (`<project>/spec/registry.yaml`); embedded and parsed via `gopkg.in/yaml.v3`. See Decision history.
- ~~Glossary form~~ — **YAML** (`<project>/spec/glossary.yaml`); same parsing path.
- ~~Per-invariant test layout~~ — **Native** to the project's test runner (`<project>/spec/*_test.go` for Go, equivalent for other languages). Methodology's own tests live at `src/sdd/spec/*_test.go`.
- ~~ADR delta block structure~~ — **Dedicated `## Invariant Delta` section** with `### Added` and `### Withdrawn` sub-blocks.
- ~~Bootstrap timing~~ — **Concurrent.** Methodology's own invariants register in this ADR's commit.
- ~~LLM compilation step ergonomics~~ — **`invariant-compiler` invoked inline by `/plan-feature` (Step 3c)**; gate is "test compiles," not "test passes." Compile-vs-pass split between `/plan-feature` and `/feature-change` keeps the steps decoupled.
- ~~Tooling architecture~~ — **`sdd verify` CLI for structural checks; per-project tests run via the project's native runner; mixed-mechanism dispatch via `spec-driven-config.json`'s `verify[]` and `dispatch{}` keys.** No centralized adapter framework.
- ~~Skill suite scope~~ — **Authoring/audit are skills (`/plan-feature` extended, `/compile-invariants`, `/audit-invariants`); structural checks are a binary (`sdd verify`), not a skill.** Skills get LLM context isolation; structural validation is pure data work.

Still open:

- **Differential regeneration cadence + owner**: quarterly + manual trigger, nightly + scheduled, on-demand only? Who reads the diff and triages divergence-as-freedom vs divergence-as-gap?
- **Registry-coverage CI gate failure semantics**: block merge or warn? (Day 1 should probably be block; Day 0 advisory while machinery stabilizes.)
- **Methodology spec doc partition**: one big `spec-invariant-driven-development.md`, or split into `spec-invariant-registry.md` + `spec-verifier-conventions.md` + `spec-glossary.md` + `spec-self-application.md`? (Current draft proposes the split, but a single dense doc may be easier to keep coherent during rapid iteration.)
- **Language-binding generality**: do we declare in this ADR that v2 is multi-language with Go as Day-1 implementation, or scope it to Go-only with multi-language as a future ADR?
- **Mutation testing for CI vs audit-only**: Day-1 use audit-only is conservative; should Day-1 also include mutation testing of the methodology's own invariants as a CI gate (since the registry is small)?
- **Per-project stability threshold tunability**: defaults are hardcoded in `StabilityOf`; deferred until a second consumer with different needs surfaces.

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| Day-1 bootstrap end-to-end | Register the methodology invariants, generate verifiers via invariant-compiler, run CI gates, all pass | Manual: author registry.yaml + glossary.yaml + verifier files; commit; run `go test ./spec/...` plus check-registry-coverage and check-glossary | invariant-compiler subagent, /check-registry-coverage, /check-glossary, registry, glossary |
| Differential regeneration on a small invariant set | Regenerate × 3 produces convergent code for sharply-stated invariants and divergent code for fuzzy ones | Manual: pick 3 methodology invariants, run /audit-invariants in dry-run mode | /audit-invariants, invariant-compiler |
| Glossary failure mode | Adding an invariant with an unresolved term blocks /plan-feature finalization until term is typed or glossaried | Synthetic test invariant with `frob the widget` in the statement | /plan-feature, /check-glossary |
| Registry-coverage failure mode | Adding a verifier file that pins a non-existent invariant ID fails CI; orphan registry entry without verifier fails CI | Synthetic bad pairs in a test consumer | /check-registry-coverage |
| ADR delta reconciliation | Sum of (Added − Removed) across all ADR deltas equals current registry state; mismatch fails CI | Synthetic test with intentional mismatch | CI gate script |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| spec-invariant-driven-development.md | 800-1500 lines | 60k | Cross-cutting canonical reference; new file |
| spec-invariant-registry.md | 200-400 lines | 30k | Format spec; depends on registry-format question |
| spec-verifier-conventions.md | 400-800 lines | 50k | Per-mechanism translation conventions |
| spec-glossary.md (methodology's own) | 100-200 lines | 20k | Small; ~15-20 terms initially |
| /plan-feature extension (optional Invariant Delta block) | 150-300 lines | 60k | Additive: existing path unchanged; new path activates when ADR has invariants |
| /feature-change extension (verifier suite as additional success criterion) | 80-150 lines | 50k | Additive |
| /compile-invariants new skill | 200-400 lines + subagent prompt | 80k | New skill + subagent definition |
| /audit-invariants new skill | 300-600 lines | 100k | Larger; orchestrates rm + regenerate × N + diff |
| /check-glossary new skill (deterministic) | 100-200 lines Go or shell | 40k | Script, not LLM |
| /check-registry-coverage new skill (deterministic) | 100-200 lines | 40k | Script |
| invariant-compiler subagent | 200-400 lines (prompt + per-mechanism conventions) | 80k | New agent definition |
| Day-1 bootstrap: register methodology invariants + verifiers | ~500-1000 lines spec/test code (delivered) | 100k (delivered) | Bulk of the bootstrap; complete in this commit. |
| context.md extension (dispatch rules) | ~50 lines | 15k | |
| spec-agents.md extension | ~50 lines | 15k | |

**Total estimated tokens**: ~700k-950k
**Estimated wall-clock**: 1-2 weeks for a working v2.0 with Day-1 bootstrap complete and the first consumer (mclaude) able to author ADRs with Invariant Delta blocks against control-plane.

Day-1 bootstrap (registry + glossary + verifiers) is complete in this commit. Subsequent ADRs handle: TypeScript bindings, mutation-testing as CI, journey-author subagent.
