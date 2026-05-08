# ADR: Invariant-Driven Development with Compiled Verification (spec-driven-dev v2)

**Status**: draft
**Status history**:
- 2026-05-08: draft

## Overview

Evolve the `spec-driven-dev` plugin from markdown-spec methodology (v1) to **invariant-driven development with compiled verification** (v2). Named **invariants** — not markdown spec prose — become the canonical contract surface, and verification is performed by deterministic CPU-bound mechanisms (test files, lint rules, schemas, type-system checks) rather than LLM-as-judge spec-evaluators. LLMs appear only at *authoring* time (compiling invariants into verifier code) and *audit* time (quarterly differential regeneration to detect spec gaps and dead code), never in the recurring CI validation path.

V1 markdown-spec methodology coexists with v2 invariant-driven methodology during transition. Consumer projects opt in per-component; both modes ship in the same plugin and share the existing skills (`/plan-feature`, `/feature-change`) which dispatch internally based on the per-component mode.

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
| Verification taxonomy | Each invariant names exactly one primary verification mechanism: unit, table, property, architectural-rule, AST, type-system, schema, codegen-completeness, integration, journey | A requirement that can't name a mechanism is inadmissible — either move to ADR rationale or sharpen until it fits. Forces precision discipline at authoring. |
| LLM role | Authoring + audit only, never recurring validation | Token cost is paid once per invariant (compilation) and once per quarter (audit), not per CI run. CI is pure CPU, sub-minute, deterministic. |
| Language binding | Spec encoded in the *consumer language* (Go test files for Go projects, TS test files for TS projects); the language is part of the contract | Goroutine semantics, `context.Context` propagation, error-wrapping conventions, async/await idioms are load-bearing. "Recompile to a different language" would silently drop them. |
| Constraint scope | Constrain contracts (user-visible, cross-component, security-critical); leave internals liquid | Overconstraint causes refactor friction and premature crystallization. Differential regeneration tells us when the line is drawn wrong (divergence-with-correctness = appropriate freedom; divergence-with-incorrectness = real spec gap). |
| Vocabulary precision | Hybrid: types-as-glossary primary (entities → language types, predicates → methods); explicit `glossary.md` for cross-cutting concepts and ambiguous domain terms | Invariant statements use *terms*; un-pinned terms drift at the vocabulary layer. Types carry most of the load (compile-checked, refactor-safe); a small glossary covers what types can't express. CI gate: every term in an invariant statement resolves to a typed binding or glossary entry. |
| Registry framework approach | Custom thin per-language layer (~200 LOC) + reuse of per-mechanism tools; no off-the-shelf "invariant registry framework" exists that fits | Closest adjacent frameworks (ArchUnit, fitness functions, TLA+, OPA/Rego, CUE, Concordion, JML, Cucumber) cover slices but none combines named registry + multi-mechanism verification + CI-gateable coverage. Building thin and reusing mature per-mechanism tools is the right shape. |
| Per-mechanism tool choices (Go projects) | Behavior: `go test` + table tests; Property: `rapid`; Architecture: `go-arch-lint` + `depguard`; AST: `semgrep` + `go/analysis`; Schema: `protobuf` + `buf`; Type system: `exhaustive`, `nilaway`, sealed interfaces; Codegen completeness: `go:generate` + reflection; Mutation: `go-mutesting` (audit-only) | Mature, Go-native, refactor-friendly. Other languages get analogous default toolchains documented in the methodology spec. |
| Plugin shape | Evolution of spec-driven-dev (v2 supersedes v1); both modes coexist per-component during transition | Lower fragmentation than separate sibling plugin; existing skills extend rather than fork. v1 mode stays available as legacy fallback. |
| Bootstrap project | agent-plugins itself; methodology's own invariants register first (Day 1), consumer-project invariants follow (Day N) | Self-application is evidence of generality. Proving the framework on its own meta-level before consumers bet on it de-risks adoption. |
| Coexistence dispatch | Per-component mode flag (v1 markdown-spec or v2 invariant-driven) read by `/plan-feature` and `/feature-change` from a project-level config | Component-by-component opt-in matches the gradual-migration use case. File-path-based or ADR-declared flags would work but are less explicit than a config block. |
| Invariant stability tier | Two-tier system: `draft` / `active`. Default on introduction = `draft`. One promotion ADR per invariant (`draft → active`); evidence required (audit survival, utility, surrounding-code stability). | Four tiers (experimental/provisional/stable/core) imposed too many promotion ADRs (~12/month at scale). Two tiers cut throughput 2-3× while preserving the load-bearing distinction between "we're trying this" and "we're committed." Provisional collapses into draft (drafts can survive long); core converts to a computed attribute. |
| Core attribute (computed) | `core: true` automatically set when ≥ 3 other ADRs rely on the invariant as load-bearing; also manually settable for explicit declarations. Affects removal ceremony (core requires successor invariant or explicit redesign justification). | Core-ness is a *consequence* of architectural significance, not a separate governance state. Computing it from the relied-on count makes the signal evidence-based and game-resistant; manual override exists for the rare case where authorial judgment precedes evidence. Reuses the lineage-dashboard concept already established for ADR↔spec relationships. |
| Invariant lifecycle status | Orthogonal axis: `active` / `deprecated` / `superseded` / `withdrawn`. Withdrawal requires verifier file deletion in the same commit. | Separates "is this still enforced?" (status) from "how committed are we?" (tier). Allows graceful deprecation periods for active invariants and lightweight Day-2 revocation for drafts. |
| Conflict resolution authority | Authority hierarchy: statement > verifier > code. Operational reality: verifier is what CI runs. When statement and verifier conflict at audit, the verifier is the bug (it should be a deterministic encoding of the statement). Statement is revised only when audit reveals the original statement was ambiguous. | Three artifacts encoding the same truth means drift is possible. An explicit hierarchy gives a deterministic resolution rule rather than living with silent drift. |
| Invariant registry format | (decision pending: language-native const slice, YAML, separate file per invariant, comment-extracted from test files) | |
| Glossary form | (decision pending: standalone `glossary.md`, language-native const map for type-checked references, or generated index from typed bindings) | |
| Verifier file layout | (decision pending: co-located with code, dedicated `internal/spec/` subdirectory, separate spec package, or hybrid by mechanism) | |
| ADR delta block structure | (decision pending: dedicated section, embedded in Decisions, or in Component Changes) | |
| Differential regeneration cadence + owner | (decision pending: quarterly + manual, nightly + scheduled, on-demand only; who triages divergence) | |
| Skill suite scope | (decision pending: which become first-class `/`-commands vs. fold into existing skills) | |

## User Flow

The development cycle for a v2 component (in any consumer project):

1. **Change request enters.** User asks for a feature, fix, refactor, etc.
2. **Master session authors an ADR draft** via `/plan-feature`. The skill detects v2 mode for the affected component(s) and uses the v2 ADR template, which includes a structured **Invariant Delta** block (added/modified/removed invariants with mechanism + verifier pointer).
3. **Invariant decomposition.** Each new invariant is named, statemented in one line, and tagged with its primary verification mechanism. Invariants that can't name a mechanism are either inadmissible or need sharpening — this is the precision forcing function. The skill blocks ADR finalization until every proposed invariant has a mechanism.
4. **Glossary check.** A deterministic script (`/check-glossary` or run inline) verifies every term in invariant statements resolves to a typed binding or a glossary entry. New terms either get typed or get glossary entries before the ADR finalizes.
5. **LLM compiles invariants → verifier code.** The `invariant-compiler` subagent reads the new/modified invariants from the ADR delta and generates the corresponding test files, lint rules, schemas. Output is staged alongside the ADR.
6. **Human reviews compiled verifiers.** Same review bar as hand-written code. The LLM's output is not blessed because an LLM wrote it; it's blessed because a human read it and understood what each verifier proves.
7. **Implementation follows.** `/feature-change` invokes dev-harness, which writes production code that makes the verifier suite pass. For v2 components, the implementation-evaluator step is replaced by the deterministic verifier suite — `<lang> test` + lint/schema runs are the answer.
8. **CI runs the verifier suite on every commit.** Pure CPU, sub-minute, no model dependency. Failures localize to specific invariants by ID.
9. **Periodic differential regeneration audit** (`/audit-invariants`). Quarterly or per major refactor checkpoint: `rm` production code, regenerate from invariants × N, diff results. Convergence-with-correctness validates spec precision. Divergence-with-correctness reveals appropriate underconstraint. Divergence-with-incorrectness localizes spec gaps to specific decisions. Output is a triaged Markdown file reviewed by a human; spec changes are authored as new ADRs.
10. **Periodic LLM audit run (advisory).** Reads the invariant registry plus recent ADRs, suggests missing journeys, missing invariants, drift between ADR rationale and registry contents. Output is advisory; never blocks.

## Component Changes

### `src/sdd/.agent/skills/`

**Existing skills, extended for v2 dispatch:**

- `plan-feature/SKILL.md` — gains v2 ADR template branch (Invariant Delta block, glossary check, mechanism enforcement). Mode dispatched by per-component config.
- `feature-change/SKILL.md` — for v2 components, replaces implementation-evaluator with verifier-suite check; for v1, unchanged.
- `setup/SKILL.md` (claude-specific) — gains a question for which mode the new project starts in (defaults to v2).

**New skills:**

- `compile-invariants/SKILL.md` — given an ADR delta, invokes the `invariant-compiler` subagent to generate verifier code per mechanism. Invokable inline by /plan-feature or as a standalone command.
- `audit-invariants/SKILL.md` — runs the differential regeneration ritual (rm production × N, diff). Produces an audit Markdown output.
- `check-glossary/SKILL.md` — deterministic script (not LLM); CI-runnable. Verifies vocabulary coverage.
- `check-registry-coverage/SKILL.md` — deterministic script; CI-runnable. Verifies registry ↔ verifier integrity, ADR delta reconciliation, no orphans.

### `src/sdd/.agent/agents/`

**New subagents:**

- `invariant-compiler.md` — translates invariant statements into verifier code. Per-mechanism translation conventions live in its prompt. Fresh context per invocation.
- `journey-author.md` (optional, deferred) — generates failure-mode journeys from happy paths. Audit-time helper.
- `mutation-tester.md` (optional, deferred) — runs mutation testing of the spec; reports silent and catastrophic mutations.

**Existing agents, extended:**

- `dev-harness.md` — for v2 components, the success criterion is "verifier suite passes" rather than "implementation-evaluator returns CLEAN."

### `src/sdd/docs/`

**New specs:**

- `spec-invariant-driven-development.md` — canonical methodology reference. Dense, structured. Replaces the design conversation as the load-bearing artifact for any future session that needs the full picture.
- `spec-invariant-registry.md` — registry format spec (depends on open question resolution).
- `spec-verifier-conventions.md` — per-mechanism conventions for how invariants compile into verifier code.
- `spec-glossary.md` — the methodology's own glossary (terms used in methodology invariants).

**Updated specs:**

- `spec-agents.md` — extend with the new subagents.
- `context.md` — extend with v2 dispatch rules and the per-component mode flag.

### Methodology's own registry

`src/sdd/spec/invariants.<lang>` — the methodology's own invariant registry. Day 1 contents:

```
methodology.registry.no_orphans
methodology.glossary.complete
methodology.adr.delta_reconciles
methodology.invariant.has_mechanism
methodology.invariant.statement_atomic
methodology.skills.context_isolation
methodology.subagent.fresh_context
methodology.dispatch.respects_mode
methodology.audit.advisory_only
```

Each registered with its mechanism, verifier file pointer, glossary terms used. The registry-coverage CI gate runs against this set first, proving the machinery before any consumer adopts.

## Data Model

### Invariant registry entry (format pending; conceptual shape)

```
- id: <stable_dot_separated_name>
  statement: <one-line natural language; no AND>
  mechanism: unit | table | property | arch | ast | type | schema | completeness | integration | journey
  verifier: <path/to/test_file::TestName | path/to/.arch/rule.yaml | ...>
  glossary_terms: [list of terms in statement that need resolution]
  tier: draft | active
  status: active | deprecated | superseded | withdrawn
  introduced_by: adr-NNNN
  promoted_by: adr-MMMM            # set when tier flips draft → active
  superseded_by: <id of replacement, if status = superseded>
  core: <computed: true if ≥3 ADRs rely on this; can be manually overridden>
  relied_on_by: [adr-NNNN, adr-MMMM, ...]   # populated by docs-mcp from ADR Relies On blocks
```

`tier` governs *change process* (lightweight for draft, deprecation-period for active). `status` governs *whether the verifier runs and how the registry handles it*. `core` is a derived attribute computed from the reliance graph; it elevates the removal ceremony but doesn't add a governance state. The three axes are orthogonal — see "Methodology Governance" section below.

### Glossary entry (format pending)

```
- term: <noun phrase or predicate>
  definition: <one-line operational definition>
  resolves_to: <typed binding (Type.Method) | invariant ID | another glossary entry>
  scope: methodology | project-cross-cutting | component-local
```

### ADR Invariant Delta block

Each ADR that affects invariants includes a structured block with up to six delta kinds:

```markdown
## Invariant Delta

### Added
- `<id>`: <statement> (mechanism: <m>, verifier: <path>, tier: draft)
  *(Newly registered invariants default to tier `draft` unless explicitly introduced as `active` with justification.)*

### Modified
- `<id>`: <what changed in the statement, mechanism, or verifier — and why>

### Promoted
- `<id>`: draft → active (with evidence per promotion criteria)
  *(Tier-only change; statement and verifier unchanged.)*

### Deprecated
- `<id>`: <deprecation reason; expected withdrawal ADR / cycle>
  *(Verifier still runs; status flips active → deprecated.)*

### Superseded
- `<id>` → `<new_id>`: <rationale; new invariant takes effect, old's verifier removed concurrently>

### Withdrawn
- `<id>`: <reason — typically "experiment did not pan out" or "no longer required because ...">
  *(Verifier file MUST be deleted in the same commit. Registry entry retained with status=withdrawn for historical traceability only.)*

### Relies On
- `<id>`: <how this ADR depends on the invariant>
  *(Reference without modification. Feeds the reliance graph that computes `core` attribute. Required when an ADR's decisions rely on an existing invariant being true.)*
```

The CI gate verifies that the running registry equals the sum of all ADR deltas (Added − Withdrawn, with Modified/Promoted/Deprecated/Superseded tracked through status fields and the reliance graph maintained from `Relies On` blocks).

### Per-component mode flag

`<project>/.sdd/components.yaml` (or equivalent — to be specified):

```yaml
components:
  mclaude-control-plane:
    mode: v2
    registry: mclaude-control-plane/internal/spec/invariants.go
  mclaude-relay:
    mode: v1
    spec: docs/mclaude-relay/spec-relay.md
  ...
```

## Self-Application: Methodology as Zeroth Invariant Set

The methodology is self-applicable. The same registry, glossary, CI gates, and skill conventions that verify consumer-project invariants also verify *the methodology's own invariants*. This isn't a curiosity — it's evidence the framework is general, and it determines the implementation order.

**Bootstrap order:**

1. **Day 0**: Registry empty. Methodology lives in this ADR + `spec-invariant-driven-development.md` (English).
2. **Day 1**: Register the methodology's own ~9 invariants (listed above). Build their deterministic CI gates. Verify the registry/glossary/CI-gate machinery works end-to-end on a small invariant set, in agent-plugins's own repo.
3. **Day N**: Consumer projects (starting with mclaude per its ADR-0100) register their own invariants. Every consumer-project invariant immediately benefits from methodology-invariant CI gates that already work.

**Where the recursion bottoms out** (trusted primitives — not invariant-checked):
- Language toolchain (`go build`, `go test`, type system, AST parser).
- Filesystem and `git`.
- Human judgment for the differential regeneration audit triage.
- Day-0 bootstrap: this ADR (English) is the schema for the registry until the registry exists to hold its own invariants.

## Methodology Governance: Stability, Lifecycle, and Conflict Resolution

The methodology has three load-bearing artifacts that *encode the same truth in three forms*: invariant statements (intent, English), verifiers (enforcement, deterministic), production code (implementation, runtime). Three artifacts means duplication, and duplication means drift. This section addresses (a) how invariants evolve over time without process overhead exploding, and (b) what happens when the three artifacts disagree.

### Stability tier

Every invariant carries a `tier` that governs *change process*, not enforcement. CI runs the verifier deterministically regardless of tier; tier dictates how much ceremony is required to revoke or modify the invariant.

| Tier | Meaning | Change ceremony |
|---|---|---|
| `draft` | New / exploratory / stabilizing. May be revoked or sharpened. The right tier for "we think this might be true," "let's see if this constraint helps," or "we're still validating this." Drafts can stay drafts for as long as needed — there's no time pressure to promote. | Lightweight ADR delta; one round of human review. Withdrawal in a follow-up ADR is normal. |
| `active` | Committed contract. Intended to hold indefinitely. Removal or weakening is a breaking change. | ADR with explicit deprecation period (mark deprecated, run with deprecation warning for a grace period, then withdraw). |

**Default tier on introduction:** `draft`. Invariants start uncommitted. Promotion to `active` is a deliberate later step. The introducing ADR may declare a higher starting tier with explicit justification — used for security boundaries and other obviously-fundamental claims that don't need a probationary period.

#### Core attribute (computed, not a tier)

`core: true` is set on an invariant when it has accumulated significant architectural weight — measured by how many other ADRs rely on it. It is *not* a separate governance state; it's an attribute that *amplifies* the removal ceremony of an `active` invariant.

**Computation rule (default):** `core = true` iff ≥ 3 other ADRs rely on the invariant as load-bearing. The reliance graph is computed by docs-mcp from structured `### Relies On` blocks in ADR Invariant Delta sections (see Lineage section below).

**Manual override:** an ADR may declare `core: true` explicitly when authorial judgment precedes reliance evidence (e.g., a security boundary declared core on Day 1 because the architectural significance is obvious). This sets a sticky flag that survives recomputation.

**Effect of `core: true`:**

- Removal requires either a successor invariant (Supersession) or an explicit redesign-impact analysis in the withdrawal ADR.
- Deprecation period defaults to ≥ 2 audit cycles (vs. 1 for non-core active).
- Citation graph from the dashboard surfaces all ADRs that depend on it, so the redesign blast radius is visible up-front.

#### Promotion criteria

The single promotion `draft → active` is its own ADR (a pure tier-change delta). The promoting ADR must include the evidence below; the audit advisory flags promotions that lack it.

**Draft → Active** requires:

1. **Survival**: the invariant has existed for ≥ 2 audit cycles (~6 months at quarterly cadence) without being modified or revoked. (No upper bound — drafts can stay drafts indefinitely.)
2. **Stability of statement and verifier**: no audit advisory output proposed sharpening, modifying, or removing it in the survival window; verifier hasn't needed re-compilation due to drift; statement-↔-verifier roundtrip passed in the most recent audit.
3. **Utility evidence**, at least one of:
   - The verifier has caught a real violation (i.e., a code change broke this verifier and was prevented from merging).
   - ≥ 1 other ADR relies on this invariant.
   - A differential regeneration audit demonstrated convergence on the constrained behavior.
4. **Surrounding-code stability**: the production code that satisfies this invariant hasn't been substantially refactored (>30% line churn in the verifier's target files) in the last 2 cycles. If surrounding code is churning, the invariant isn't stable — it's just lucky.

These criteria can be batched: a single quarterly "invariant promotions" ADR can promote multiple invariants at once, listing evidence per ID.

#### Demotion / removal path

Any tier → `deprecated` (status, not tier) → `withdrawn`. The ceremony required depends on the current tier and the `core` attribute:

| Tier + core | Demotion ceremony |
|---|---|
| `draft` | Single ADR transitions `active` → `withdrawn` directly; deprecation period optional. Verifier file deleted in same commit. |
| `active`, core=false | ADR with deprecation reasoning; required deprecation period (default 1 audit cycle) before withdrawal; deprecation documented in the ADR. |
| `active`, core=true | ADR with redesign justification or successor invariant (Supersession); required deprecation period (default 2 cycles); reliance-graph blast-radius surfaced from the dashboard. |

#### Operational effect of tier

CI enforcement is identical across tiers — a verifier failure blocks merge regardless of whether the invariant is `draft` or `active` or `core`. Tier governs *invariant-level governance*, not CI enforcement.

| Tier + core | Audit treatment | Refactor friction |
|---|---|---|
| draft | Light review; freely revocable | Low — follow-up ADR can withdraw |
| active, core=false | Reviewed for deprecation only | High — deprecation period required |
| active, core=true | Reviewed for redesign or supersession | Very high — redesign event with blast-radius analysis |

### Lineage and reliance graph

The methodology builds a typed graph over its artifacts. This is a direct extension of the lineage dashboard already established in agent-plugins (ADR-0029-31, 0036, 0040, 0042, 0050) for ADR↔spec relationships — same docs-mcp, same dashboard, new node and edge types.

#### Node types

- **ADR** (existing) — every `docs/adr-NNNN-*.md` file.
- **Spec** (existing) — every `docs/spec-*.md` file.
- **Invariant** (new) — every entry in the registry.
- **Verifier** (new) — every test file, lint rule, or schema referenced by an invariant.
- **Glossary term** (new) — every entry in the glossary.

#### Edge types

| Edge | From → To | Source of truth | Maintained by |
|---|---|---|---|
| `relies_on` | ADR → Invariant | ADR `### Relies On` block in Invariant Delta | docs-mcp parser |
| `introduces` | ADR → Invariant | ADR `### Added` block | docs-mcp parser |
| `modifies` | ADR → Invariant | ADR `### Modified` block | docs-mcp parser |
| `promotes` | ADR → Invariant | ADR `### Promoted` block | docs-mcp parser |
| `deprecates` | ADR → Invariant | ADR `### Deprecated` block | docs-mcp parser |
| `withdraws` | ADR → Invariant | ADR `### Withdrawn` block | docs-mcp parser |
| `supersedes` | Invariant → Invariant | Registry `superseded_by` field | Registry |
| `pinned_by` | Invariant → Verifier | Registry `verifier` field | Registry |
| `uses_term` | Invariant → Glossary term | Registry `glossary_terms` field | Registry |
| `defines_term` | Type/Method → Glossary term | Glossary `resolves_to` field | Glossary |

#### Reliance detection: explicit Relies On section, not inline

Reliances are detected from a structured `### Relies On` block in the ADR's Invariant Delta section. **Inline mentions of invariant IDs in ADR prose do not count.** This is the load-bearing anti-gaming rule:

- Inline detection has too many failure modes — incidental mentions count alongside dependencies, renames silently break references, gameable by mention frequency, requires NLP heuristics that aren't deterministic.
- Explicit declaration is unambiguous, deterministic to parse, deliberate by friction, mechanical to maintain across renames, and reviewers can challenge "you said you rely on this but I don't see the dependency."

Inline mentions get an *advisory* signal only: the audit advisory may flag "ADR mentions invariant X but doesn't list it in Relies On — intentional?" Authors decide; not a CI gate.

#### Reliance graph computation

`core` is computed from the reliance graph with strict anti-gaming rules:

```
relied_on_count(invariant) = |{ adr | adr ∈ relies_on_block(invariant) }|
                              where adr satisfies all of:
                                1. adr is "live" (status ≠ withdrawn ∧ ≠ superseded-as-doc)
                                2. adr has no meta-edge to invariant
                                   (no Added / Modified / Promoted / Deprecated /
                                    Withdrawn / Supersedes edge from this same ADR)
                                3. invariant appears at most once in adr's Relies On block
                                   (set cardinality, not line count)

core(invariant) = (relied_on_count(invariant) ≥ 3) OR manually_set(invariant)
```

**Rationale for each anti-gaming rule:**

1. **Live ADRs only.** Withdrawn or superseded ADRs don't vote. Otherwise old ADRs that everyone has moved past would still inflate counts indefinitely.
2. **No double-counting via meta-edges.** If ADR-X already introduces, modifies, or withdraws an invariant, it doesn't *also* count as a reliance — the meta-edge is a stronger relationship; conflating them lets every introducing ADR auto-count toward core-ness.
3. **One ADR = one reliance.** Even if the ADR's Relies On block lists the same invariant ID three times for three different reasons, that's one reliance. Counts go off the deduplicated set per ADR, not the raw line count.

The default threshold (3) is per-project configurable. Threshold-tuning is the right knob to turn if `core` ends up too restrictive or too permissive in practice — the underlying signal stays clean.

#### MCP tools (extension of existing docs-mcp)

| Tool | Returns |
|---|---|
| `list_invariants` | All registered invariants with tier/status/core flag |
| `search_invariants` | Full-text + structured search across statements, glossary terms, mechanisms |
| `get_invariant` | Full registry entry + computed relied-on count + relied-on-by ADR list |
| `get_invariant_lineage` | All ADRs in the invariant's history (introduces/modifies/promotes/deprecates/withdraws/relies-on) |
| `get_adr_invariants` | All invariants an ADR introduces, modifies, or relies on — extends existing ADR lineage view |
| `get_verifier_invariants` | Reverse mapping: which invariants does this test/rule/schema pin? |

#### Dashboard views (extension of existing docs-dashboard)

- **Invariants tab** — sortable list with columns: ID, statement, tier, status, mechanism, relied-on count, last audit. Filter by component, tier, status, mechanism. Click → detail view.
- **Invariant detail** — full registry entry, statement, glossary terms (linked), verifier file (linked, with last-modified diff), relied-on-by list (each ADR linked), supersession chain (if applicable), audit history, drift health indicators.
- **Reliance graph view** — force-directed graph rendering of ADR↔invariant↔verifier↔glossary edges. Hover for details, click to navigate.
- **Core candidates panel** — invariants with relied-on count ≥ 2 (one reliance away from auto-core); audit reviewers can promote manually via ADR or wait for the threshold.
- **Drift heatmap** — invariants overlaid with last-audit-status color (green = roundtrip OK, yellow = pending audit, red = drift detected).
- **Tier distribution** — bar chart of invariant counts by tier × component, highlighting components heavy in drafts (potential consolidation targets) vs heavy in actives (mature surfaces).
- **Promotion candidates** — drafts that have met all promotion criteria (survival, utility, surrounding-code stability) but haven't been promoted yet; one-click "draft promotion ADR" action.

#### Why this extension is natural

The existing dashboard infrastructure already does:
- File parsing (markdown → typed sections)
- Co-commit detection (git log analysis for lineage edges)
- SSE streaming for live updates
- React rendering with shadcn/ui components

Adding invariants as a node type, registry-as-data-source, and the new edge types listed above is incremental: new MCP indexer module for invariants/verifiers/glossary; new dashboard tab + detail components; reuse of existing graph rendering and search. Spec-quality work, not new-product work.

### Lifecycle status (orthogonal to tier)

| Status | Verifier runs in CI? | Registry coverage CI gate behavior |
|---|---|---|
| `active` | Yes | Must have a live verifier file |
| `deprecated` | Yes (still enforced) | Annotated "scheduled-for-removal in ADR-NNNN"; future ADR will withdraw |
| `superseded` | No (replaced) | Points to replacement invariant ID via `superseded_by`; verifier file removed concurrently with the supersession ADR |
| `withdrawn` | No (removed) | Verifier file MUST be deleted in the same commit as the ADR that withdraws. Registry entry retained with status=withdrawn for historical audit traceability only. |

This means the `methodology.registry.no_orphans` CI gate has a refined contract: every *active or deprecated* invariant has a live verifier; every verifier pins an active or deprecated invariant. Superseded and withdrawn entries don't have verifiers — the verifier files were removed in the same commit that flipped status.

### Conflict resolution: who is right when artifacts disagree?

The three artifacts encode the same truth differently and can drift. The methodology declares an authority hierarchy:

**Authority order (intent):** statement > verifier > code.
**Operational reality (what CI checks):** verifier is what actually runs.

These two are in tension. In practice the verifier IS the operational truth (CI passes if it passes), and the statement is *aspirational* unless audit mechanisms keep it aligned with the verifier.

| Conflict shape | Diagnosis | Fix |
|---|---|---|
| Statement ↔ verifier disagree (different truths) | Verifier under- or wrong-captures the statement | Fix the verifier (re-compile from statement). Statement is authoritative. If statement was ambiguous, sharpen it first, then re-derive. |
| Statement ↔ code disagree | Code violates the contract | Fix the code. The verifier should have caught this; if it didn't, also fix the verifier. |
| Verifier ↔ code disagree (CI fails) | Either code is wrong OR verifier is wrong | Default: code is wrong (fix it). If statement was ambiguous and the verifier interpreted incorrectly, fix verifier too. |
| All three pass but the statement is silently wrong | Statement is stale, or LLM-author misunderstood | Audit ritual catches this — see below |

**Drift detection mechanisms** (because resolution rules are useless if drift is not detected):

1. **Roundtrip at audit time.** Feed verifier to a fresh LLM, ask it to write the invariant statement, diff against the registered statement. Mismatch = drift.
2. **Differential regeneration.** Regenerate code from the statement; if regenerated code differs from existing in *behavior* but both pass the verifier — verifier under-captures statement.
3. **Mutation testing of the implementation.** Mutate code in ways that should violate the statement; verifier should fail. If it doesn't, verifier under-captures.
4. **Coverage-of-statement audit (LLM-assisted, quarterly).** Read invariant + verifier together; ask "does this verifier fully prove this statement?" Output is advisory; flagged invariants get re-compiled.

**Why this duplication is worth the cost:**

The alternatives are worse. *Verifier-only (no statement)*: no ADR traceability (test functions break on rename), no glossary anchoring, no audit substrate. *Statement-only (no verifier)*: not deterministic — LLM has to interpret spec at every CI run, which is the v1 SDD failure mode v2 exists to fix. The duplication is the *price of having both intent and enforcement deterministic*. The methodology pays it upfront with drift-detection rather than pretending the artifacts can't drift.

**Operational summary:** when statement and verifier conflict in audit, treat the verifier as the bug — it's the artifact that's *supposed* to be a deterministic encoding of the statement. The statement only gets revised when the audit reveals the original statement was itself ambiguous or wrong, in which case the fix is "sharpen the statement, re-derive the verifier." This keeps the authority hierarchy stable while admitting the operational reality that verifiers can drift from statements.

## Error Handling

- **Verifier compilation failure** (LLM produces invalid code): build break; human authors fix or re-runs compilation with corrected ADR.
- **Differential regeneration produces incorrect implementations**: surfaces as a spec gap; failing invariants identify which decisions weren't constrained enough. Author follow-up ADR with sharpened invariants.
- **Invariant registry drift** (entry has no live verifier; verifier pins unknown invariant): CI gate fails; must be resolved before merge.
- **Coexistence dispatch error** (change request hits a component without a mode flag, or with an unknown mode): /plan-feature halts and asks operator to declare the mode explicitly.
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
- `src/sdd/spec/invariants.go` (or chosen format) — methodology's own registry, ~9 entries.
- `src/sdd/spec/glossary.md` (or chosen format) — methodology's own glossary.

Consumer projects: each authors its own *adoption* ADR in its own repo, citing this ADR as the methodology source. mclaude's ADR-0100 is the first such adoption ADR; others follow per project.

## Scope

In v1 of this ADR (i.e., spec-driven-dev v2.0):
- Methodology declaration (artifacts, cycle, principles, taxonomy).
- Methodology's own invariant registry (Day 1 contents listed).
- Plugin source extensions (new skills, new subagent, extended existing skills).
- Coexistence dispatch mechanism (per-component mode flag).
- Bootstrap implementation in agent-plugins itself.
- Documentation (4 new specs).

Explicitly deferred:
- Consumer project adoption — each consumer authors its own adoption ADR (e.g. mclaude ADR-0100). This methodology ADR doesn't author them.
- TypeScript / non-Go language bindings — methodology is language-agnostic in principle but Day-1 implementation targets Go (since agent-plugins's docs-mcp is Go and mclaude is Go). TS/Python/Rust per-mechanism tool choices documented but not yet implemented.
- Mutation testing as a CI mechanism — defined in the taxonomy but Day-1 use is audit-only (`go-mutesting` quarterly).
- Journey authoring as a separate skill — invariants of journey-shape are supported, but the dedicated `journey-author` subagent is deferred.
- v1 retirement — v1 markdown-spec mode stays available indefinitely. Future ADR may sunset it once all known consumers migrate.

## Open questions

- **Invariant registry format**: language-native const slice (Go: `var Registry = []Invariant{...}`), YAML file, separate file per invariant (`spec/invariants/<id>.md`), or comment-extracted from test files via codegen?
- **Glossary form**: standalone `glossary.md`, language-native const map for type-checked references (`var Glossary = map[Term]Definition{...}`), or generated index from typed bindings only?
- **Verifier file layout**: co-located with code (`*_test.go` next to `*.go`), dedicated `internal/spec/` subdirectory, separate spec package, or hybrid (unit co-located, integration in dedicated dir)?
- **ADR delta block structure**: dedicated section (current draft), embedded in Decisions table, or in Component Changes? Trade-off: visibility vs. duplication.
- **Skill suite scope**: which become first-class `/`-commands? Candidates: `/compile-invariants`, `/audit-invariants`, `/check-glossary`, `/check-registry-coverage`. Trade-off: more skills = better context isolation; fewer = simpler mental model.
- **Differential regeneration cadence + owner**: quarterly + manual trigger, nightly + scheduled, on-demand only? Who reads the diff and triages divergence-as-freedom vs divergence-as-gap?
- **Per-component mode flag location**: `.sdd/components.yaml` at consumer project root, frontmatter in each component spec, or inferred from presence/absence of an invariant registry?
- **Registry-coverage CI gate failure semantics**: block merge or warn? (Day 1 should probably be block; Day 0 advisory while machinery stabilizes.)
- **LLM compilation step ergonomics**: `invariant-compiler` invoked inline during /plan-feature (immediate, but couples skills), as a dedicated /compile-invariants slash command (separable, but extra step), or as part of dev-harness (lazy, but obscures the spec→code translation)?
- **Methodology spec doc partition**: one big `spec-invariant-driven-development.md`, or split into `spec-invariant-registry.md` + `spec-verifier-conventions.md` + `spec-glossary.md` + `spec-self-application.md`? (Current draft proposes the split, but a single dense doc may be easier to keep coherent during rapid iteration.)
- **Bootstrap timing**: register the methodology's own 9 invariants in this same ADR's commit (Day 1 concurrent with v2.0 release), or in a follow-up ADR-0076 once the basic infrastructure is in place (sequenced)?
- **Language-binding generality**: do we declare in this ADR that v2 is multi-language with Go as Day-1 implementation, or scope it to Go-only with multi-language as a future ADR?
- **Mutation testing for CI vs audit-only**: Day-1 use audit-only is conservative; should Day-1 also include mutation testing of the methodology's own invariants as a CI gate (since the registry is small)?

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| Day-1 bootstrap end-to-end | Register the 9 methodology invariants, generate verifiers via invariant-compiler, run CI gates, all pass | Manual: run /compile-invariants on the methodology's invariants.yaml; commit; run check-registry-coverage and check-glossary | invariant-compiler subagent, /check-registry-coverage, /check-glossary, registry, glossary |
| v2 mode dispatch | A component with `mode: v2` correctly routes through the v2 ADR template; a `mode: v1` component routes through markdown-spec | Manual: trigger /plan-feature for one of each in a test consumer project | /plan-feature, components.yaml dispatch |
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
| /plan-feature extension (v2 dispatch + Invariant Delta block) | 200-400 lines | 80k | Touch existing skill; risk of regression on v1 mode |
| /feature-change extension (verifier suite vs implementation-evaluator) | 100-200 lines | 60k | Touch existing skill |
| /compile-invariants new skill | 200-400 lines + subagent prompt | 80k | New skill + subagent definition |
| /audit-invariants new skill | 300-600 lines | 100k | Larger; orchestrates rm + regenerate × N + diff |
| /check-glossary new skill (deterministic) | 100-200 lines Go or shell | 40k | Script, not LLM |
| /check-registry-coverage new skill (deterministic) | 100-200 lines | 40k | Script |
| invariant-compiler subagent | 200-400 lines (prompt + per-mechanism conventions) | 80k | New agent definition |
| Day-1 bootstrap: register 9 methodology invariants + generate verifiers | ~500-1000 lines spec/test code | 100k | Bulk of the bootstrap; LLM-compiled, human-reviewed |
| context.md extension (dispatch rules) | ~50 lines | 15k | |
| spec-agents.md extension | ~50 lines | 15k | |
| components.yaml schema + parser | ~100 lines | 30k | Per-project mode flag mechanism |

**Total estimated tokens**: ~800k-1.1M
**Estimated wall-clock**: 1-2 weeks for a working v2.0 with Day-1 bootstrap complete and the first consumer (mclaude) able to run /plan-feature in v2 mode against control-plane.

**Phasing**:
1. **Phase 0 (this ADR commit)**: methodology spec docs authored; ADR-0075 accepted.
2. **Phase 1 (1-2 days)**: skill extensions + new skills authored; subagent defined; deterministic scripts written. No invariants registered yet — machinery only.
3. **Phase 2 (2-3 days)**: Day-1 bootstrap. Register the 9 methodology invariants. Verify CI gates green. The framework now verifies itself.
4. **Phase 3 (1-2 days)**: Coexistence wiring. components.yaml dispatch in /plan-feature and /feature-change. v1 path verified to still work.
5. **Phase 4 (concurrent with mclaude ADR-0100 finalization)**: First consumer pilot. mclaude-control-plane greenfield migration begins. Real-world stress-test of the methodology.

After Phase 4, this ADR's status flips from `accepted` → `implemented`. Subsequent ADRs (76+) handle: TypeScript bindings, mutation-testing as CI, journey-author subagent, v1 retirement timing.
