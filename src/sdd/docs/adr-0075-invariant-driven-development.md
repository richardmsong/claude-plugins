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
| Verification taxonomy | Each invariant names exactly one primary verification mechanism: unit, table, property, architectural-rule, AST, type-system, schema, codegen-completeness, integration, journey | A requirement that can't name a mechanism is inadmissible — either move to ADR rationale or sharpen until it fits. Forces precision discipline at authoring. |
| LLM role | Authoring + audit only, never recurring validation | Token cost is paid once per invariant (compilation) and once per quarter (audit), not per CI run. CI is pure CPU, sub-minute, deterministic. |
| Language binding | Spec encoded in the *consumer language* (Go test files for Go projects, TS test files for TS projects); the language is part of the contract | Goroutine semantics, `context.Context` propagation, error-wrapping conventions, async/await idioms are load-bearing. "Recompile to a different language" would silently drop them. |
| Constraint scope | Constrain contracts (user-visible, cross-component, security-critical); leave internals liquid | Overconstraint causes refactor friction and premature crystallization. Differential regeneration tells us when the line is drawn wrong (divergence-with-correctness = appropriate freedom; divergence-with-incorrectness = real spec gap). |
| Vocabulary precision | Hybrid: types-as-glossary primary (entities → language types, predicates → methods); explicit `glossary.md` for cross-cutting concepts and ambiguous domain terms | Invariant statements use *terms*; un-pinned terms drift at the vocabulary layer. Types carry most of the load (compile-checked, refactor-safe); a small glossary covers what types can't express. CI gate: every term in an invariant statement resolves to a typed binding or glossary entry. |
| Registry framework approach | Custom thin per-language layer (~200 LOC) + reuse of per-mechanism tools; no off-the-shelf "invariant registry framework" exists that fits | Closest adjacent frameworks (ArchUnit, fitness functions, TLA+, OPA/Rego, CUE, Concordion, JML, Cucumber) cover slices but none combines named registry + multi-mechanism verification + CI-gateable coverage. Building thin and reusing mature per-mechanism tools is the right shape. |
| Per-mechanism tool choices (Go projects) | Behavior: `go test` + table tests; Property: `rapid`; Architecture: `go-arch-lint` + `depguard`; AST: `semgrep` + `go/analysis`; Schema: `protobuf` + `buf`; Type system: `exhaustive`, `nilaway`, sealed interfaces; Codegen completeness: `go:generate` + reflection; Mutation: `go-mutesting` (audit-only) | Mature, Go-native, refactor-friendly. Other languages get analogous default toolchains documented in the methodology spec. |
| Plugin shape | Evolution of spec-driven-dev. Existing skills (`/plan-feature`, `/feature-change`) extend to support invariants additively. ADRs without Invariant Delta blocks remain valid. | Solo-developer-friendly: no parallel modes, no dispatch logic, no formal cutover. Invariants are an opt-in feature per ADR. |
| Bootstrap project | agent-plugins itself; methodology's own invariants register first (Day 1), consumer-project invariants follow (Day N) | Self-application is evidence of generality. Proving the framework on its own meta-level before consumers bet on it de-risks adoption. |
| Invariant stability tier | Two-tier system: `draft` / `active`. Default on introduction = `draft`. One promotion ADR per invariant (`draft → active`); evidence required (audit survival, utility, surrounding-code stability). | Four tiers (experimental/provisional/stable/core) imposed too many promotion ADRs (~12/month at scale). Two tiers cut throughput 2-3× while preserving the load-bearing distinction between "we're trying this" and "we're committed." Provisional collapses into draft (drafts can survive long); core converts to a computed attribute. |
| Core attribute (computed) | `core: true` automatically set when ≥ 3 other ADRs rely on the invariant as load-bearing; also manually settable for explicit declarations. Affects removal ceremony (core requires successor invariant or explicit redesign justification). | Core-ness is a *consequence* of architectural significance, not a separate governance state. Computing it from the relied-on count makes the signal evidence-based and game-resistant; manual override exists for the rare case where authorial judgment precedes evidence. Reuses the lineage-dashboard concept already established for ADR↔spec relationships. |
| Invariant lifecycle status | Orthogonal axis: `active` / `deprecated` / `superseded` / `withdrawn`. Withdrawal requires verifier file deletion in the same commit. | Separates "is this still enforced?" (status) from "how committed are we?" (tier). Allows graceful deprecation periods for active invariants and lightweight Day-2 revocation for drafts. |
| Conflict resolution authority | Authority hierarchy: statement > verifier > code. Operational reality: verifier is what CI runs. When statement and verifier conflict at audit, the verifier is the bug (it should be a deterministic encoding of the statement). Statement is revised only when audit reveals the original statement was ambiguous. | Three artifacts encoding the same truth means drift is possible. An explicit hierarchy gives a deterministic resolution rule rather than living with silent drift. |
| Verifier-required at ADR drafting | Every Added/Modified delta entry ships with its working verifier code in the same commit. ADRs cannot finalize while any newly-added invariant lacks a verifier that compiles and runs. The invariant-compiler subagent is invoked inline during ADR authoring, not as a separate post-finalization step. | Invariant statements are provisional until the verifier exists — writing the verifier is the precision-forcing function that exposes ambiguities the prose hides. Speculative invariants ("nice if we tracked X") get filtered because they can't survive verifier-authoring. The registry only contains contracts you can prove. |
| Independence rule | Registered invariants are pairwise logically independent. If A's truth implies B's truth, B is not a separate invariant — consolidate into A or document as a corollary in A's prose. The registry is a minimal set of claims, not a decomposed catalog. | Bounds registry growth deterministically. If you find yourself wanting an `implies` edge between two registered invariants, one of them shouldn't be registered. Forces precision: every invariant must defend its independence from existing ones. |
| Lazy decomposition by independent governance | An aspect of an invariant becomes its own invariant only when an ADR proposes evolving that aspect independently of the parent. Until then, it's part of the parent's verifier as an internal sub-check. | Avoids speculative decomposition. Field-level invariants emerge from real evolution history, not from authors imagining future evolution. Day 1 starts with coarse invariants; granularity grows organically when migrations or refactors force fields/aspects into independent governance. |
| Edge taxonomy | DAG edges between invariants are `requires` and `supersedes` only. `requires` (operational): A's verifier presupposes B's truth; A can't be checked if B is broken. `supersedes` (temporal): B replaces A in time. `composed_of` and `implies` are dropped — the first is redundant aggregation; the second indicates a registration error (consolidate or document inline). | Two edge types, both encoding non-logical relationships. The DAG is purely operational dependency, used for verification ordering, withdrawal cascade, audit prioritization. Logical relationships between invariants don't earn an edge type because they shouldn't exist between *registered* invariants. |
| Composite invariants | Composites exist only when they encode cross-cutting contracts that aren't the conjunction of leaves (e.g., cross-row uniqueness, referential integrity, aggregate counts, ordering). Such composites are themselves standalone invariants with `requires` edges to the leaves they presuppose, not aggregations of them. ADRs default to relying on leaves; composite reliance is audit-flagged as suspicion. | Aggregations are smells — "row well-formed" tells reliers nothing about which fields they actually depend on. Real composites are non-redundant table-level claims that no leaf can express. |
| Definition vs Comments fields | Registry entry has two text fields: `Definition` (the contract; changes trigger Modified deltas and reactions) and `Comments` (free-form annotations: insights, edge cases, performance notes, historical context; changes do not trigger reactions; freely editable). | Most documentation refinement isn't a contract change. Splitting allows informational annotations to accumulate without ceremony, while keeping the contract surface stable. Comments are advisory — wrong comments don't fail CI; the audit flags suspect ones. LLM tools (compiler, triage, audit) read comments as context. |
| Invariant registry format | (decision pending: language-native const slice, YAML, separate file per invariant, comment-extracted from test files) | |
| Glossary form | (decision pending: standalone `glossary.md`, language-native const map for type-checked references, or generated index from typed bindings) | |
| Verifier file layout | (decision pending: co-located with code, dedicated `internal/spec/` subdirectory, separate spec package, or hybrid by mechanism) | |
| ADR delta block structure | (decision pending: dedicated section, embedded in Decisions, or in Component Changes) | |
| Differential regeneration cadence + owner | (decision pending: quarterly + manual, nightly + scheduled, on-demand only; who triages divergence) | |
| Skill suite scope | (decision pending: which become first-class `/`-commands vs. fold into existing skills) | |

## User Flow

The development cycle for a v2 component (in any consumer project):

1. **Change request enters.** User asks for a feature, fix, refactor, etc.
2. **Master session authors an ADR draft** via `/plan-feature`. If the ADR will introduce or modify invariants, the author includes the structured **Invariant Delta** block (added/modified/removed invariants with mechanism + verifier pointer). If not, the ADR proceeds as a standard markdown ADR.
3. **Invariant decomposition.** Each new invariant is named, statemented in one line, and tagged with its primary verification mechanism. Invariants that can't name a mechanism are either inadmissible or need sharpening — this is the precision forcing function. The skill blocks ADR finalization until every proposed invariant has a mechanism.
4. **Glossary check.** A deterministic script (`/check-glossary` or run inline) verifies every term in invariant statements resolves to a typed binding or a glossary entry. New terms either get typed or get glossary entries before the ADR finalizes.
5. **LLM compiles invariants → verifier code.** The `invariant-compiler` subagent reads the new/modified invariants from the ADR delta and generates the corresponding test files, lint rules, schemas. Output is staged alongside the ADR.
6. **Human reviews compiled verifiers.** Same review bar as hand-written code. The LLM's output is not blessed because an LLM wrote it; it's blessed because a human read it and understood what each verifier proves.
7. **Implementation follows.** `/feature-change` invokes dev-harness. If the ADR introduced invariants, the verifier suite (`<lang> test` + lint + schema runs) is the success criterion. If not, the existing implementation-evaluator path is used. The two are complementary, not exclusive.
8. **CI runs the verifier suite on every commit.** Pure CPU, sub-minute, no model dependency. Failures localize to specific invariants by ID.
9. **Periodic differential regeneration audit** (`/audit-invariants`). Quarterly or per major refactor checkpoint: `rm` production code, regenerate from invariants × N, diff results. Convergence-with-correctness validates spec precision. Divergence-with-correctness reveals appropriate underconstraint. Divergence-with-incorrectness localizes spec gaps to specific decisions. Output is a triaged Markdown file reviewed by a human; spec changes are authored as new ADRs.
10. **Periodic LLM audit run (advisory).** Reads the invariant registry plus recent ADRs, suggests missing journeys, missing invariants, drift between ADR rationale and registry contents. Output is advisory; never blocks.

## Component Changes

### `src/sdd/.agent/skills/`

**Existing skills, extended:**

- `plan-feature/SKILL.md` — gains optional Invariant Delta block in the template. When the author indicates the ADR will introduce invariants, the skill prompts for the delta entries and runs glossary/mechanism checks before finalization. When the author indicates no invariants, the skill produces a standard ADR unchanged.
- `feature-change/SKILL.md` — when the ADR includes an Invariant Delta block, the verifier suite is added as a success criterion alongside the existing implementation-evaluator. When the ADR has no delta block, behavior is unchanged.
- `setup/SKILL.md` — unchanged. The methodology is additive; no mode setup is required.

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
- `context.md` — extend with the additive Invariant Delta block convention.

### Methodology's own registry

`src/sdd/spec/invariants.<lang>` — the methodology's own invariant registry. Initial contents are DAG roots (no `requires` edges), authorable with just registry/glossary/ADR-block parsers:

- `methodology.registry_entry.well_formed` — schema validity for registry entries (replaces 12+ field-level invariants from earlier sketches under the "schema is one invariant until evolution forces split" rule)
- `methodology.glossary_entry.well_formed` — schema validity for glossary entries
- `methodology.adr.delta_block.well_formed` — schema validity for ADR Invariant Delta blocks
- `methodology.registry.no_orphans` — every active/deprecated entry has live verifier; every verifier referenced by exactly one entry
- `methodology.adr.delta_reconciles` — sum of live ADR deltas equals current registry contents

Layer 1 (requires roots): `methodology.glossary.complete`, `methodology.registry.references_have_delta_blocks`, the reliance-graph anti-gaming invariants — these enter the registry once the prereq machinery is authorable.

Deeper layers (audit, reaction process, triage, dashboard, MCP) enter as their respective tooling lands and verifiers become authorable. The full methodology DAG grows from ~5 roots to ~30-40 standalone invariants over the implementation arc; speculative or aggregation-style invariants are excluded by the independence and lazy-decomposition rules.

The registry-coverage CI gate runs against the live set, growing with the registry. Each invariant in the registry has working verifier code in the same commit — no draft-without-verifier state.

## Data Model

### Invariant registry entry (format pending; conceptual shape)

```
- id: <stable_dot_separated_name>
  definition: <one-line natural language contract; no AND; changes trigger Modified deltas>
  comments: <free-form notes: edge cases, performance, history, hints; advisory only>
  mechanism: unit | table | property | arch | ast | type | schema | completeness | integration | journey
  verifier: <path/to/test_file::TestName | path/to/.arch/rule.yaml | ...>
  requires: [list of invariant IDs this verifier presupposes]
  glossary_terms: [list of terms in definition that need resolution]
  tier: draft | active
  status: active | deprecated | superseded | withdrawn
  introduced_by: adr-NNNN
  promoted_by: adr-MMMM            # set when tier flips draft → active
  superseded_by: <id of replacement, if status = superseded>
  core: <computed: true if ≥3 ADRs rely on this; can be manually overridden>
  relied_on_by: [adr-NNNN, adr-MMMM, ...]   # populated by docs-mcp from ADR Relies On blocks
```

`definition` is the contract surface; edits trigger Modified-delta machinery. `comments` is advisory annotation; edits are free.
`tier` governs *change process* (lightweight for draft, deprecation-period for active). `status` governs *whether the verifier runs and how the registry handles it*. `core` is a derived attribute computed from the reliance graph; it elevates the removal ceremony but doesn't add a governance state.
`requires` lists invariant IDs that this invariant's verifier presupposes — the operational dependency edges that form the DAG. The DAG must be acyclic; CI gate enforces.

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
- `<id>`: <definition> (mechanism: <m>, verifier: <path>, tier: draft, requires: [<ids>])
  *(Newly registered invariants default to tier `draft` unless explicitly introduced as `active` with justification. Verifier file MUST exist and compile in the same commit. Optional: comments inline.)*

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

#### Modification policy and runbook

Modification is the most dangerous delta type because it can silently change the contract: statement and verifier can drift, reliance edges become stale (ADRs relied on the old form, may not realize the new form differs), and "Modified" covers everything from typo fixes to substantive rewrites without distinction. The methodology classifies modifications by impact and routes substantive changes away from `Modified` to `Supersession`.

**Three classes of modification:**

| Class | What changed | Example | Routing |
|---|---|---|---|
| **A — Mechanical** | Wording / mechanism-name / verifier-path; statement *meaning* unchanged | Typo fix; mechanism rename in the taxonomy; test file moved | `Modified` delta; lightweight |
| **B — Sharpening** | Statement narrowed or clarified without changing intent | "active user" → "user with non-null `login_at`" (was fuzzy, now precise); "all writes" → "all writes via API surface" | `Modified` delta; full runbook |
| **C — Substantive** | Statement meaning changed; the contract is now different | "users have email" → "users have email or phone"; "JWT signed HS256" → "JWT signed RS256" | **Forbidden as `Modified`. Use `Supersession` instead.** |

The hard rule: **Class C must be Supersession.** If the contract is changing, withdraw the old invariant and introduce a new one with a new ID. Relying ADRs explicitly redeclare reliance on the new — which is the *right* behavior, since they should review whether the new form still supports their decisions. The audit advisory flags "this Modified delta looks substantive; consider Supersession," but final classification is the author's call (humans review).

**Runbook per class:**

**Class A — Mechanical:**

1. `Modified` delta; rationale = `"mechanical: <what changed>"`.
2. If verifier path changed: update `verifier` field in registry.
3. If statement wording changed but meaning unchanged: re-run statement-↔-verifier roundtrip (advisory; should still pass).
4. Reliance review: not required.
5. Single commit: ADR + registry + (optional) verifier path update.

**Class B — Sharpening:**

1. `Modified` delta; rationale = `"sharpening: <what was clarified>"`.
2. Re-compile verifier from new statement via the `invariant-compiler` subagent.
3. Human reviews verifier diff (old vs. new).
4. CI gate: statement-↔-verifier roundtrip on the new pair must pass.
5. Reliance scan: dashboard surfaces every ADR with a `relies_on` edge to this invariant.
6. Advisory notification on each relying ADR: "invariant X you rely on was sharpened; review whether your decisions still apply."
7. If any relying ADR objects → escalate to `Supersession` (Class C).
8. If invariant has `core: true`: extra review — same ceremony as withdrawal of a core invariant; may be paired with a successor (i.e., promoted to `Supersession`).
9. Single commit: ADR + registry + new verifier.

**Class C — Substantive (forbidden as `Modified`; required as `Supersession`):**

1. Withdraw `<old_id>` (reason: "superseded by `<new_id>`").
2. Introduce `<new_id>` with the new statement (default tier: `draft`, unless explicit higher-tier introduction with justification).
3. Verifier file for `<old_id>` deleted in the same commit; new verifier for `<new_id>` authored in the same commit.
4. ADRs that relied on `<old_id>` are flagged: must explicitly redeclare reliance on `<new_id>` in a follow-up ADR (or explicitly accept being un-pinned, which itself requires review).
5. Standard withdrawal + introduction commit semantics.

**CI gates the runbook depends on:**

1. Statement-↔-verifier roundtrip on every `Modified` delta (catches A/B done wrong).
2. `methodology.registry.no_orphans` enforces verifier-deletion on withdrawal (catches C done wrong).
3. Advisory: "Modified delta classification" — audit LLM reads the diff and proposes A/B/C; flags suspected misclassification. Advisory only.

**Default disposition for `core` invariants:**

Modifications to `core` invariants are stricter:
- Class A allowed without extra ceremony.
- Class B requires a 1-cycle deprecation phase before the new statement takes effect — relying ADRs have time to react (see Reaction process below).
- Class C (Supersession of a core invariant) requires redesign justification, blast-radius analysis from the dashboard, and ideally a paired successor invariant.

#### Reaction process: how relying ADRs respond to changes

When a `Modified` (Class B sharpening), `Superseded`, or `Withdrawn` delta affects an invariant with relying ADRs, those ADRs must "react" — explicitly acknowledge the change before the triggering ADR can merge. The reaction is a data-driven workflow, not an email or hand-wave.

**Reaction artifact (one per relying ADR):**

When the triggering ADR opens as a PR, a CI hook scans the reliance graph and generates one artifact per relying ADR:

```yaml
# docs/reactions/<triggering_adr>-<target_invariant>-<relying_adr>.yaml
triggering_adr: adr-NNNN
target_invariant: <invariant_id>
delta_kind: sharpening | supersession | withdrawal
new_invariant: <successor_id>     # for supersession only
relying_adr: adr-MMMM
relying_adr_owner: <git author or explicit Owner: frontmatter>
state: pending
created: <date>
deadline: <date, cycle-based per target tier>
ack: null
ack_rationale: null
```

Reaction artifacts are committed alongside the triggering ADR's PR; their existence is what makes "reaction" trackable.

**Owner identification:**

- ADR may declare an explicit `Owner: <name or team>` in frontmatter.
- Default = original ADR commit's git author.
- Per-project fallback owner declared in a project-level config (e.g. `.sdd/config.yaml`) for un-owned ADRs.

**Reaction options (owner picks one per pending artifact):**

| Ack | Meaning | Effect |
|---|---|---|
| `re-pin` | "I reviewed; my decisions still apply" | Reliance edge stays; for supersession, edge auto-migrates to successor invariant |
| `update` | "I need to author a follow-up ADR adjusting my decisions" | Triggering ADR can merge only after follow-up ADR is committed |
| `migrate` | (Supersession only) "Redeclare reliance on successor explicitly via small ADR amendment" | Same effect as re-pin, but explicit acknowledgment |
| `accept-unpinning` | (Withdrawal only) "I accept losing the reliance edge; my ADR is now un-pinned" | Reliance removed; ADR flagged as un-pinned for future review |
| `object` | "Don't proceed with this change" | Triggering ADR blocked until objection is resolved (escalation to project owner / discussion / re-author) |

**State machine:**

```
pending → acked (with one of the reaction types)
pending → expired (deadline passed without action)
acked → (terminal)
expired → (terminal, default disposition applied)
```

**Expiration disposition by tier (default policy, per-project tunable):**

| Target invariant tier | Default on expired | Rationale |
|---|---|---|
| `draft` | `accept-unpinning` | Drafts move fast; non-response = implicit consent |
| `active`, core=false | `accept-unpinning` | Owner had a deprecation cycle; silence ≈ consent |
| `active`, core=true | **block** | Core changes require explicit decisions; silence is not consent |

**Merge gating:**

Triggering ADR cannot merge until *all* reactions are either:
- `acked` (any type except `object`), OR
- `expired` AND default disposition is acceptable per the table above.

Any `object` ack blocks indefinitely until resolved through human discussion (which usually re-authors the triggering ADR or escalates to a different strategy).

**CI gates that drive this:**

1. **Reaction generator** — runs on PR open; reads reliance graph; emits one artifact per relying ADR. Deterministic, can't be skipped.
2. **Reaction merge-gate** — checks that all reaction artifacts are `acked` or `expired` (with acceptable disposition) before allowing merge.
3. **Object-clear gate** — any artifact in `objected` state blocks merge.

**Dashboard surface:**

- **Reactions queue** (per owner): list of pending reactions with deadlines, target invariants, triggering ADRs. Grouped by LLM-suggested ack class (clear re-pins, needs judgment). One-click batch ack for high-confidence groups.
- **Triggering-ADR view**: shows which reactions are pending, acked, expired, or objected — author sees blockers in real time.

#### Reaction triage assistant (LLM-enhanced)

Manually reviewing every reaction artifact is impractical at scale (a single-person project may receive dozens per quarter; multi-team projects, hundreds). The methodology includes an LLM-driven triage assistant that *prepares* each reaction for human ack — without ever making the ack itself or gating CI.

**What the assistant does (per reaction artifact, fresh context per call):**

Reads:
- Triggering ADR's diff (what's changing)
- Target invariant (old form + new form)
- Relying ADR's full text (what decisions reference this invariant)
- Registry entry for the invariant + its glossary terms

Produces a structured suggestion that's written into the reaction artifact:

```yaml
llm_suggestion:
  ack: re-pin              # or update, migrate, accept-unpinning, undecided
  confidence: high         # high | medium | low
  rationale: |
    <one paragraph explaining why this ack is suggested, citing
     specific decisions in the relying ADR that are or aren't
     affected by the change>
  draft_followup: null     # or path to draft ADR if ack=update is suggested
  flags: []                # warnings that bias toward human review
human_decision: null       # filled in only when owner acks
```

**Per-tier auto-ack policy (per-project, opt-in, defaults conservative):**

| Target invariant | LLM confidence | Default behavior |
|---|---|---|
| `draft`, any confidence high | high | Auto-ack with LLM suggestion after 1 cycle of owner silence |
| `draft`, low confidence | low | Require explicit owner ack; LLM suggestion advisory |
| `active`, core=false, high | high | Pre-fill ack with LLM suggestion; one-click approve. No auto-ack on silence. |
| `active`, core=false, low | low | Require explicit owner ack; LLM suggestion advisory |
| `active`, core=true | any | **Always require explicit owner ack.** LLM suggestion advisory only. |

Projects may tighten the policy (e.g., disable auto-ack entirely while building trust in the assistant) or loosen it as observed accuracy improves.

**Boundaries the assistant must not cross:**

1. **Never auto-`object`.** If the LLM thinks the change is dangerous, it sets `confidence: low` with a flag and routes to human review. It never blocks the triggering ADR.
2. **Never auto-merge follow-up ADRs.** Drafted follow-ups are committed manually after owner review.
3. **Never override owner decisions.** Owner's manual ack supersedes any LLM suggestion without complaint.
4. **Never decide on `core` invariants.** Always advisory; explicit owner ack required.

**CI / cost / failure modes:**

- The triage assistant runs as part of reaction artifact generation (PR open) or on-demand. It's not a CI gate — merge gating still depends on the deterministic `human_decision` field being acked.
- Token cost: ~20–50k per reaction; cached on triggering-ADR content hash. A typical project's reaction load is a small fraction of overall LLM spend.
- Failure modes: LLM unavailable → reaction artifact generated without `llm_suggestion`; owner reviews manually as if assistant didn't exist. LLM produces nonsense → owner overrides with manual ack; flagged for assistant retraining/prompt-tuning if patterns recur.

**Why this preserves the methodology's core principle:**

LLMs at authoring time, not CI time. The triage assistant is between authoring and validation — it compresses human judgment effort by batching and pre-classifying, but every ack is still an explicit human decision recorded as data. The reaction merge-gate remains deterministic: it checks `human_decision`, not `llm_suggestion`.

#### Where the reaction process literally runs

The reaction process has two venues — CI for *enforcement* and local Claude Code session for *resolution* — and these are independent. CI is always on for any project with a registry; resolution is always local-first.

**CI enforcement (always on):**

1. PR opens with a triggering ADR (Class B / Supersession / Withdrawal).
2. CI hook parses the ADR's Invariant Delta block.
3. CI queries reliance graph (via docs-mcp) → list of relying ADRs.
4. CI generates reaction artifacts (one per relying ADR) under `docs/reactions/`.
5. CI runs triage assistant per artifact; writes `llm_suggestion` block.
6. CI commits artifacts back to the PR branch.
7. CI status check `methodology.reaction.gate` fails until every artifact has `human_decision` filled in (or is expired with acceptable disposition).
8. On merge: artifacts persist in main's history; optionally archived to `docs/reactions/archived/` and summarized in the triggering ADR's "Reactions" section.

The artifacts in git (on the PR branch, then in main) are the audit trail — no separate stateful service required.

**Local resolution (always available; no GitHub UI required):**

Every reaction action is a slash command in your Claude Code session. Commands modify the artifact YAML in your working tree, stage for commit; you push and CI revalidates.

| Command | Effect |
|---|---|
| `/list-reactions` | Tabular view of pending reactions with LLM suggestions |
| `/show-reaction <id>` | Full triage suggestion + relying-ADR context for the ambiguous cases |
| `/ack-reaction <id> <ack> [rationale]` | Updates artifact YAML with `human_decision`; stages for commit |
| `/ack-batch --confidence high --action approve` | Bulk-acks all reactions where LLM suggestion is high-confidence; one review for many decisions |
| `/draft-followup <id>` | For ack=update suggestions, generates the follow-up ADR draft locally; you review and commit |
| `/object-reaction <id> <reason>` | Flips state to `objected`; blocks merge until resolved |
| `/migrate-reaction <id>` | (Supersession only) Records explicit reliance migration to successor invariant |

The whole resolution loop stays in your terminal: read the queue, ack what's clear, draft follow-ups for what needs an update, object on what's actually broken. No PR comment threads, no web clicks, no context switch.

**Local-CI parity:**

Same code runs in both venues. Slash commands drive local; CI hook drives enforcement. Idempotent: same triggering ADR + same reliance graph → same reaction artifacts → same triage suggestions. Authors can prep locally before opening the PR; CI re-runs to verify on PR open and on every push.

**What's tunable per-project:** the auto-ack aggressiveness (the tier table above) — projects can choose how trusting of LLM suggestions to be. CI enforcement and merge-gating are not tunable; they're always on for any project with a registry.

**Default for agent-plugins's own bootstrap (Day 1):** registry has ~9 methodology invariants with no internal reliance edges yet, so the reaction process is trivial — most modifications won't trigger any reactions because nothing else relies on the methodology's own invariants yet. Once consumer projects (mclaude first) start citing methodology invariants, reaction artifacts begin appearing.

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

The dashboard is the *visualization, discovery, and async-monitoring* layer; CLI is the *workflow* layer. Both have full write parity — every action you can take in CLI you can take in the dashboard, and vice versa. They modify the same artifact files, so it doesn't matter which venue you use.

**Read views:**

- **Invariants tab** — sortable list with columns: ID, statement, tier, status, mechanism, relied-on count, last audit. Filter by component, tier, status, mechanism. Click → detail view.
- **Invariant detail** — full registry entry, statement, glossary terms (linked), verifier file (linked, with last-modified diff), relied-on-by list (each ADR linked), supersession chain (if applicable), audit history, drift health indicators.
- **Reliance graph view** — force-directed graph rendering of ADR↔invariant↔verifier↔glossary edges. Hover for details, click to navigate.
- **Core candidates panel** — invariants with relied-on count ≥ 2 (one reliance away from auto-core); audit reviewers can promote manually via ADR or wait for the threshold.
- **Drift heatmap** — invariants overlaid with last-audit-status color (green = roundtrip OK, yellow = pending audit, red = drift detected).
- **Tier distribution** — bar chart of invariant counts by tier × component, highlighting components heavy in drafts (potential consolidation targets) vs heavy in actives (mature surfaces).
- **Promotion candidates** — drafts that have met all promotion criteria (survival, utility, surrounding-code stability) but haven't been promoted yet; one-click "draft promotion ADR" action.
- **Reactions queue** — pending reactions across all open PRs, grouped by LLM-suggested ack class (clear re-pins, needs judgment); per-owner filter; deadlines visible.

**Write actions (parity with CLI slash commands):**

Every CLI action has a dashboard equivalent. The dashboard writes the same artifact YAML the CLI writes; CI validates the same way regardless of venue.

| Action | CLI | Dashboard |
|---|---|---|
| List pending reactions | `/list-reactions` | Reactions queue panel |
| View reaction detail | `/show-reaction <id>` | Click reaction in queue → detail pane |
| Ack a reaction | `/ack-reaction <id> <ack> [rationale]` | Detail pane → "Approve / Update / Migrate / Object" buttons |
| Bulk ack high-confidence | `/ack-batch --confidence high --action approve` | Queue panel → "Approve all clear cases" button |
| Draft follow-up ADR | `/draft-followup <id>` | Detail pane → "Draft follow-up" button |
| Object | `/object-reaction <id> <reason>` | Detail pane → "Object" button + reason textbox |
| Migrate reliance | `/migrate-reaction <id>` | Detail pane → "Migrate to successor" button |
| Promote draft → active | (slash command in /plan-feature) | Promotion candidates panel → "Generate promotion ADR" button |

**How dashboard write actions actually commit:**

The dashboard runs in two deployment modes; both produce identical artifact-file outputs.

**Local mode** (single-user, dev workflow — current docs-dashboard architecture):

- Dashboard process runs on developer's machine with access to the local git working tree.
- Action button → backend modifies the artifact YAML in the working tree → runs `git add` + `git commit` with the developer's git identity → optionally `git push` if configured.
- No authentication needed; the dashboard inherits the developer's local git context.
- This is the Day-1 mode for agent-plugins and mclaude.

**Hosted mode** (multi-user, team workflow — deferred to follow-up ADR):

- Dashboard runs as a shared web service (e.g., on a team VM or hosted SaaS).
- Authentication via GitHub OAuth; each user's actions attributed to their GitHub identity.
- Action button → backend uses GitHub API (`PUT /repos/{owner}/{repo}/contents/{path}`) to update the artifact file on the PR branch with the user's identity as committer.
- Commit attribution flows through correctly; merge-gate revalidates against the new state.
- Same artifact format, same CI validation; only the commit mechanism differs.

**Author attribution:**

Whichever venue the action comes from, the artifact YAML records:

```yaml
human_decision:
  ack: re-pin
  rationale: "verifiability still holds"
  acked_by: <git author or GitHub username>
  acked_at: <ISO 8601 timestamp>
  venue: cli | dashboard-local | dashboard-hosted
```

CI doesn't care about `venue`; it only validates that `human_decision.ack` is set. The `venue` field is for audit / observability only.

**Failure modes:**

- Dashboard down or unreachable → CLI continues to work; user falls back to slash commands. No CI dependency on dashboard availability.
- CLI and dashboard race on the same artifact → standard git merge conflict; resolved by user. Last-writer-wins with explicit conflict resolution.
- Dashboard local mode pushed an uncommitted file → dashboard either auto-stashes or refuses the action with a clear error message. (Implementation detail; resolved at codegen time.)

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
| Day-1 bootstrap: register 9 methodology invariants + generate verifiers | ~500-1000 lines spec/test code | 100k | Bulk of the bootstrap; LLM-compiled, human-reviewed |
| context.md extension (dispatch rules) | ~50 lines | 15k | |
| spec-agents.md extension | ~50 lines | 15k | |

**Total estimated tokens**: ~700k-950k
**Estimated wall-clock**: 1-2 weeks for a working v2.0 with Day-1 bootstrap complete and the first consumer (mclaude) able to author ADRs with Invariant Delta blocks against control-plane.

**Phasing**:
1. **Phase 0 (this ADR commit)**: methodology spec docs authored; ADR-0075 accepted.
2. **Phase 1 (1-2 days)**: skill extensions + new skills authored; subagent defined; deterministic scripts written. No invariants registered yet — machinery only.
3. **Phase 2 (2-3 days)**: Day-1 bootstrap. Register the 9 methodology invariants. Verify CI gates green. The framework now verifies itself.
4. **Phase 3 (concurrent with mclaude ADR-0100 finalization)**: First consumer pilot. mclaude-control-plane greenfield migration begins. Real-world stress-test of the methodology.

After Phase 3, this ADR's status flips from `accepted` → `implemented`. Subsequent ADRs (76+) handle: TypeScript bindings, mutation-testing as CI, journey-author subagent.
