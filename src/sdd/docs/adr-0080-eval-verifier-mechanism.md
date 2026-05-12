# ADR: Eval as a Verifier Mechanism (LLM-Behavior Contracts)

**Status**: draft
**Status history**:
- 2026-05-11: draft
- 2026-05-11: draft amended — Layer 2 audit backpressure (dropped `methodology.config.verify_includes_inspect` + `methodology.eval.inspect_gate_aggregates_failure_modes`; introduced `methodology.*` vs `project.*` ID-prefix convention; added `project.config.verify_includes_inspect`, `project.inspect_gate.aggregates_failure_modes`, `project.registry.id_prefix_allowed`; moved `inspect-gate.py` from methodology-shipped to consumer-scoped with `examples/inspect-gate.py` as reference template). Prefix-term definitions use validator-enforces framing (not consumer-inherits-via-registry) — the invariant `project.registry.id_prefix_allowed` is itself project-scoped because the specific allowlist `{methodology, project}` is this repo's organizational choice, not a methodology-wide mandate.

## Overview

Add **eval** as a verifier mechanism in the invariant-driven development taxonomy: a way to register contracts on LLM-driven behavior (skills, agents, methodology processes) where the verifier runs the SUT against canned inputs and scores the outputs using a mix of programmatic scorers (regex, JSON-shape, contains-substring) and LLM-judge scorers (rubric prompt + grade pattern). LLM-judge scorers are non-deterministic by nature; variance is bounded by `epochs` (N samples) + `reducer` (e.g. `at_least_2_of_3`).

**Day-1 framework: Inspect-AI + `inspect_swe`.** Inspect-AI (UK AISI) is the eval framework; `inspect_swe` (Meridian Labs) is the official agent suite that ships `claude_code()` as a first-class Inspect solver (along with `codex_cli()`, `gemini_cli()`, `opencode()`, `mini_swe_agent()`). Evals are authored as native Inspect `@task` Python files using `claude_code()` as the solver with `sandbox="local"` (no containerization Day-1; Inspect supports 7 sandbox types including `local` for direct host execution). The methodology ships NO runner, NO eval format, NO subprocess wrapper. `sdd verify` dispatches eval verifiers to the Inspect CLI via the project's `verify[]` configuration (per ADR-0078's existing pattern for per-mechanism runners). Future eval frameworks (Promptfoo, MLflow, LangFuse) plug in via additional `verify[]` entries and use their own native formats — no methodology-imposed wrapper format, no Go-interface plugin registry.

This is a methodology extension over ADR-0078. The verification taxonomy in 0078 listed: *unit, table, property, architectural-rule, AST, type-system, schema, codegen-completeness, integration, journey*. Eval is the eleventh mechanism — distinct because it's the first whose verifier may invoke an LLM at evaluation time. ADR-0078's "no LLM in recurring CI" was framed as a cost heuristic; this ADR amends that explicitly: LLMs run in CI when the contract is genuinely LLM-judged, with Day-1 cost control coming from Inspect-AI's built-in model-response cache (re-running with identical inputs hits its API cache and pays no LLM tokens). A methodology-side SHA-of-input cache is **deferred** to a follow-up ADR; revisit if the recurring CI cost on unchanged skills proves painful in practice.

## Motivation

ADR-0078 left a gap: skill content (`SKILL.md` text) is not part of the methodology's contract surface. The 31 registered invariants cover registry shape, glossary shape, ADR shape, config shape, CLI behavior — but nothing covers what the skills themselves actually do when invoked. A future authoring session that quietly removes "walk user flows during Q&A" from `/plan-feature/SKILL.md` would fail no verifier.

Two shapes were considered:

1. **Grep-style verifiers on skill text.** Cheap, deterministic, but proves text presence — not LLM behavior. Future LLMs may interpret remaining text differently; the contract is fragile.
2. **Eval-style verifiers on skill behavior.** Run the skill against canned inputs; score outputs against rubric. Real contract on behavior. Cost: LLM tokens per eval run, non-determinism in scoring, framework choice burden.

This ADR commits to shape 2. Shape 1 is rejected on the principle that "verifier is the executable form of the contract" — a grep verifier doesn't operationalize the contract, it spot-checks an artifact correlated with the contract.

The testing surface is **the skill as Claude Code runs it**, not the SKILL.md text as a raw prompt. An invariant like "/plan-feature walks user flows during Q&A" is a claim about what happens when `claude --print "/plan-feature ..."` is invoked, not what an LLM does when fed SKILL.md verbatim. The eval runner shells out to the harness (or its equivalent for non-Claude consumers) and scores the resulting conversation.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mechanism name | `eval` | Matches industry vocabulary (Inspect-AI, Langfuse, Promptfoo, Braintrust all use "eval"). |
| CI vs audit | **CI gate, cache-protected.** Eval-verifiers run via `sdd verify` like all other verifiers. Inspect-AI's built-in model-response cache makes the recurring cost on unchanged-input runs zero (its cache keys on model + messages + epoch + generation config). A methodology-side SHA-of-input cache is deferred — Day-1 relies on Inspect's cache alone. | ADR-0078's "no LLM in CI" was a cost heuristic, not a principle. If a contract is real, it gates merges — otherwise it's advisory, which is the trap invariant-driven dev was built to escape. Inspect's cache + epoch sampling + binary aggregation contain the cost. |
| Framework support model | **Each framework brings its own native format; dispatch via `verify[]` shell commands.** Day-1 framework = Inspect-AI; evals are native Inspect `@task` Python files. Future frameworks (Promptfoo, MLflow, LangFuse) use their own native formats and conventions; each adds a `verify[]` entry pointing to the framework's CLI. The methodology imposes no unified eval schema, no wrapper format, no Go-interface plugin registry. This mirrors ADR-0078's existing taxonomy: each tool brings its native format (`*.go::Func` → `go test`, `*.semgrep.yml` → `semgrep`, `*_eval.py` → `inspect eval-set`). | ADR-0078 explicitly rejected centralizing dispatch into a Go adapter framework. Inventing a methodology-imposed format wrapper for each external framework would re-introduce that adapter problem — the methodology would have to ship and maintain a translator between its synthesized format and each framework's native one. Letting each framework keep its native format eliminates that translation. The methodology ships zero runner code; it ships authored evals (in the chosen frameworks' native formats) and the registry/dispatch wiring. |
| Day-1 framework | **Inspect-AI + `inspect_swe`, `sandbox="local"` default.** Inspect-AI (UK AISI, MIT-licensed) is the framework. `inspect_swe` (Meridian Labs) ships `claude_code()` as a first-class Inspect solver. Evals are authored as `@task`-decorated Python files under `<project>/spec/evals/`, with `solver=claude_code(...)` and `sandbox="local"` (no containerization Day-1). Inspect's built-in `pattern` / `model_graded_qa` / `includes` / `match` scorers cover programmatic + LLM-judge cases. Inspect's `--epochs N` + `--epochs-reducer at_least_n` handle variance. Inspect's model-response cache covers the "don't re-call the API on identical messages" case. | The earlier draft proposed building a custom Go runner Day-1, then writing a custom @solver wrapping `claude --print` (Inspect's docs flagged this as undocumented territory). User rejected both: don't invent a runner, don't invent a subprocess wrapper, when Meridian Labs already ships `inspect_swe.claude_code()` as the documented pattern. Adopting Inspect-AI + `inspect_swe` together removes (a) the ~500-700 LOC methodology-owned runner, (b) the ~30-60 LOC custom subprocess @solver, and (c) the "undocumented territory" caveat. Costs: Python 3.10+ verify-env dependency and `inspect_swe`'s install. NO Docker dep Day-1 — `sandbox="local"` runs on the host directly (Inspect-AI documents this mode explicitly: "Local file system (no sandbox)"). Consumer projects with stricter isolation needs can switch to `sandbox="docker"` per-project. |
| Aggregate-based CI gate | Inspect's `eval_set()` returns `success` = "tasks completed without error," not "every task's aggregate is CORRECT." A project that adopts Inspect needs a thin Python helper that calls `inspect_ai.log.read_eval_log()`, inspects each task's post-reducer aggregate, and exits non-zero if any task's aggregate is INCORRECT (or if a task didn't complete at all). **Methodology ships `examples/inspect-gate.py`** (~50-80 LOC reference template); **consumers that pick Inspect copy it to their own `scripts/inspect-gate.py`** and own it from there. This repo, which dogfoods SDD using Inspect, copies it to `scripts/inspect-gate.py` for its own use. The helper's behavior is asserted by the project-scoped invariant `project.inspect_gate.aggregates_failure_modes` — not a methodology invariant, because the helper is Inspect-specific glue that other validator frameworks (go test, semgrep, Promptfoo) don't need (they gate on score by default). | The earlier draft made the gate helper methodology-shipped and asserted its behavior as a `methodology.*` invariant. Reclassified to consumer-scoped during Layer 2 audit reconciliation: framework-coupling glue belongs in the project that chose the framework, not in the methodology's distribution. The methodology stays framework-neutral; reference template under `examples/` is acceptable (any consumer adopting Inspect needs this glue), but shipping it as a methodology contract over-couples the methodology to one framework. |
| Registry ID-prefix convention (`methodology.*` vs `project.*`) | **Every active entry in *this repo's* registry has an `id` starting with `methodology` or `project`.** `methodology.*` = invariants about SDD's tooling behavior; `sdd verify` enforces the underlying check against every project that runs it (the project's config shape, registry shape, ADR shape, etc.). Methodology invariants live in this repo's registry; they are NOT copied to consumer registries — the validator's hardcoded structural checks carry the enforcement. `project.*` = invariants specific to this repo's local development (framework choices, packaging, dogfooding-specific tooling). Only meaningful when this repo runs `sdd verify` against itself; consumer projects neither carry these in their own registries nor have anything enforce them. Enforced by the project-scoped cross-cutting invariant `project.registry.id_prefix_allowed` (the specific allowlist `{methodology, project}` is this repo's organizational choice — consumers may adopt the *pattern* of splitting tooling-shipped contracts from local hygiene, but the *specific prefixes* are theirs to choose). Glossary adds two new prefix terms. /plan-feature's Q&A gains one structural question per new invariant: "Does this assert something the validator enforces against every SDD-using project, or only something specific to this repo's setup?" — answer drives prefix choice. | The original ADR-0080 draft had everything prefixed `methodology.*`, conflating "what SDD is" with "how this repo is developed." Reclassification of `inspect-gate.py`'s behavior contract to project scope surfaced the first concrete `project.*` candidate. Establishing the distinction now — when the first user appears — beats retrofitting later. The cross-cutting prefix-allowlist invariant is itself project-scoped (not methodology-scoped) because the allowlist names are this repo's choice; a `methodology.*` claim there would wrongly mandate `{methodology, project}` for consumers with their own domain prefixes. |
| `sdd verify` is the single entrypoint | **`sdd verify` runs everything via its existing `verify[]` shell-out mechanism** (ADR-0078). The project's `verify[]` includes one entry that invokes Inspect (e.g. `"inspect eval-set <eval-dir> ; python scripts/inspect-gate.py <log-dir>"` — `;` not `&&` so the gate runs even if Inspect itself exits non-zero, since the gate's failure-mode-1 handler is what reports "Inspect didn't run"). No `sdd eval` subcommand, no eval-specific built-in handling inside `sdd verify`. Local iteration: contributors can comment out the Inspect line in `verify[]` or run `sdd verify --no-shell` (a future flag if needed). | Reverts to ADR-0078's existing "`sdd verify` does structural validation universally; project-specific runners are config-driven shell commands" model. The earlier draft extended `sdd verify` with built-in eval handling because there was no project-native tool to shell to; with Inspect-AI adopted, there IS such a tool, and ADR-0078's existing model applies cleanly. |
| Eval format | **Inspect-AI's native `@task` Python files.** No methodology-imposed YAML or JSON schema. Each eval is one or more Python files defining `@task` functions that return `Task(dataset=..., solver=..., scorer=...)`. The methodology documents conventions (where files live; how to name @task functions to match invariant IDs) but does not define a new format. | The methodology learned from Inspect rather than redesigning around it. Inspect's `@task`/`Task`/scorer/reducer design is the proven shape; adopting it directly removes one layer of indirection (no methodology→Inspect translation). The path extension `_eval.py` (or `*.py` under `<project>/spec/evals/`) is the dispatch carrier. |
| Scorer + variance | **Use Inspect-AI's native vocabulary**: `includes`, `match`, `pattern`, `model_graded_qa`, `model_graded_fact`, `f1`, `exact`, etc. For variance: `inspect eval-set ... --epochs 3 --epochs-reducer at_least_2_of_3`. No methodology-side reimplementation. | Inspect's vocabulary is mature and the right baseline; adopting it preserves Inspect's invariants (scorers compose naturally, epochs are well-tested). The methodology adds zero new scorer types Day-1. |
| Cost discipline (caching) | **Day-1: rely on Inspect-AI's model-response cache** (caches API responses keyed by model + messages + epoch + generation config). A methodology-side SHA-of-input cache is **deferred** to a follow-up ADR if the recurring CI cost on unchanged skills proves painful. Inspect's cache handles the cheap case (re-running with no input changes hits its API cache); methodology cache would only help if Inspect's API cache turns out to be too coarse-grained in practice. | Earlier draft built a SHA cache (composite of harness + skill + eval-yaml + input + model) to ensure unchanged commits never pay LLM tokens. With Inspect-AI adopted, Inspect's own cache already covers most of this — the gap (cache survival across model identity changes, cache shared via git) is real but unproven. Defer the methodology cache until there's a cost incident; don't pre-build infrastructure for a hypothetical problem. |
| LLM-judge model selection | **Inspect-AI's native per-scorer `model=` argument.** Each `model_graded_qa()` call names its judge model (e.g. `model_graded_qa(model="anthropic/claude-sonnet-4-6")`). The project's CI environment selects a default via the `INSPECT_EVAL_MODEL` env var. No methodology-side `eval.judge_model` config block. | Use Inspect's existing mechanism. The earlier `eval.judge_model` config block was a layer of indirection on top of what Inspect already provides; redundant. |
| Concurrency | **Inspect-AI's `--max-tasks` / `--max-samples` / `--max-connections` flags.** Inspect's concurrency model owns parallelism for eval execution. The methodology does not impose a concurrency model. | Inspect already has well-tested parallelism controls; reusing them avoids a parallel concurrency model. |
| Audit chain Layer 2 (statement-↔-verifier) extension | Now also audits **eval rubrics**: `invariant-testing-evaluator` reads the eval Python file (the Inspect `@task` definition + scorers) and reconstructs the invariant statement from the scorers' assertions; diffs against the registered `definition`. Catches drift where the eval no longer tests what its invariant claims. **The LLM-judge `prompt` is treated as the validator** — not as a translation of the definition. `/compile-invariants` authors it; Layer 2 audits it; no separate SHA tracking on the registry, no pre-flight prompt-vs-definition diff. | Treating the prompt as the validator is the right framing: for static verifiers, the test code IS the executable contract — nobody asks for `definition_sha` and `test_code_sha` side by side. The same logic applies to eval prompts. Drift between prompt and definition is exactly the failure Layer 2 was built to catch (under-constraining, over-constraining, non-asserting verifiers); extending it to eval Python files is a natural fit and avoids per-invariant SHA bookkeeping. |
| Audit chain Layer 3 (mutation tester) extension | Mutation tester now also mutates **skill text**: a deliberate edit to SKILL.md that removes the user-flow-walkthrough instruction MUST cause the corresponding eval to fail. Eval that doesn't catch its skill mutation = eval doesn't actually bite. | Mutation testing was previously about verifier code; under invariant-driven dev with eval verifiers, the "code" being mutation-tested is the skill (the SUT). Audit-only; never a CI gate. |
| First consumers | (1) Two skill-behavior contracts: `methodology.plan_feature.user_flow_walkthrough` and `methodology.plan_feature.audit_until_clean`. (2) Four agent-behavior role-boundary contracts surfaced by ADR-0081: `methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}` and `methodology.dev_harness.test_files_not_edited`. (3) One Layer 2 self-audit contract: `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`. (4) Four master-session/subagent role-and-model boundary contracts: `methodology.master_session.{edits_only_contract_surface, delegates_implementation, runs_at_opus_tier, unbiased_subagent_prompts}` + `methodology.subagent.runs_at_sonnet_tier`. All authored as Inspect `@task` Python files under this repo's eval directory (`src/sdd/spec/evals/<name>_eval.py`). | Twelve evals Day-1 validate the mechanism across four consumer surfaces (skills, subagents, audit-chain agents, master-session prompt construction + role/model boundaries) and exercise programmatic, behavioral, and LLM-judge scoring shapes. The role-boundary contracts catch the exact failure modes ADR-0081's authoring revealed; the self-audit eval closes the regress-the-auditor loop; `audit_until_clean` catches the master-session shortcut surfaced during ADR-0082 authoring; `unbiased_subagent_prompts` catches the master-session priming pattern surfaced during this ADR's own design-audit loop; the four role/model boundary contracts capture the methodology's foundational division of labor that `unbiased_subagent_prompts` itself builds on. Other skill disciplines deferred to follow-up ADRs as they emerge. |

## User Flow

Authoring an eval-verified invariant:

1. **`/plan-feature` Q&A** surfaces a contract on LLM behavior (e.g. "/plan-feature must walk user flows during Q&A when given an ADR with a User Flow section").
2. **Add the entry to the ADR's `### Added` block** with `verifier: <project>/spec/evals/<name>_eval.py::<task_function>` (Inspect's native path::function form, mirroring how Go test verifiers reference `*_test.go::TestFunc`).
3. **`/compile-invariants`** invokes `invariant-compiler` subagent. For eval verifiers, the compiler authors an Inspect `@task` Python stub: defines `@task def <task_function>():` returning a `Task(dataset=<canned inputs>, solver=claude_code(skills=[<path to SDD skill>]), scorer=<programmatic + model_graded_qa mix>, sandbox="local")`. The compiler does NOT run Inspect at compile time — only authors the file and confirms `python -c "import <task_module>"` succeeds.
4. **`/feature-change`** implements the skill change. `sdd verify` runs structural checks, then shells out to `verify[]` which invokes `inspect eval-set <project>/spec/evals ; python scripts/inspect-gate.py <eval-log-dir>` (single composed entry). The gate helper reads Inspect's `.eval` logs via `read_eval_log()` and exits non-zero if any eval task has no log (Inspect didn't run), `status != "success"` (Inspect-side failure), or aggregate=INCORRECT (score failure). Three labeled failure modes, one exit code.
5. **Audit run (`/audit-invariants`)** layer 2 reads the eval Python file and reconstructs the invariant statement from the scorers (rubric prompts, programmatic asserts); flags drift. Layer 3 mutates SKILL.md and re-runs Inspect over the impacted evals; an eval that still passes after a mutation that should break it is flagged as not-actually-biting.

## Component Changes

### Inspect-AI + `inspect_swe` adoption (Day-1 framework)

- **Inspect-AI Python package**: added as a project verify-environment dependency (`pip install inspect-ai`). Required Python 3.10+. Setup skill installs it as part of the project's verify-env bootstrap. **(in scope)**
- **`inspect_swe` Python package**: ships `claude_code()` as a first-class Inspect solver. Installed via `pip install git+https://github.com/meridianlabs-ai/inspect_swe`. **(in scope)**
- **Sandbox runtime: `local` by default Day-1.** Inspect-AI supports 7 sandbox types; `claude_code(sandbox="local")` runs Claude Code directly on the host with no containerization required. This is the methodology's Day-1 default — the SDD repo's own evals are testing its own skills, so host-mode is acceptable (same risk model as a developer running `claude` themselves). Setup skill seeds `sandbox="local"` in evals. Consumers needing strict isolation (running evals against untrusted skills or in shared CI) can switch to `sandbox="docker"` per-project; setup skill documents the option. **(in scope; Docker is opt-in)**
- **`examples/inspect-gate.py`**: ~50-80 LOC **reference template shipped under the methodology's `examples/` directory** (not installed into consumers' working trees). Consumers that pick Inspect-AI copy it to their own `scripts/inspect-gate.py` and own it from there — same as any other framework-coupling glue. The template reads Inspect's `.eval` log directory via `inspect_ai.log.read_eval_log()` and aggregates three failure modes into a single non-zero exit:
  1. No logs found → "Inspect didn't run or wrote no logs at `<dir>`."
  2. A task's log shows `status != "success"` (Inspect-side failure: crash, timeout, API error) → "Inspect didn't complete task X (status=error)."
  3. A task completed but its post-reducer aggregate is INCORRECT → "Task X scored INCORRECT for invariant `<id>`."

  Exits zero only when every registered task has `status="success"` AND aggregate=CORRECT. The methodology asserts no contract on the consumer's copy of this script — its behavior is the consumer's concern. **(in scope as a reference template only)**

- **This repo's `scripts/inspect-gate.py`**: this repo dogfoods SDD with Inspect as its eval framework, so it copies `examples/inspect-gate.py` into its own `scripts/` directory and owns it as project code. Behavior asserted by the project-scoped invariant `project.inspect_gate.aggregates_failure_modes` (verifier: `src/sdd/spec/eval_test.go::TestProjectInspectGateAggregatesFailureModes`). A future consumer that picks Promptfoo or another framework would not carry this file or invariant. **(in scope, project-scoped)**
- **Eval task files**: twelve Inspect `@task` Python files for the Day-1 invariants, authored under this repo's eval directory (`src/sdd/spec/evals/` — wherever the project's eval-shaped `verifier:` paths point; the methodology does not prescribe a fixed location). Each authors its `@task` function, dataset (canned inputs), `solver=claude_code(...)` for skill/agent SUTs, and scorers. Programmatic scorers (`git diff`, `go build`, env-var checks, file-content checks, keyword scans) are preferred for contracts with deterministic ground truth; `model_graded_qa` with `pattern(r'^(PASS|FAIL)')` is used only when the contract genuinely requires LLM judgment. **(in scope)**
- **Eval log directory**: project's choice; this repo uses `src/sdd/spec/eval-logs/`, gitignored. Per-run `.eval` files written by Inspect. **(in scope)**

### `sdd verify` integration

- `sdd verify` reuses ADR-0078's existing `verify[]` shell-out mechanism: the project's `verify[]` includes the inspect-then-gate invocation. No new built-in eval handling inside `sdd verify`. No new `sdd verify` flags Day-1. **(in scope)**
- Missing API key (e.g. `ANTHROPIC_API_KEY`) → Inspect reports an error; the gate helper surfaces it as a SKIPPED status with a warning; the `verify[]` shell command exits non-zero (Inspect's own behavior) but the methodology may choose to treat it as informational by wrapping in `|| true` in the verify entry. Documented as a setup convention, not enforced. **(in scope)**
- `sdd verify` reports per-eval pass/fail via the shell command's stdout/stderr stream, just like any other `verify[]` entry. **(in scope)**

### Future framework support

- A future ADR introducing an additional eval framework (Promptfoo, MLflow, LangFuse, Braintrust) adopts that framework's **native** file format and CLI; adds another `verify[]` entry; no methodology-imposed wrapper. Each framework owns its own format, scorer vocabulary, variance handling, and caching. **(out of scope for v1)**

### Invariant Delta block schema extension (glossary tracking)

The ADR Invariant Delta block schema is extended to track glossary changes structurally, parallel to how it already tracks invariant changes. Two new methodology cross-cutting invariants land:

- `methodology.adr.glossary_delta_block` — Invariant Delta blocks may use the explicit sub-section headers `### Added (invariants)`, `### Withdrawn (invariants)`, `### Added (glossary)`, `### Withdrawn (glossary)`. The legacy bare `### Added` / `### Withdrawn` headers used by all ADRs prior to ADR-0080 remain valid (interpreted as the invariants-only equivalents with empty glossary deltas) — no retrofit required.
- `methodology.glossary.delta_reconciles` — the running glossary at `spec.glossary` equals the integral of `### Added (glossary)` minus `### Withdrawn (glossary)` entries across all ADRs. Parallel to `methodology.adr.delta_reconciles` for the registry.

**`/plan-feature` SKILL.md template** (Step 4 — finalize the ADR) gets a new sub-section in the template after the existing `### Added` / `### Withdrawn` block, showing the four explicit headers with stub entry shapes:

```markdown
### Added (invariants)

```yaml
- id: <invariant_id>
  ...
```

### Added (glossary)

```yaml
- term: <glossary_term>
  definition: <one-line definition>
```

### Withdrawn (invariants)

```yaml
- id: <invariant_id>
  reason: ...
```

### Withdrawn (glossary)

```yaml
- term: <glossary_term>
  reason: <terminal removal>
```
```

ADR-0080 itself dogfoods the new schema (its Invariant Delta block uses the four explicit headers and declares two glossary additions for the new prefix terms). Future ADRs that touch the glossary use the same shape; ADRs that don't touch the glossary can continue to use the legacy bare headers.

### Registry ID-prefix convention

This ADR introduces the `methodology.*` vs `project.*` prefix split. Two new glossary terms, one new cross-cutting invariant, one Q&A addition to `/plan-feature`.

- **Glossary additions** (`<project>/spec/glossary.yaml`): two new prefix terms.
  - `methodology` (prefix): used in this repo's registry for invariants that describe SDD's tooling behavior — the contracts `sdd verify` enforces (via its hardcoded structural Go checks) against every project that runs it. Methodology invariants live in this repo's registry; they are NOT copied to consumer registries. Consumer projects are subject to the contracts because they run the validator, not because they import any entries. Test: does the validator's hardcoded structural check apply to artifacts every SDD-using project has (config, ADRs, registry shape, glossary)? Yes → `methodology.*`.
  - `project` (prefix): used in this repo's registry for invariants specific to this repo's local development (framework choices like Inspect-AI, packaging artifacts like `scripts/inspect-gate.py`, dogfooding-specific tooling, `verify[]` content). Only meaningful when this repo runs `sdd verify` against itself; consumer projects neither carry these in their own registries nor have anything enforce them against their projects. Test: is the contract specific to this repo's setup (verify[] content, framework choice, this-repo-only file behavior)? Yes → `project.*`. **(in scope)**
- **Cross-cutting invariant**: `project.registry.id_prefix_allowed` (verifier: `src/sdd/spec/checks_cross_cutting_test.go::TestRegistryIDPrefixAllowed`). Walks *this repo's* registry; asserts every active entry's `id` field begins with `methodology.` or `project.`. ~30 LOC of Go. Project-scoped because the allowlist `{methodology, project}` is this repo's organizational choice — a `methodology.*` claim would wrongly require consumer registries to use the same prefix set (consumers have their own domain prefixes like `myapp.*`, `acme.*`, etc.). **(in scope)**
- **/plan-feature Q&A addition**: during invariant authoring (Step 3), each new invariant gets one structural question: *"Does this assert something the validator enforces against every SDD-using project, or only something specific to this repo's setup?"* — answer drives prefix choice. Added to `src/sdd/skills/plan-feature/SKILL.md`'s Step 3 structural-decisions list. **(in scope)**

The convention applies to existing entries too: every active invariant in the current registry is `methodology.*`-prefixed (they're all about SDD's shipped behavior). Retrofitting requires no renames. The first `project.*` entries are the four introduced by this ADR: `project.registry.id_prefix_allowed`, `project.eval.task_naming_matches_invariant_id`, `project.config.verify_includes_inspect`, `project.inspect_gate.aggregates_failure_modes`. The eight eval-verified behavioral contracts (`methodology.plan_feature.{user_flow_walkthrough, audit_until_clean}`, `methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}`, `methodology.dev_harness.test_files_not_edited`, `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`, `methodology.master_session.unbiased_subagent_prompts`) are `methodology.*` because their subjects (the agents and skills they assert behavior about) ship with SDD and are universal across consumers — the verifier path being a project-specific Inspect-AI Python file is an implementation detail, not a constraint on scope.

### Master-session and subagent role/model boundaries

Five methodology invariants capture the foundational division of labor between the master session and the subagents it spawns. They underpin `methodology.master_session.unbiased_subagent_prompts` (the master session can only meaningfully *bias* a subagent if the methodology already commits to having distinct subagents at all).

- `methodology.master_session.edits_only_contract_surface` — the master session edits only ADR files, registry, glossary, reaction artifacts, and `spec-driven-config.json`. Production code, tests, and interfaces are off-limits to the master session.
- `methodology.master_session.delegates_implementation` — when work outside the contract-surface set is needed, the master session spawns the appropriate subagent (`dev-harness` for production code; `invariant-compiler` for test/interface authoring).
- `methodology.master_session.runs_at_opus_tier` — the master session runs at the highest-capability model tier.
- `methodology.subagent.runs_at_sonnet_tier` — fresh-context subagents run at the mid-capability tier.
- `methodology.master_session.unbiased_subagent_prompts` — the spawn prompt carries neutral evidence only.

All five are methodology-scoped (the SUTs — the master session and the named subagents — ship with SDD and behave universally across consumers; consumers using a different verifier framework would author different verifier files but the contracts are universal). Each has an Inspect `@task` eval verifier; the tier checks use programmatic scorers (env-var / agent-definition file inspection); the role-boundary and prompt-discipline checks use behavioral scorers (commit-diff inspection, spawn-prompt regex/keyword scan).

### Audit chain

- **Layer 2 extension**: `invariant-testing-evaluator` agent prompt extended to handle Inspect `@task` Python files (reconstructs invariant statement from the task's scorers — rubric prompts, programmatic asserts — not just from Go test code). **(in scope)**
- **Layer 3 extension**: `mutation-tester` agent extended to mutate skill text (line-by-line edits to SKILL.md) and re-run Inspect over impacted evals. Audit-only. **(in scope)**

### Skills

- `/compile-invariants` extended to recognize eval verifier paths (`*_eval.py::task_name`) and author Inspect `@task` Python stubs (instead of Go test functions). **(in scope)**
- `/plan-feature/SKILL.md` extended with: (1) the user-flow-walkthrough mandate (the first eval-verified discipline); (2) the prefix-convention question added to Step 3's structural-decisions list ("Does this contract apply to every SDD consumer, or just to this repo's development workflow?"). **(in scope)**
- `setup/SKILL.md` extended to: (1) bootstrap the Python verify-env (`pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set `INSPECT_EVAL_MODEL` default); (2) document the Inspect-adopter path — *"if you choose Inspect-AI as your eval framework, copy `examples/inspect-gate.py` into your project's `scripts/` directory and reference it from your `verify[]`."* No Docker check Day-1 — `sandbox="local"` is the default. **(in scope)**

### Configuration

This repo's `spec-driven-config.json` adds the Inspect invocation to `verify[]` as a single composed shell entry; the gate helper handles both Inspect-side failures and score failures via the eval logs, so a single `;`-separated entry suffices:

```json
{
  "spec": { ... },
  "verify": [
    "cd src/sdd && go test ./spec/...",
    "inspect eval-set src/sdd/spec/evals --log-dir src/sdd/spec/eval-logs --epochs 3 --epochs-reducer at_least_n,2 ; python scripts/inspect-gate.py src/sdd/spec/eval-logs"
  ],
  "dispatch": { }
}
```

The composed entry's exit code is the gate's exit code (last command in `;` wins). The gate's three failure modes (no logs, task `status != "success"`, task aggregate INCORRECT) cover both Inspect-side crashes and score failures — so losing Inspect's exit code via `;` doesn't lose information.

**Wiring is project-owned.** The methodology does NOT enforce that consumer projects' `verify[]` arrays contain any specific shell content — that's project territory, the same way the methodology trusts projects to wire `go test` or `semgrep` in their own `verify[]`. This repo's `verify[]` is asserted by the *project-scoped* `project.config.verify_includes_inspect` (verifier: `src/sdd/spec/checks_config_test.go::TestProjectVerifyIncludesInspect`); a consumer picking Promptfoo would author their own `project.config.*` invariants describing their own wiring, or none if they don't want structural checks on it. The setup skill seeds the template above for new Inspect-adopting consumers; the seeded `verify[]` is starting scaffold, not enforced surface. The `dispatch{}` block remains for external commands per ADR-0078's existing rule.

## Data Model

### Inspect-AI `@task` format (the only format Day-1)

Evals are authored in Inspect-AI's native format with `inspect_swe.claude_code()` as the solver for skill/agent SUTs. The methodology does not redefine the format — see Inspect's own [Tasks](https://inspect.aisi.org.uk/tasks.html) and [Scorers](https://inspect.aisi.org.uk/scorers.html) documentation, plus `inspect_swe`'s [Claude Code](https://meridianlabs-ai.github.io/inspect_swe/claude_code.html) docs.

Day-1 evals follow this skeleton (binary scorers only — see Decision history for why):

```python
# <project>/spec/evals/plan_feature_user_flow_walkthrough_eval.py
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import pattern, model_graded_qa
from inspect_swe import claude_code

@task
def plan_feature_user_flow_walkthrough():
    return Task(
        dataset=[
            Sample(
                input="/plan-feature <canned feature description with a User Flow surface>",
                target="...",   # reference output for scorer comparison if needed
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/plan-feature"],   # mount the skill into the sandbox
        ),
        scorer=[
            model_graded_qa(
                instructions=(
                    "The output below is a /plan-feature Q&A session. "
                    "Did the Q&A include at least one question probing each User Flow "
                    "step for the contract it commits to? "
                    "Answer with: PASS or FAIL, followed by a one-line reason."
                ),
                model="anthropic/claude-sonnet-4-6",
                grade_pattern=r"^(PASS|FAIL)",   # binary: maps to CORRECT/INCORRECT
            ),
        ],
        epochs=3,
        sandbox="local",
    )
```

### Inspect log format

Inspect writes per-run `.eval` logs to whatever directory the project passes as `--log-dir` to `inspect eval-set` (this repo uses `src/sdd/spec/eval-logs/`; consumer projects pick their own). Accessed programmatically via `inspect_ai.log.read_eval_log()`. The methodology does not redefine or wrap this format and does not prescribe a log-directory location.

### Task-to-invariant mapping convention

This repo's convention (enforced by `project.eval.task_naming_matches_invariant_id`) requires the `@task` function name to match the invariant ID's final segments (with `.` → `_`). E.g. invariant `methodology.plan_feature.user_flow_walkthrough` → `@task def plan_feature_user_flow_walkthrough()`. The file basename follows the convention `<task_function>_eval.py`. The directory the file lives in is this repo's choice (`src/sdd/spec/evals/`) — wherever the project's eval-shaped `verifier:` paths point; the methodology does not prescribe a fixed location, and a consumer using a different framework would adopt their framework's own conventions. This naming convention is the only addition this repo makes on top of Inspect-AI's native `@task` design; it lets the gate helper (`scripts/inspect-gate.py`) map Inspect task results back to registered invariants without per-task metadata.

## Error Handling

- **`inspect` CLI not on PATH**: `sdd verify` surfaces the shell exit code; the `verify[]` entry fails. Setup skill includes `which inspect` in its bootstrap check; documented in the project's installation guide.
- **Python verify-env not installed**: same — shell exit code surfaces. Setup skill bootstraps `pip install inspect-ai`.
- **Inspect task module import error**: Inspect itself surfaces the error and exits non-zero. Common cause: an authored `@task` file references an undefined solver or scorer; `/compile-invariants` catches these by attempting `python -c "import <task_module>"` after authoring.
- **LLM API errors (rate limit, auth, network)**: Inspect's own retry / fail logic applies (configurable per-task). Methodology does not override.
- **Gate helper finds no logs**: `scripts/inspect-gate.py` exits non-zero with "no eval logs found" message; indicates Inspect didn't actually run.
- **INCORRECT-aggregate result**: gate helper exits non-zero, names the failing invariant ID, and prints the offending task's per-epoch results (e.g. `[CORRECT, INCORRECT, INCORRECT]`) plus the post-reducer aggregate (`INCORRECT`) so the human reading the CI log can see whether the failure was unanimous, marginal, or flake-shaped.

## Security

- **Inspect logs gitignored**: the project's eval-logs directory (this repo uses `src/sdd/spec/eval-logs/`; consumers pick their own) contains raw model outputs from real runs; may include incidental PII or sensitive context. The setup skill's `.gitignore` template excludes the conventional location; consumers picking a different log directory should ensure it's gitignored.
- **API keys**: Inspect uses standard provider env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.). If the key is absent, Inspect itself fails and the `verify[]` entry exits non-zero. Day-1 behavior is "hard fail with clear error from Inspect"; soft-skip is NOT a methodology-side feature (the methodology defers to Inspect's error reporting). The setup skill documents how to set the key and how to skip evals locally (comment out the inspect line in `verify[]`) for contributors without API access.
- **Sandbox mode**: Day-1 uses `sandbox="local"` — Claude Code runs directly on the host with no containerization. Same risk model as a developer running `claude` themselves. Skill mounts are explicit: `claude_code(skills=[...])`. For stricter isolation (untrusted skills, shared CI runners), consumers switch to `sandbox="docker"` per-eval. The methodology does not enforce a sandbox mode beyond seeding `"local"` as the Day-1 default.

## Impact

- No new code inside `sdd verify`. Methodology ships zero Python code as production — `examples/inspect-gate.py` is a reference template under `examples/`, not installed code. Authored Inspect `@task` files live in this repo's `src/sdd/spec/evals/` (project's own evals dogfooding the mechanism).
- This repo (consumer-of-itself) ships its own `scripts/inspect-gate.py` (copied from `examples/`) and asserts its behavior via the project-scoped `project.inspect_gate.aggregates_failure_modes`.
- Extends `/compile-invariants` (new mechanism: author Inspect `@task` Python stubs). Extends `/audit-invariants` (Layer 2 + 3 work on Python files). Extends `/plan-feature` (first eval-verified discipline + prefix-convention Q&A). Extends `setup/SKILL.md` (Python verify-env bootstrap + Inspect-adopter copy-the-template documentation).
- Introduces the `methodology.*` vs `project.*` ID-prefix convention across *this repo's* registry. One new project-scoped cross-cutting invariant (`project.registry.id_prefix_allowed`) enforces it — project-scoped because the specific allowlist `{methodology, project}` is this repo's organizational choice (consumers may adopt the pattern but pick their own prefixes). Two new glossary terms (`methodology` prefix, `project` prefix) define the split using validator-enforces framing. No retrofits required — every existing entry is already `methodology.*`.
- Adds Python 3.10+ as a project verify-env dependency (for projects that adopt Inspect). Adds `inspect-ai` and `inspect_swe` to the project's Python deps.
- ADR-0079's parking lot loses one item ("evals as audit ritual extension") since it's now scoped to this ADR.
- ADR-0078's "no LLM in CI" promise is explicitly amended (see Decision history). ADR-0078's "config-driven shell commands" model is preserved as-is — Inspect-AI is just another `verify[]` entry that the consuming project owns.

## Scope

**In v1:**
- `eval` as a registered verifier mechanism, with Inspect-AI + `inspect_swe` as the Day-1 framework stack. Verifier paths follow Inspect's native form: `<eval-dir>/<name>_eval.py::<task_function>` where `<eval-dir>` is the consumer project's choice (this repo uses `src/sdd/spec/evals/`).
- Twelve first evals authored as Inspect `@task` Python files using `inspect_swe.claude_code()` as the solver: two skill-behavior contracts (`methodology.plan_feature.user_flow_walkthrough`, `methodology.plan_feature.audit_until_clean`), four agent-behavior role-boundary contracts (`methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}`, `methodology.dev_harness.test_files_not_edited`), one Layer 2 self-audit contract (`methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`), and five master-session/subagent role/model boundary contracts (`methodology.master_session.{edits_only_contract_surface, delegates_implementation, runs_at_opus_tier, unbiased_subagent_prompts}`, `methodology.subagent.runs_at_sonnet_tier`).
- All Day-1 evals use binary scorers — programmatic scorers for contracts with deterministic ground truth (`git diff`, `go build` exit code, file existence), and `model_graded_qa` with `pattern(r'^(PASS|FAIL)')` only for contracts that genuinely require qualitative LLM judgment (Q&A content, rubric assessments). Each task aggregate is CORRECT or INCORRECT — no per-eval threshold concept (Inspect doesn't define one).
- `methodology.*` vs `project.*` ID-prefix convention introduced for this repo's registry. One new project-scoped cross-cutting invariant (`project.registry.id_prefix_allowed`) enforces it (project-scoped because the specific allowlist is this repo's organizational choice — consumers pick their own). Two new glossary terms define the split using validator-enforces framing (methodology invariants live in this repo's registry; the validator enforces them via hardcoded structural checks against every project that runs it). /plan-feature's Step 3 grows one structural Q&A question per new invariant.
- `examples/inspect-gate.py`: ~50-80 LOC reference template shipped by the methodology under `examples/` — NOT installed into consumers' working trees. Consumers that adopt Inspect copy it to their own `scripts/` and own it from there. This repo's copy lives at `scripts/inspect-gate.py` and is asserted by `project.inspect_gate.aggregates_failure_modes`.
- No methodology-shipped Python code beyond the `examples/` template. Skill/agent SUTs use `inspect_swe.claude_code()` directly.
- `/compile-invariants` extended to author Inspect `@task` Python stubs using `inspect_swe.claude_code()` (alongside Go test functions). When a contract has deterministic ground truth, the authored scorer is programmatic (not `model_graded_qa`).
- `/audit-invariants` Layer 2 + 3 extensions adapted to read Inspect `@task` files and `.eval` logs.
- `setup/SKILL.md` extended to bootstrap the Python verify-env (`pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set `INSPECT_EVAL_MODEL`) and document the Inspect-adopter template-copy path. No Docker dependency Day-1 — `sandbox="local"` runs Claude Code directly on the host.

**Deferred:**
- Additional eval frameworks (Promptfoo, MLflow, LangFuse, Braintrust) as alternative runners under their own native formats and `verify[]` entries.
- Methodology-side SHA-of-input cache (composite of harness + skill + eval-yaml + input + model). Day-1 relies on Inspect's model-response cache. Revisit if recurring CI cost on unchanged skills is painful.
- Process evals beyond the role-boundary ones (e.g. /feature-change end-to-end behavior, /plan-feature end-to-end coherence).
- Dashboard surfacing of eval-run history.
- Per-eval token budget enforcement.
- Selective per-eval invocation via `sdd run <invariant-id>` (deferred since `sdd run` itself is deferred in ADR-0078).
- Cross-model evals (run the same eval against multiple models, compare).
- Documented failure-triage discipline. Day-1 priority is making the signal correct; how a human distinguishes skill-regression vs rubric-bug vs harness-drift vs model-regression vs flake is left to ad-hoc judgment until eval surface is large enough to expose the gap.
- CLI-flag hardening for missing API keys, eval-skipping, cache-bust, cache-bypass. Day-1 relies on commenting out the inspect line in `verify[]` and Inspect's own flags (`--max-tasks`, `--epochs`, etc.).

## Invariant Delta

This ADR uses the explicit `### Added (invariants)` / `### Withdrawn (invariants)` / `### Added (glossary)` / `### Withdrawn (glossary)` sub-section headers introduced by the new methodology invariant `methodology.adr.glossary_delta_block` below — so the ADR dogfoods the same schema extension it registers. ADRs predating this schema continue to use the legacy bare `### Added` / `### Withdrawn` headers, interpreted as `### Added (invariants)` / `### Withdrawn (invariants)` with no glossary changes.

### Added (invariants)

```yaml
# Methodology cross-cutting invariants extending the Invariant Delta block
# schema to track glossary changes alongside invariant changes. The legacy
# bare `### Added` / `### Withdrawn` headers (used by all ADRs prior to
# ADR-0080) remain valid — interpreted as `### Added (invariants)` /
# `### Withdrawn (invariants)` with no glossary changes. ADR-0080 is the
# first ADR to use the explicit headers AND to declare glossary additions.

- id: methodology.adr.glossary_delta_block
  definition: An ADR's `## Invariant Delta` block may use the explicit sub-section headers `### Added (invariants)`, `### Withdrawn (invariants)`, `### Added (glossary)`, `### Withdrawn (glossary)` so that registry-side and glossary-side contract changes are both structurally declared. Any of these may be empty. The legacy bare `### Added` / `### Withdrawn` headers (used by ADRs prior to ADR-0080) remain valid and are interpreted as `### Added (invariants)` / `### Withdrawn (invariants)` with empty glossary deltas.
  verifier: src/sdd/spec/checks_adr_delta_test.go::TestGlossaryDeltaBlock
  requires:
    - methodology.adr.requires_delta
  glossary_terms: []
  status: active

- id: methodology.glossary.delta_reconciles
  definition: The running glossary at the configured `spec.glossary` path equals the integral of (Added - Withdrawn) glossary entries declared in ADR delta blocks under `### Added (glossary)` and `### Withdrawn (glossary)`. Parallel to `methodology.adr.delta_reconciles` for the registry. ADRs predating the schema extension contribute zero glossary deltas (legacy headers = no glossary changes).
  verifier: src/sdd/spec/checks_cross_cutting_test.go::TestGlossaryDeltaReconciles
  requires:
    - methodology.adr.glossary_delta_block
    - methodology.validator.config_spec_glossary
  glossary_terms: []
  status: active

- id: methodology.registry.methodology_self_contained
  definition: Every active registry entry whose `id` field starts with `methodology.` has a `requires:` list containing only IDs that also start with `methodology.`. The contract is a self-referential property of the methodology prefix: methodology entries are self-contained and don't depend on anything outside their own prefix. The rule is unaware of what other prefixes (if any) the registry contains — it makes no claim about non-methodology entries' requires lists, only about methodology entries' own behavior. (For this repo specifically, the registry also contains `project.*` entries; that's this repo's organizational choice, captured by `project.registry.id_prefix_allowed` — but the methodology contract above neither asserts nor depends on that fact.)
  verifier: src/sdd/spec/checks_cross_cutting_test.go::TestMethodologySelfContained
  requires: []
  glossary_terms:
    - methodology (prefix)
  status: active

# Project-scoped cross-cutting invariant introducing the `methodology.*` vs
# `project.*` ID-prefix convention. The convention itself is documented in
# the methodology (Component Changes / Decisions); this specific allowlist
# is THIS repo's organizational choice — a consumer adopting SDD with their
# own domain prefixes (`myapp.*`, `acme.*`) wouldn't carry this entry.

# Project-scoped because the specific allowlist {methodology, project} is this
# repo's organizational choice. A consumer using SDD with domain prefixes
# (`myapp.*`, `acme.*`) would author their own equivalent prefix-allowlist
# invariant against their own scope split.

- id: project.registry.id_prefix_allowed
  definition: Every active entry in this repo's `src/sdd/spec/registry.yaml` has an `id` field that begins with `methodology.` or `project.`. (The semantics of the two prefixes are defined by the glossary terms `methodology (prefix)` and `project (prefix)`.)
  verifier: src/sdd/spec/checks_cross_cutting_test.go::TestRegistryIDPrefixAllowed
  requires:
    - methodology.validator.config_spec_registry
  glossary_terms:
    - methodology (prefix)
    - project (prefix)
  status: active

# Project-scoped because the convention is Inspect-AI specific: `*_eval.py`
# filenames and the `@task` decorator are Inspect's surface. A consumer using
# Promptfoo (YAML with `tests:` arrays), Braintrust (TS files with `eval()`
# functions), or another framework would author their own equivalent
# project.eval.task_naming_matches_invariant_id against their conventions.

- id: project.eval.task_naming_matches_invariant_id
  definition: Every Python module under this repo's eval directory matching `*_eval.py` exports an `inspect_ai.task`-decorated function whose name matches the suffix of an active registry entry's invariant_id (with `.` replaced by `_`); the file basename also follows the convention `<task_function>_eval.py`.
  verifier: src/sdd/spec/eval_test.go::TestEvalTaskNamingMatchesInvariantID
  requires:
    - methodology.validator.config_spec_registry
    - project.registry.id_prefix_allowed
    - project.config.verify_includes_inspect
  glossary_terms: []
  status: active

- id: methodology.plan_feature.user_flow_walkthrough
  definition: The /plan-feature skill, when given an ADR draft with a User Flow section, generates Q&A probing each flow step for the contract it commits to.
  verifier: src/sdd/spec/evals/plan_feature_user_flow_walkthrough_eval.py::plan_feature_user_flow_walkthrough
  requires: []
  glossary_terms: []
  status: active

- id: methodology.plan_feature.audit_until_clean
  definition: The /plan-feature skill, when running the design audit step, re-invokes the decision-invariant-evaluator after each round of fixes (factual or design-decision) and does not commit the ADR to status `accepted` until the evaluator returns CLEAN. Findings labeled "non-blocking," "cosmetic," or "minor" by the evaluator do not authorize skipping the re-audit — only a CLEAN verdict authorizes the commit.
  verifier: src/sdd/spec/evals/plan_feature_audit_until_clean_eval.py::plan_feature_audit_until_clean
  requires: []
  glossary_terms: []
  status: active

- id: methodology.invariant_testing_evaluator.flags_under_constraining_verifiers
  definition: The invariant-testing-evaluator agent, when given an eval whose scorers fail to fully express the registered invariant's definition (e.g. scorer pass-by-default, scorer omitting a clause of the contract), produces a Layer 2 audit finding that identifies the under-constraining scorer and the missing clause.
  verifier: src/sdd/spec/evals/invariant_testing_evaluator_flags_under_constraining_verifiers_eval.py::invariant_testing_evaluator_flags_under_constraining_verifiers
  requires: []
  glossary_terms: []
  status: active

# Role-boundary contracts: agent-behavior invariants on invariant-compiler and
# dev-harness. Surfaced during ADR-0081 authoring (validator-single-source);
# they're behavioral claims about the agents, not data-shape claims, so they
# need eval verifiers (not static AST scans). Registered here because ADR-0080
# is the eval-as-verifier-mechanism ADR.

- id: methodology.compile_invariants.file_scope
  definition: The invariant-compiler subagent, when given an ADR with an Invariant Delta block, produces a commit whose diff touches only `*_test.go`, `*_interface.go`, and the project's registry/glossary YAML files (no `.go` files outside test/interface, no edits to existing production code or production config).
  verifier: src/sdd/spec/evals/compile_invariants_file_scope_eval.py::compile_invariants_file_scope
  requires: []
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.no_test_scaffolding
  definition: The invariant-compiler subagent does not define ad-hoc Validator implementations (noopValidator, stubValidator, fake concrete types) in `_test.go` files. Tests reference dev-harness-owned constructors (e.g. `newValidator()`) directly; those references stay undefined until dev-harness lands.
  verifier: src/sdd/spec/evals/compile_invariants_no_test_scaffolding_eval.py::compile_invariants_no_test_scaffolding
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.references_undefined_symbols
  definition: The invariant-compiler subagent's output, for foundational ADRs that introduce new types, leaves the build red — test files reference at least one symbol (constructor, type, function) that dev-harness will create. The red build is the dispatch mechanism to dev-harness.
  verifier: src/sdd/spec/evals/compile_invariants_references_undefined_symbols_eval.py::compile_invariants_references_undefined_symbols
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.dev_harness.test_files_not_edited
  definition: The dev-harness subagent, when given a failing build and a list of failing verifiers, produces a commit whose diff does not modify any `_test.go` or `_interface.go` file. Tests are immutable to dev-harness; if a test needs to change, the fix routes through /plan-feature → /compile-invariants.
  verifier: src/sdd/spec/evals/dev_harness_test_files_not_edited_eval.py::dev_harness_test_files_not_edited
  requires: []
  glossary_terms: []
  status: active

# Master-session and subagent role/model boundaries. These are the foundational
# methodology contracts on the master/subagent division of labor in any SDD-using
# project. The prompt-discipline contract (`unbiased_subagent_prompts`) builds on
# them: spawn-bias matters because subagents ARE fresh-context, lower-tier, and
# narrowly delegated — properties that are themselves contracts here.

- id: methodology.master_session.edits_only_contract_surface
  definition: The master session edits only contract-surface artifacts — ADR files under the configured `spec.adr_dir`, the registry file at `spec.registry`, the glossary file at `spec.glossary`, reaction artifacts under `spec.reactions_dir`, and `spec-driven-config.json` itself. The master session does NOT directly edit production code, test files (`*_test.go`, `*_eval.py`, etc.), interface files, or unrelated project config. Production code changes flow through dev-harness via `/feature-change`; verifier (test/interface) authoring flows through invariant-compiler via `/compile-invariants`.
  verifier: src/sdd/spec/evals/master_session_edits_only_contract_surface_eval.py::master_session_edits_only_contract_surface
  requires: []
  glossary_terms: []
  status: active

- id: methodology.master_session.delegates_implementation
  definition: When the master session encounters work requiring edits outside the contract-surface artifact set (e.g. production code, test files, interface files), it spawns the appropriate subagent rather than performing the edit itself — dev-harness for production code (via `/feature-change`), invariant-compiler for test/interface authoring (via `/compile-invariants`). The master session's role is orchestration and contract-surface authoring; implementation is delegated.
  verifier: src/sdd/spec/evals/master_session_delegates_implementation_eval.py::master_session_delegates_implementation
  requires:
    - methodology.master_session.edits_only_contract_surface
  glossary_terms: []
  status: active

- id: methodology.master_session.runs_at_opus_tier
  definition: The master session — the persistent Claude Code session that orchestrates ADR authoring, audit loops, and subagent spawning — runs at the highest-capability Anthropic model tier (Opus).
  verifier: src/sdd/spec/evals/master_session_runs_at_opus_tier_eval.py::master_session_runs_at_opus_tier
  requires: []
  glossary_terms: []
  status: active

- id: methodology.subagent.runs_at_sonnet_tier
  definition: Every fresh-context subagent spawned by the master session (decision-invariant-evaluator, invariant-testing-evaluator, invariant-compiler, dev-harness, design-evaluator, mutation-tester) runs at the mid-capability Anthropic model tier (Sonnet).
  verifier: src/sdd/spec/evals/subagent_runs_at_sonnet_tier_eval.py::subagent_runs_at_sonnet_tier
  requires: []
  glossary_terms: []
  status: active

- id: methodology.master_session.unbiased_subagent_prompts
  definition: When the master session spawns a fresh-context subagent, the spawn prompt contains only neutral evidence (file paths, gap descriptions, what was changed, what to check) without language that presupposes or pre-reveals the expected verdict. Forbidden patterns include: asserting prior findings are "resolved" / "fixed" / "addressed" before the evaluator confirms; phrasings like "verify the fixes", "confirm CLEAN", "it's almost CLEAN", "all should pass now"; describing changes in a way that implies the evaluator should approve them; quoting the desired verdict in the prompt. The subagent receives observations, not conclusions.
  verifier: src/sdd/spec/evals/master_session_unbiased_subagent_prompts_eval.py::master_session_unbiased_subagent_prompts
  requires:
    - methodology.master_session.delegates_implementation
    - methodology.subagent.runs_at_sonnet_tier
  glossary_terms: []
  status: active

# Project-scoped invariants: contracts on how *this specific repo* develops
# SDD. The methodology does not ship these to consumers; a consumer that
# picks Promptfoo instead of Inspect, or wires its CI differently, doesn't
# inherit either of these. They live here because ADR-0080 is the first ADR
# that surfaces concrete project-scoped contracts.

# Project-scoped because this repo chose Inspect-AI as its eval framework; a
# consumer picking Promptfoo or another framework would not carry this contract
# (they'd have their own equivalent describing their own verify[] wiring).

- id: project.config.verify_includes_inspect
  definition: This repo's `spec-driven-config.json` `verify[]` array contains an entry that invokes `inspect eval-set` over the project's eval directory followed by `python scripts/inspect-gate.py` over the resulting log directory (within the same shell entry separated by `;`, or as two consecutive entries). The `--log-dir` flag passed to `inspect eval-set` equals the path argument to `inspect-gate.py`.
  verifier: src/sdd/spec/checks_config_test.go::TestProjectVerifyIncludesInspect
  requires:
    - methodology.validator.config_verify_array_well_formed
    - project.registry.id_prefix_allowed
  glossary_terms: []
  status: active

# Project-scoped because the gate helper is Inspect-specific glue: other
# validator frameworks (go test, pytest, semgrep, Promptfoo, Braintrust) gate
# on score by default and don't need an equivalent. The gap exists because
# Inspect's eval-set returns success=tasks-completed-without-crashing rather
# than success=tasks-passed.

- id: project.inspect_gate.aggregates_failure_modes
  definition: This repo's `scripts/inspect-gate.py`, given an Inspect log directory, exits non-zero in three cases (with a labeled message naming the failing invariant_id where applicable): (1) the log directory contains zero `.eval` files (Inspect didn't run); (2) any task's log has `status != "success"` (Inspect-side failure: crash, timeout, API error); (3) any task's post-reducer aggregate is INCORRECT. Exits zero only when every registered task has `status="success"` AND aggregate=CORRECT.
  verifier: src/sdd/spec/eval_test.go::TestProjectInspectGateAggregatesFailureModes
  requires:
    - project.config.verify_includes_inspect
  glossary_terms: []
  status: active
```

### Added (glossary)

```yaml
- term: methodology (prefix)
  definition: Used as the first segment of an invariant_id in this repo's `src/sdd/spec/registry.yaml` to mark invariants describing SDD's tooling behavior — the contracts `sdd verify` enforces (via hardcoded structural Go checks) against every project that runs it. Methodology invariants live in this repo's registry; they are NOT copied to consumer registries. The enforcement on consumers happens because consumers run the validator, which carries the structural checks.

- term: project (prefix)
  definition: Used as the first segment of an invariant_id in this repo's `src/sdd/spec/registry.yaml` to mark invariants specific to this repo's local development — framework choices (e.g. Inspect-AI), packaging artifacts (e.g. `scripts/inspect-gate.py`), dogfooding-specific tooling, this repo's `verify[]` content. Only meaningful when this repo runs `sdd verify` against itself. Consumer projects neither carry these in their own registries nor have anything enforce them against their projects.
```

### Withdrawn (invariants)

(none)

### Withdrawn (glossary)

(none)

## Decision history (rationale notes)

**Why eval as a mechanism, not a special-case audit layer.** Could have been framed as "Layer 2.5 of the audit chain" with no taxonomy expansion. Picked mechanism status because: (a) it generalizes — agent evals, process evals, journey evals all fit the same shape (canned input → LLM output → scorer); (b) it makes registry surface uniform — `verifier:` field always means "the file at this path is the executable form of the contract," whatever its dispatch is; (c) it future-proofs — when consumers add their own eval verifiers, they don't need a separate registration path.

**Why CI gate, not audit-time only.** Initial draft proposed audit-time only, citing ADR-0078's "no LLM in CI" promise. User pushback: that promise was a cost-driven heuristic, not a principle. If a contract is real, it gates merges — otherwise it's advisory, which is the trap invariant-driven dev was built to escape. Cost is bounded Day-1 by Inspect-AI's built-in model-response cache (runs with unchanged inputs hit the cache and pay zero tokens), epoch limits (default 3 samples), and reducer thresholds (default `at_least_2_of_3`). A methodology-side SHA-of-input cache is deferred to a follow-up ADR — revisit if Inspect's cache proves insufficient. ADR-0078's "no LLM in CI" is amended: LLMs run in CI when the contract is genuinely LLM-judged.

**Why Inspect-AI + `inspect_swe` Day-1, not a custom runner or wrapper.** Multiple intermediate drafts proposed building methodology-owned infrastructure: first a custom Go runner (`sdd eval` subcommand, then "in-tree-go runner inside `sdd verify`"); then a custom Python `@solver` wrapping `claude --print` since Inspect-AI doesn't document subprocess SUTs. User rejected each invention: "implement inspect-ai day 1. don't make some shit up" — and later pointed at `meridianlabs-ai/inspect_swe` which ships `claude_code()` as a first-class Inspect solver. Adopting both Inspect-AI and `inspect_swe` together removes ALL methodology-owned eval infrastructure except the gate helper: no runner code, no eval format, no subprocess solver, no Go-interface plugin registry. Costs: Python 3.10+ verify-env, `inspect_swe` install. NO Docker dependency Day-1 — Inspect-AI's `sandbox="local"` runs Claude Code directly on the host (one of Inspect's 7 documented sandbox types). Consumer projects needing stricter isolation can switch to `sandbox="docker"` or another containerized mode per-project. Future ADRs can add additional frameworks (Promptfoo, MLflow, LangFuse, Braintrust) — each via its own native format and `verify[]` entry.

**Why Inspect's native `@task` format, not a methodology YAML.** Intermediate drafts proposed a methodology-owned `*.eval.yaml` schema. User rejected: each framework brings its own native format. Inspect's `@task`-decorated Python is what Inspect users author; the methodology adopts that directly. Yes, this couples Day-1 evals to Python and to Inspect's type system — but only for evals authored in Inspect. Future framework additions don't inherit this coupling because each framework brings its own format. Inventing a methodology-wide YAML wrapper would force translation layers and re-introduce the adapter framework ADR-0078 vetoed.

**Why testing surface = "skill running inside `claude_code()`," `sandbox="local"`, not raw `messages.create()`.** A skill's behavior depends on the harness (Claude Code's tool use, subagents, hooks, model selection). Testing the skill against a raw API call doesn't validate what consumers actually run. `inspect_swe.claude_code(skills=[...])` runs Claude Code with the skill mounted — closer to real consumer behavior, and documented/maintained by Meridian Labs. Day-1 default is `sandbox="local"` (no containerization): the methodology's own evals test its own skills, so host-mode access is the same risk model as a developer running `claude` themselves. Stricter isolation (`sandbox="docker"`) is a per-project opt-in for environments where the SUT isn't trusted.

**Why defer the methodology-side SHA cache.** Earlier drafts treated a composite-SHA cache (harness + skill + eval-yaml + input + model) as load-bearing for cost control. With Inspect-AI adopted, Inspect's own model-response cache already covers the cheap case (re-running with no input changes hits Inspect's API cache). The gap (cache survival across model identity changes, cache shared via git across CI/local) is real but unproven — defer until there's a cost incident. Don't pre-build infrastructure for a hypothetical problem.

**Why mutation-tester extension into skill text, not just verifier code.** Under invariant-driven dev with eval verifiers, the "code" being checked is the SUT — for skill invariants, that's SKILL.md. Mutating verifier code (`go-mutesting` on `*_test.go`) was Layer 3's original job. Mutating SKILL.md is the natural extension when the verifier is an eval: a deliberate removal of "walk user flows during Q&A" from SKILL.md must cause the corresponding eval to fail. If it doesn't, the eval doesn't actually bite — same diagnostic as a static verifier that doesn't catch a mutation.

**Why role-boundary contracts on invariant-compiler and dev-harness belong in this ADR (not ADR-0081 or ADR-0078).** During ADR-0081's authoring, four role-boundary rules emerged: invariant-compiler authors only `_test.go` and `_interface.go` files; doesn't define test scaffolding; leaves the build red for foundational ADRs; dev-harness never edits test or interface files. These are *behavioral* claims about agents — "the subagent, given canned input X, produces output Y" — not static claims about data or files. Static verifiers can't enforce them: agents are LLMs, output varies per invocation, deterministic check on a single commit doesn't capture the policy. Only an eval verifier — run the agent against canned inputs and score the output's conformance — can register these as real contracts. So they wait for this ADR's eval mechanism to land. Without that mechanism they're prompt-level discipline (which failed twice during ADR-0081's authoring: I gave invariant-compiler the wrong rules in two consecutive dispatches, and only the user catching it kept the contract honest). Registering them as eval-verified invariants mechanically enforces what discipline alone misses.

**Why register four separate invariants rather than one umbrella "agents follow their role boundaries."** Each rule's failure mode is distinct: file-scope violations look like a `.go` file edit in an invariant-compiler commit; scaffolding violations look like a `noopValidator` type definition in `_test.go`; undefined-symbol violations look like a commit that adds production-side stubs to make build pass; dev-harness test-edit violations look like a `*_test.go` change in a dev-harness commit. Per ADR-0078's independence rule, each is a separate claim because each can fail independently (and each has its own eval rubric). Lumping them into "agents follow boundaries" would conflate the signal — when the umbrella eval fails, you can't tell which boundary leaked.

**Why `methodology.plan_feature.audit_until_clean` belongs here, not in ADR-0081 or ADR-0082.** Surfaced during ADR-0082 authoring: I (the master session) committed an ADR to status `accepted` when the design audit had returned "PASS with two minor findings (not CLEAN)" — substituting my own judgment that the findings were "non-blocking" for the methodology's structural rule (re-audit until CLEAN). User caught it. The failure mode is behavioral: a *master session's* shortcut of the audit-CLEAN loop, not a static violation of file structure or registry shape. Like the four role-boundary contracts above, the rule can't be enforced by AST scans or commit-diff checks because it's about WHEN the master session commits relative to WHAT the evaluator returned — that requires running the master session against a fixture where the audit returns PASS-but-not-CLEAN and scoring whether it re-runs the audit or commits prematurely. Eval-shaped, registered here.

**Why per-eval declarable judge model — using Inspect's native mechanism.** Each Inspect `model_graded_qa()` call names its judge model via the `model=` argument; the project's CI environment selects a default via `INSPECT_EVAL_MODEL`. No methodology-side `eval.judge_model` config block. Earlier drafts added one; the Inspect-AI adoption made it redundant. The authoring guidance still applies: when an eval is adversarial against an agent (e.g. role-boundary contracts on invariant-compiler), the judge should differ from the harness — but the mechanism for declaring it is Inspect's, not the methodology's.

**Why defer documented failure-triage discipline.** Real concern, deferred deliberately. Triage rules (whether structured `triage_hints` fields in result JSON or a documented flowchart for skill-vs-rubric-vs-harness-vs-model-vs-flake attribution) only earn their keep when the eval surface is large enough that humans triage often and inconsistently. Day-1 has 12 evals; ad-hoc judgment costs almost nothing. Priority Day-1 is "the signal is correct" (the cache, the reducer, the build dispatch all work) over "the failure is explainable." Revisit when eval count crosses ~20 or when the first false-attribution incident lands.

**Why concurrency uses Inspect's native flags.** Initial draft treated eval execution as having its own concurrency story (rate limiter, `eval_concurrency` config knob, possibly its own invariant). With Inspect-AI adopted, Inspect's `--max-tasks` / `--max-samples` / `--max-connections` flags own parallelism for eval execution. The methodology imposes no concurrency model; the project's `verify[]` entry passes whatever Inspect flags the team picks. No concurrency invariant in this ADR.

**Why the LLM-judge prompt is the validator, not a translation of the definition.** Considered tracking `definition_sha` and `prompt_sha` per registry entry so `sdd verify` could catch drift on every CI run, not just audit runs. User reframed: the prompt is the executable form of the contract, the same way test code is the executable form for static verifiers. Nobody asks for `definition_sha + test_code_sha` side by side; the test code IS what the contract asserts. Same with the LLM-judge prompt — it doesn't *derive from* the definition, it *operationalizes* it. Drift between them is a Layer 2 audit failure, exactly the failure mode `invariant-testing-evaluator` was built to catch. No registry schema change; no pre-flight check. The author writes the prompt, `/compile-invariants` may scaffold the stub, Layer 2 audits the round-trip.

**Why no Go-interface plugin registry, no `framework:` field, no methodology-imposed format wrapper, no methodology-owned runner.** Multiple intermediate drafts hit this rake. First attempt: a Go `EvalRunner` interface + package-level init() registry, with a `framework:` field in the YAML to pick the runner — violated ADR-0078's existing rule against Go adapter frameworks. Second attempt: different path extensions per framework (e.g. `*.inspect-eval.yaml`) with the methodology's own YAML wrapper format — re-introduced the adapter framework via format translation. Third attempt: in-tree-go runner with `*.eval.yaml` (the format we own), built into `sdd verify`, with multi-framework future via additional path extensions — still proposed building a runner where a real one exists. User pushback at every stage. The final landing: adopt Inspect-AI Day-1, use its native format, contribute zero runner code, address Inspect's gaps with minimal Inspect-API-driven helpers. Multi-framework future = additional `verify[]` entries pointing to other frameworks' CLIs (Promptfoo, MLflow, etc.) — each framework keeps its native format and conventions.

**Why eval execution stays inside `verify[]`, not built into `sdd verify`.** Earlier draft argued for built-in eval handling inside `sdd verify` because "there's no project-native runner — the methodology has to ship one." With Inspect-AI adopted, the project DOES have a native runner (`inspect eval-set`). Adding it to `verify[]` reuses ADR-0078's existing model without amendment. The earlier "deliberate amendment to ADR-0078's structural-validation-only framing" was a workaround for not having Inspect; once Inspect is adopted, the amendment is unnecessary. `sdd verify` continues to do only structural validation and shell-out to `verify[]`, as ADR-0078 originally specified.

**Why API-key absence defers to Inspect's own error reporting.** Earlier draft proposed methodology-side soft-skip-with-warning logic (eval marked SKIPPED, structural checks still run, etc.), then a CI-hardening `--require-evals` flag. Both became unnecessary with Inspect-AI adopted: Inspect itself fails fast and clearly when its provider env vars are missing, and the `verify[]` shell-out surfaces Inspect's exit code. Contributors without API access can comment out the inspect line in `verify[]` (or wrap it in `|| true` for informational use); no methodology-side flag plumbing required. The earlier residual-risk concern (CI loses key, soft-skips, accidentally green-lights) doesn't apply when Inspect hard-fails by default.

**Why add the Layer 2 self-audit eval (`methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`).** The audit chain Layer 2 catches verifier-vs-definition drift for the rest of the registry. But Layer 2 itself is implemented by the `invariant-testing-evaluator` agent — an LLM. Without an eval audit of the auditor, a silently-regressed Layer 2 ("the LLM started accepting under-constraining scorers as valid") would propagate undetected: every other eval would gate green because Layer 2 stops catching drift. Closing the loop costs one Day-1 eval (~30-40k tokens of authoring) and is the canonical "audits the auditor" use case for an eval verifier on an SDD agent.

**Why one self-audit eval Day-1, not full agent-by-agent coverage.** Considered sweeping every SDD agent (design-evaluator, spec-evaluator, implementation-evaluator, invariant-testing-evaluator, mutation-tester) with at least one role-boundary eval each. Rejected for Day-1 because (a) it's speculative coverage (no specific failure mode evidenced yet for those other agents the way Layer 2 has the regress-the-auditor risk; the invariant-compiler/dev-harness role-boundary issues are already covered by the four contracts surfaced from ADR-0081), (b) the methodology's principle is "real demand drives invariants, not speculative coverage," and (c) the implementation budget grows linearly with each added eval. Future ADRs add agent-behavior evals when a specific failure mode surfaces.

**Why the four master-session/subagent role-and-model boundary invariants were added.** `methodology.master_session.unbiased_subagent_prompts` (added in an earlier round) is a downstream property — it assumes the methodology already commits to (a) the master session spawning subagents at all, (b) subagents being fresh-context and bounded (which is why prompt bias matters), and (c) a model-tier split (which is why subagents are even logically distinct entities running in their own context). Those preconditions were not themselves contracts; they were implicit in the methodology's design. The user pointed out the gap mid-audit: "there's probably a bunch of invariants missing that this depends on — the fact that a subagent should be spawned; the fact that a subagent should be spawned at sonnet level, and only the master session should be opus; the fact that the master session should be banned from editing code, should only be able to write ADRs." The four added invariants capture exactly that foundational division of labor: `edits_only_contract_surface` (master session's allowed write-scope), `delegates_implementation` (when master must spawn), `runs_at_opus_tier` (master's model tier), `subagent.runs_at_sonnet_tier` (subagents' model tier). Together with the existing `compile_invariants.*` and `dev_harness.test_files_not_edited` role-boundary contracts, they form a complete picture of who-edits-what at what tier — and `unbiased_subagent_prompts` now correctly requires `delegates_implementation` and `subagent.runs_at_sonnet_tier` as its logical preconditions.

**Why `methodology.registry.methodology_self_contained` was added (the self-containment rule).** Surfaced through a chain of corrections during this ADR's own design-audit loop. The eight eval-verified behavioral contracts (on /plan-feature, /compile-invariants, dev-harness, the invariant-testing-evaluator agent, and master-session prompt construction) originally had `requires: [methodology.eval.task_naming_matches_invariant_id]`. The user reclassified `task_naming` to `project.*` (correctly — the `*_eval.py::@task` naming is Inspect-AI specific to this repo). That left a layering violation: methodology contracts requiring a project-specific scaffolding entry, which would be incoherent for any consumer using a different framework. The settled resolution: the eval-verified contracts stay `methodology.*` (their subjects — /plan-feature, /compile-invariants, dev-harness etc. — ship with SDD and are universal across consumers; scope follows the SUT, not the verifier's implementation), and their `requires:` lists are empty — they're self-contained behavioral claims, not logically dependent on any specific verifier infrastructure. The verifier path being a project-specific Inspect-AI Python file is an implementation detail; a consumer using Promptfoo would have a different verifier file but the same contract. The methodology rule `methodology.registry.methodology_self_contained` codifies this self-containment as a structural invariant — every methodology entry's requires list contains only methodology IDs, framed as a self-referential property of the methodology prefix without presupposing any other prefix's existence. The methodology rule asserts only what it knows about itself; the project-scope split is project-defined.

**Why the glossary-delta schema extension belongs in ADR-0080.** Before ADR-0080, no ADR had ever added new glossary terms — every term in `glossary.yaml` was authored during the methodology's own bootstrap (ADR-0078) and accepted as implicit. ADR-0080 is the first ADR to introduce new glossary terms (`methodology` prefix, `project` prefix) as part of a contract-surface change. That exposed a gap: the Invariant Delta block schema only had `### Added` / `### Withdrawn` for invariants — there was no structured way to declare glossary changes. The implicit mechanism (the `glossary_terms:` field on a new invariant plus `methodology.glossary.complete` forcing the glossary.yaml update at commit time) makes the change enforceable but not self-documenting; a maintainer reading just the delta block couldn't see that glossary additions were happening. Adding the schema extension here closes the gap at the moment the first user appears, in the same shape as the existing registry-side reconciliation (`methodology.adr.delta_reconciles`). The legacy-bare-headers compatibility clause means no retrofit on the existing 30+ ADRs; they're treated as ADRs with empty glossary deltas.

**Why `methodology.master_session.unbiased_subagent_prompts` belongs here, not in a future ADR.** Surfaced during this very ADR's design-audit loop: the master session's re-audit prompts repeatedly used "verify the fixes", "confirm CLEAN", and "all 11 prior gaps are now resolved" framing — each one priming the fresh-context evaluator toward a CLEAN verdict before it read the file. The evaluator caught some non-blocking gaps anyway, but the priming pattern is exactly the kind of contract-erosion the audit chain exists to prevent: a biased prompt makes the audit's independence theoretical rather than mechanical. Like the role-boundary contracts surfaced from ADR-0081 and the `audit_until_clean` contract surfaced from ADR-0082, this failure mode is LLM-behavioral — it can't be enforced by AST scans or commit-diff checks. Only an eval verifier — run the master session against canned scenarios where it has to spawn a subagent, then score the resulting spawn prompt for neutrality — can register this as a real contract. Registered here in ADR-0080 because ADR-0080 is the eval-as-verifier-mechanism ADR AND because this ADR's own design-audit loop is the surfacing event.

**Why no cache-related invariants Day-1.** Earlier drafts had `methodology.eval.cache_keys_complete` (composite SHA covers harness + skill + eval-yaml + input + model) and a corresponding cross-model-cache-invalidation invariant. With Inspect-AI adopted and the methodology-side SHA cache deferred, neither is load-bearing Day-1. Inspect's model-response cache handles the cheap case; methodology cache is a Day-2 enhancement if cost pain materializes. Cross-model evals stay in Scope > Deferred with no Day-1 contract.

**Why `methodology.config.verify_includes_inspect` was withdrawn before promotion.** The original draft asserted that consumer projects' `verify[]` arrays contain `inspect eval-set` + `inspect-gate.py` invocations. Reclassified to project scope (then deleted from `methodology.*` entirely) during Layer 2 audit reconciliation: the methodology has no equivalent `verify_includes_gotest` or `verify_includes_semgrep` invariant — it trusts consumers to wire static verifiers in their own CI. Enforcing dispatch wiring for eval but not for Go tests is paternalism. If a consumer wires evals wrong, their CI is visibly broken — same as for static verifiers. Withdrawn before the ADR moved from draft to accepted; replaced by the project-scoped `project.config.verify_includes_inspect` which asserts only this repo's own wiring.

**Why `methodology.eval.inspect_gate_aggregates_failure_modes` was reclassified to project scope.** The original draft made the gate helper methodology-shipped (under `scripts/inspect-gate.py`) and asserted its behavior as a `methodology.*` invariant. During Layer 2 audit reconciliation we recognized the helper is Inspect-specific glue — every other validator framework (go test, pytest, semgrep, Promptfoo, Braintrust) gates on score by default and needs no equivalent. The gap exists only because Inspect's `eval-set` returns success = "tasks completed without crashing" rather than "scores ≥ threshold." Shipping framework-coupling glue as methodology code over-couples the methodology to one specific framework's design choice. Resolution: methodology ships `examples/inspect-gate.py` as a reference template (any consumer adopting Inspect needs this glue); this repo (an Inspect-adopting consumer of itself) copies it to `scripts/inspect-gate.py` and asserts its behavior via the project-scoped `project.inspect_gate.aggregates_failure_modes`. Methodology stays framework-neutral; framework choice and its glue belong to the project that chose the framework.

**Why the `methodology.*` vs `project.*` ID-prefix convention was introduced now.** Before ADR-0080, every active registry entry was prefixed `methodology.*` and conflated "what SDD's tooling does" with "how this specific repo is developed." The reclassification of the gate helper's behavior contract surfaced the first concrete `project.*` candidate. Establishing the distinction at the moment the first user appears, rather than retrofitting later, keeps the registry honest about scope: every new invariant authored via `/plan-feature` now answers the question "does this assert something the validator enforces against every SDD-using project, or only something specific to this repo's setup?" — yes drives `methodology.*`, no drives `project.*`. Readers can scan `methodology.*` entries to see what SDD's tooling promises across all consumers; `project.*` entries are this-repo-only hygiene.

The crucial framing correction (made during this same amendment round): the `methodology.*` prefix does NOT mean "consumers must add this to their own registry." Methodology invariants live exclusively in this repo's `src/sdd/spec/registry.yaml`. The enforcement on consumers happens because consumers run `sdd verify`, which carries hardcoded structural Go checks; the `methodology.*` invariants in this repo's registry document those checks and let SDD dogfood itself against them. A consumer's registry contains *their own* domain invariants (e.g., `myapp.users.passwords_hashed`) — not SDD's `methodology.*` entries.

For the same reason, the cross-cutting prefix-allowlist invariant is itself `project.*`, not `methodology.*`. Were it `methodology.*`, the validator would assert that *every* SDD-using project's registry contains only `methodology.` or `project.`-prefixed IDs — wrong for a consumer with `myapp.*` entries. The specific allowlist `{methodology, project}` is this repo's organizational choice; consumers may adopt the *pattern* (split tooling-shipped contracts from local hygiene) but with their own prefix names. The convention's discipline-forcing value (one Y/N question during Q&A) is small; its long-term clarity value as `project.*` grows (packaging, dogfooding tooling, CI-config invariants will arrive) is larger.

**Why `inspect-gate.py` moved out of methodology-shipped distribution.** Same principle as the contract reclassification above — framework-coupling code shouldn't be methodology-distributed. The earlier "ships with the plugin" position implicitly committed the methodology to one framework's CLI / log format / score-gating quirks for the lifetime of the plugin. Moving the gate to `examples/` keeps it discoverable for consumers who want it without baking it into the distribution. The methodology's contract surface is now framework-neutral: a future consumer that picks a different validator framework gets no methodology-imposed Python script at all; they bring whatever glue their framework needs themselves.

**Why the `sdd verify` ↔ framework adapter interface was rejected (revisited).** During Layer 2 audit reconciliation, the question came up: if Inspect-specific CLI flags leak into project `verify[]`, should `sdd verify` grow a stable adapter contract (JSON-lines input/output, mechanism classification, framework-specific adapter scripts under `scripts/adapters/`) so projects could swap frameworks cleanly? Rejected for the same YAGNI reason ADR-0078 rejected Go adapter framework: one framework (Inspect), one consumer (this repo dogfooding itself) Day-1; designing the adapter interface against one concrete implementation would almost certainly produce the wrong shape, and the cost (config schema change, classification logic, contract spec, reference adapter maintenance) is real. The accepted tradeoff: Inspect-specific CLI leaks into the consuming project's `verify[]` (about 3 lines of shell). Revisit when a second framework lands or a second consumer with conflicting preferences appears.

## Open questions

(none — all resolved as of 2026-05-11; amendment 2026-05-11 also produced no new opens)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| End-to-end: register an eval-verified invariant via Inspect | Author the invariant in an ADR, run /compile-invariants, Inspect `@task` Python stub appears, sdd verify runs the configured `inspect eval-set` + gate-helper chain, log files written, gate exits 0 on pass | Manual: author registry.yaml entry + ADR delta; commit; run sdd verify | /compile-invariants, invariant-compiler, sdd verify, inspect CLI, scripts/inspect-gate.py |
| Inspect's model-response cache hits on unchanged inputs | Re-running `inspect eval-set` with no input changes hits Inspect's cache, no new API calls | Pre-warm Inspect's cache; assert no API activity on second run | Inspect's own cache |
| Reducer-edge result (2-of-3 pass) | A task with `epochs=3` + `epochs-reducer=at_least_n,2` and per-epoch results [CORRECT, CORRECT, INCORRECT] aggregates to CORRECT (reducer threshold met); the gate exits 0. | Synthetic Inspect task with stubbed per-epoch scorer outputs | Inspect's epoch reducer + `scripts/inspect-gate.py` aggregate read |
| Inspect CLI not on PATH | Setup-skill precondition catches missing `inspect` binary; `sdd verify` shells out to verify[] which exits non-zero with clear error | Run in env without inspect installed | Setup skill, verify[] shell-out |
| Python verify-env not installed | Same — `inspect eval-set` shell entry fails with clear "command not found" | Run in env without Python 3.10+/inspect-ai | Setup skill bootstrap |
| Missing ANTHROPIC_API_KEY surfaces from Inspect | Unset the key; Inspect itself fails fast with its own error message; `verify[]` exits non-zero | env var control; assert Inspect error in stderr | Inspect's own auth path |
| Inspect-gate fails on INCORRECT-aggregate task | Synthesize an Inspect log with one task whose per-epoch results are [CORRECT, INCORRECT, INCORRECT] (1/3 pass under the `at_least_n,2` reducer aggregates to INCORRECT); `scripts/inspect-gate.py` exits non-zero naming the failing invariant_id | Author synthetic .eval log with the per-epoch outputs and post-reducer aggregate; run gate helper | scripts/inspect-gate.py |
| Layer 2 audit catches rubric drift | Audit chain Layer 2 reads an Inspect `@task` Python file, reconstructs invariant from the task's scorers, flags when reconstruction diverges from registered definition | Synthetic Inspect task with deliberately drifted prompt | invariant-testing-evaluator |
| Layer 2 self-audit catches regressed auditor | Replace invariant-testing-evaluator's prompt with a regressed version that accepts under-constraining scorers; the self-audit Inspect eval fails | Synthetic agent-prompt mutation | invariant-testing-evaluator, inspect CLI |
| Layer 3 mutation catches non-biting eval | Mutate SKILL.md to remove the user-flow-walkthrough mandate; corresponding Inspect eval must fail | Synthetic SKILL.md mutation | mutation-tester, inspect CLI |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `examples/inspect-gate.py` (methodology reference template) | ~50-80 | 20k | Uses `inspect_ai.log.read_eval_log()`; exits non-zero on (1) no logs found, (2) any task with `status != "success"`, or (3) any task with aggregate INCORRECT. Labels each failure with the invariant_id where applicable. Shipped as reference template under `examples/` — not installed into consumer working trees. |
| This repo's `scripts/inspect-gate.py` (project's own copy) | ~50-80 | 5k | Copied verbatim from `examples/`; behavior asserted by `project.inspect_gate.aggregates_failure_modes`. Token estimate is small because copy-paste, not authoring. |
| `setup/SKILL.md` Python verify-env bootstrap | ~50 | 18k | `pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set INSPECT_EVAL_MODEL default; preconditions (`which inspect`, `python --version`). No Docker check (sandbox="local" default). |
| `setup/SKILL.md` Inspect-adopter doc + template-copy guidance | ~25 | 10k | Documents the "if you adopt Inspect, copy `examples/inspect-gate.py` to your `scripts/`" pattern. |
| `setup/SKILL.md` `verify[]` template updates | ~20 | 10k | Add Inspect + gate commands to seeded config (starting scaffold; not enforced) |
| Glossary additions for `methodology` and `project` ID prefixes | ~20 | 8k | Two terms defined using validator-enforces framing — `methodology` = invariants enforced by `sdd verify`'s hardcoded checks against every project; `project` = invariants specific to this repo's local development. |
| Go test `TestRegistryIDPrefixAllowed` (project cross-cutting invariant) | ~30 | 10k | Walks this repo's registry; asserts each active entry's `id` starts with `methodology.` or `project.`. Single negative case covers an unknown prefix. |
| Go test `TestGlossaryDeltaBlock` (methodology cross-cutting invariant) | ~80 | 18k | Walks each ADR's `## Invariant Delta` section; accepts either the legacy bare `### Added` / `### Withdrawn` headers OR the four explicit headers (`### Added (invariants)`, `### Added (glossary)`, `### Withdrawn (invariants)`, `### Withdrawn (glossary)`). Asserts each block under explicit headers is well-formed YAML (or empty/none). |
| Go test `TestGlossaryDeltaReconciles` (methodology cross-cutting invariant) | ~100 | 22k | Computes the integral of (Added - Withdrawn) glossary entries across all ADRs' delta blocks (treating legacy-bare ADRs as zero glossary delta); compares against the live `glossary.yaml`. Asserts equality. Parallel to `methodology.adr.delta_reconciles`. |
| Go test `TestMethodologySelfContained` (methodology cross-cutting invariant) | ~40 | 12k | Walks every active registry entry whose ID starts with `methodology.`; asserts each ID in its `requires:` list also starts with `methodology.`. Negative cases cover a methodology entry that requires a non-methodology entry (should fail) and a methodology entry that requires another methodology entry (should pass). Non-methodology entries are not constrained — they may require anything. |
| `/plan-feature` SKILL.md Step 3 prefix-Q&A addition | ~15 | 8k | Adds one Q&A question per new invariant: "Does this assert something the validator enforces against every SDD-using project, or only something specific to this repo's setup?" Answer drives prefix choice. |
| `/plan-feature` SKILL.md Step 4 ADR-template extension (glossary delta block) | ~30 | 12k | Updates the ADR template in `src/sdd/skills/plan-feature/SKILL.md`'s "Step 4 — Finalize the ADR" section: adds the four explicit Invariant Delta sub-section headers with stub entry shapes (term/definition for glossary additions, term/reason for withdrawals). Documents legacy-bare-headers backward-compat. |
| Go test `TestProjectVerifyIncludesInspect` (project config invariant) | ~50 | 12k | Validates this repo's spec-driven-config.json's verify[] contains the inspect+gate dispatch, and asserts `--log-dir` matches the path argument to `inspect-gate.py`. Project-scoped — lives in this repo's spec tests but checks this repo's config specifically. |
| Go test `TestEvalTaskNamingMatchesInvariantID` (file/function naming) | ~60 | 15k | Walks the project's eval directory (wherever `verifier:` paths point); parses for `@task` decorated function names; asserts each matches the suffix of an active eval-verified invariant. |
| Go test `TestProjectInspectGateAggregatesFailureModes` (project gate behavior) | ~120 | 25k | Runs this repo's `scripts/inspect-gate.py` against synthetic logs covering each failure mode: empty dir, log with `status=error`, log with INCORRECT aggregate. Asserts exit code and per-mode message text. Project-scoped. |
| `/compile-invariants` Inspect-stub authoring | ~150-200 | 50k | invariant-compiler subagent extension: author Inspect `@task` Python stubs using `inspect_swe.claude_code()` solver. Prefers programmatic scorers when contract has deterministic ground truth (commit diff, build exit code); falls back to `model_graded_qa` only for qualitative-LLM-judgment contracts. |
| `/audit-invariants` Layer 2 extension (Inspect task audit) | ~120 | 45k | invariant-testing-evaluator prompt extension to read Python task files instead of YAML |
| `/audit-invariants` Layer 3 extension (skill mutation) | ~250 | 70k | mutation-tester prompt extension + SKILL.md mutator |
| `methodology.plan_feature.user_flow_walkthrough` Inspect task | ~80 | 30k | First skill eval; canned input + `model_graded_qa` rubric (qualitative judgment contract). |
| `methodology.plan_feature.audit_until_clean` Inspect task | ~90 | 30k | Skill eval: solver runs /plan-feature against PASS-not-CLEAN fixture; rubric checks that re-audit runs before commit. |
| `methodology.compile_invariants.file_scope` Inspect task | ~120 | 40k | Agent-behavior eval: solver runs invariant-compiler on canned ADR; **programmatic** scorer runs `git diff --name-only HEAD` and checks each path against allowlist (`*_test.go`, `*_interface.go`, registry/glossary YAML specifically). `model_graded_qa` as secondary narration check. |
| `methodology.compile_invariants.no_test_scaffolding` Inspect task | ~90 | 30k | Agent-behavior eval: scorer scans authored `_test.go` files for ad-hoc Validator type definitions. |
| `methodology.compile_invariants.references_undefined_symbols` Inspect task | ~90 | 35k | Agent-behavior eval: **programmatic** scorer runs `go build`; asserts exit ≠ 0 AND stderr matches `/undefined:/`. Canned input no longer pre-coaches the expected outcome. |
| `methodology.dev_harness.test_files_not_edited` Inspect task | ~90 | 30k | Agent-behavior eval: solver runs dev-harness; scorer asserts no `_test.go` or `_interface.go` files in diff. |
| `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers` Inspect task | ~100 | 35k | Self-audit eval on Layer 2; solver runs invariant-testing-evaluator on under-constraining fixture; scorer asserts agent flags both the under-constraining scorer AND the missing clause. |
| `methodology.master_session.edits_only_contract_surface` Inspect task | ~110 | 35k | Master-session role-boundary eval: solver runs the master session against a canned scenario requiring a non-contract-surface edit (e.g. a typo in production .go file, a missing test); scorer inspects the resulting session's file-edit operations and asserts none touched files outside the contract-surface allowlist (ADR files, glossary, registry, reaction artifacts, spec-driven-config.json). Programmatic scorer (file-path allowlist check). |
| `methodology.master_session.delegates_implementation` Inspect task | ~110 | 35k | Master-session delegation eval: solver runs the master session against a canned scenario requiring production-code or test-file work; scorer asserts the session spawned `dev-harness` (for production code) or `invariant-compiler` (for test/interface files) rather than performing the edit directly. Programmatic scorer (inspect spawn-event log + file-edit log). |
| `methodology.master_session.runs_at_opus_tier` Inspect task | ~60 | 20k | Master-session tier verification: programmatic check on the active model in the master session's environment (e.g. `ANTHROPIC_MODEL` env var, harness config, or `claude --info` output). PASS iff the tier matches the Opus family identifier. |
| `methodology.subagent.runs_at_sonnet_tier` Inspect task | ~80 | 25k | Subagent tier verification: programmatic check on each registered subagent definition file (e.g. `.agent/agents/*.md` frontmatter `model:` field) — asserts every fresh-context subagent declares the Sonnet tier. PASS iff all enumerated subagents conform. |
| `methodology.master_session.unbiased_subagent_prompts` Inspect task | ~120 | 40k | Master-session prompt-discipline eval: solver runs the master session against a canned scenario (e.g., post-audit fix round, dev-harness re-invocation) where it must spawn a subagent; scorer inspects the resulting subagent prompt for forbidden priming patterns (`verify the fixes`, `confirm CLEAN`, `should be clean now`, asserted-resolved language) using a combination of regex/keyword scan and `model_graded_qa` judgment for subtle priming. Programmatic-first scorer per the deterministic-ground-truth rule (keyword detection has ground truth); LLM judge as secondary for less-obvious phrasings. |
| `/plan-feature` user-flow-walkthrough mandate text | ~30 | 20k | Skill text update |
| New invariants in registry (19 entries) + verifiers | ~750 | 155k | 15 methodology invariants: 3 cross-cutting (`methodology.adr.glossary_delta_block`, `methodology.glossary.delta_reconciles`, `methodology.registry.methodology_self_contained`) + 4 master-session and subagent role/model boundaries (`methodology.master_session.{edits_only_contract_surface, delegates_implementation, runs_at_opus_tier, unbiased_subagent_prompts}` + `methodology.subagent.runs_at_sonnet_tier`) + 8 eval-verified behavioral contracts on SDD-shipped agents/skills (`methodology.plan_feature.{user_flow_walkthrough, audit_until_clean}`, `methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}`, `methodology.dev_harness.test_files_not_edited`, `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`). Plus 4 `project.*` invariants: `project.registry.id_prefix_allowed`, `project.eval.task_naming_matches_invariant_id`, `project.config.verify_includes_inspect`, `project.inspect_gate.aggregates_failure_modes`. Net delta vs. pre-amendment: +9 entries (15 methodology + 4 project = 19). The methodology master-session/subagent role-and-model contracts (the foundational division of labor that `unbiased_subagent_prompts` builds on) and the 8 eval-verified behavioral contracts are all `methodology.*` because their subjects ship with SDD and are universal across consumers — verifier paths being project-specific Inspect-AI Python files is an implementation detail, not a constraint on scope. Methodology contracts' `requires:` lists contain only methodology IDs (or are empty) — `methodology_self_contained` enforces this. |
| Documentation in `context.md` | ~50 | 15k | Distributed plugin payload — documents prefix convention, Inspect-adopter copy path, and the example template. |

**Total estimated tokens**: ~945k (sum of per-row estimates; up from the pre-amendment ~565k by ~380k, broken down as: ~100k for the prefix-convention infrastructure plus the four prefix-convention / config / dispatch `project.*` invariants and their verifiers, plus the verifier-mechanism upgrades from `model_graded_qa` to programmatic scorers in two evals, plus the additional `audit_until_clean` skill eval; ~45k for `methodology.master_session.unbiased_subagent_prompts` and its registry-row token bump; ~67k for the glossary-delta schema extension (two Go cross-cutting verifiers + `/plan-feature` SKILL.md template update + registry-row token bump from 100k→115k); ~24k for `methodology.registry.methodology_self_contained` (one Go cross-cutting verifier + registry-row bump from 115k→127k); ~143k for the four master-session/subagent role-and-model boundary invariants — `methodology.master_session.{edits_only_contract_surface, delegates_implementation, runs_at_opus_tier}` + `methodology.subagent.runs_at_sonnet_tier` — four new Inspect eval tasks plus registry-row bump from 127k→155k for the +4 entries).
**Estimated wall-clock**: ~6-8 days of dev-harness work, paced by (1) the Inspect-AI integration (first-time Python verify-env bootstrap, programmatic scorers for diff/build/keyword-scan/env-var/file-content checks) and (2) authoring the twelve Inspect eval tasks (two skill-behavior + four agent-behavior role-boundary + one self-audit + five master-session/subagent role/model boundary including prompt-discipline) with the new programmatic-scorer-by-default rule.

---

## Appendix A — Inspect-AI Research (superseded by Day-1 adoption)

This appendix records the research that drove the initial "custom Go runner, not Inspect-AI" recommendation. **That recommendation was overturned in the final design** — Inspect-AI (plus Meridian Labs' `inspect_swe` agent suite) is adopted as the Day-1 framework. Preserved here as the technical inventory of Inspect-AI's capabilities and gaps. The gaps the appendix identified have since been addressed:
- "No documented subprocess-as-SUT pattern" → closed by `inspect_swe.claude_code()`, a first-class pre-built solver for Claude Code SUTs.
- "No first-class CI pass/fail gate" → closed by a thin gate helper (~50-80 LOC) reading Inspect's `EvalLog` via documented API. The methodology ships this as a reference template at `examples/inspect-gate.py`; Inspect-adopting consumers (including this repo) copy it to their own `scripts/inspect-gate.py`.
- "No SHA-of-input cache" → deferred; rely on Inspect's model-response cache Day-1.
- "Python 3.10+ runtime" → accepted as the cost of not reinventing the framework.

### Maintenance signal (May 2026)
UK AISI + Meridian Labs. MIT licensed. 5,590 commits, 220 git tags. Latest release 0.3.220 (May 8, 2026 — 3 days before this ADR). Release cadence every 2-3 days. Government-backed, durable on a 2-year horizon. Pre-1.0 versioning means breaking changes still in scope.

### CI fit
**Runnable in CI but not CI-positioned.** No documented GitHub Actions workflow, no specified exit-code semantics for scorer failure. `eval_set()` returns `success` = "tasks completed without error," not "scores ≥ threshold." A CI gate requires hand-rolling a post-step that parses `.eval` logs and decides pass/fail.

### Deployment
Python 3.10+. ~35 transitive deps: pydantic, httpx, anyio, numpy, boto3+aioboto3+s3fs (always pulled, even for offline use), tiktoken, textual (TUI), rich, debugpy, jsonschema, ijson, zstandard, fsspec, mmh3, tenacity. No server/DB required; pure offline against API. Footprint is heavy for a Go-methodology consumer.

### Agent eval support
Strong. `solver` is the base interface; `@agent` decorator builds on top. Multi-turn, tool use, ReAct, Deep Agent, Multi-Agent, Custom — all documented. **No built-in subprocess solver.** Wrapping `claude --print` requires hand-rolling a custom `@agent` that calls `subprocess.run`; workable but undocumented.

### Eval format
Python-only. `@task`-decorated functions return `Task(dataset=..., solver=..., scorer=...)`. YAML escape hatch exists only for HuggingFace-hosted datasets. No general-purpose declarative format.

### Scorers
Built-ins: `includes`, `match`, `pattern`, `answer`, `exact`, `f1`, `model_graded_qa`, `model_graded_fact`, `choice`, `math`, `perplexity`. Multiple scorers per task supported. LLM-judge prompts are Python strings, not YAML. Vocabulary is excellent; the design ideas are worth borrowing.

### Sample / threshold
`--epochs N` for N samples. `--epochs-reducer mean|median|mode|max|at_least_n|pass_at_k` for variance handling. Strong design — the methodology's Day-1 adoption of Inspect-AI uses this natively (no ADR-owned runner required). **No first-class pass/fail threshold across an eval set.**

### Result format
`.eval` (compressed binary, ~1/8 size of JSON) or `.json`, written to `./logs/`. Configurable to S3 or Azure Blob. Programmatic access via `EvalLog`.

### Caching
Caches **model API responses**, not eval runs. Key includes model + messages + epoch + generation config + tools. **No SHA-of-skill-file cache**; the "skip evals for unchanged skills" layer must be built externally.

### Bottom line (from research, superseded)
> Inspect-AI is the most credible, actively-maintained agent-eval framework in the ecosystem and technically capable of being the eval verifier mechanism — but it imposes a Python runtime on a Go methodology, ships no SHA-of-input cache, exposes no first-class pass/fail CI gate, and offers no documented pattern for wrapping `claude --print` as the SUT. Recommend treating Inspect as a reference implementation to study, not a dependency to adopt: for Day-1, define the eval verifier as a path-extension dispatch (e.g. `*.eval.yaml` → in-tree Go runner that calls Anthropic API + simple scorers + SHA cache) and revisit Inspect only if the eval requirements outgrow what 200 lines of Go can express.

### Final decision (overturning the bottom line)
The final ADR adopts Inspect-AI Day-1, accepting the Python runtime dependency and addressing each named gap with minimal Inspect-API-driven glue (gate helper, subprocess solver, deferred SHA cache). The "build our own" path repeatedly proposed in intermediate drafts was rejected.

### Sources
- [Inspect AI docs](https://inspect.aisi.org.uk/)
- [UKGovernmentBEIS/inspect_ai on GitHub](https://github.com/UKGovernmentBEIS/inspect_ai)
- [Agents](https://inspect.aisi.org.uk/agents.html), [Custom agents](https://inspect.aisi.org.uk/agent-custom.html), [Tasks](https://inspect.aisi.org.uk/tasks.html), [Scorers](https://inspect.aisi.org.uk/scorers.html), [Eval logs](https://inspect.aisi.org.uk/eval-logs.html), [Eval sets](https://inspect.aisi.org.uk/eval-sets.html), [Caching](https://inspect.aisi.org.uk/caching.html), [Options](https://inspect.aisi.org.uk/options.html)
- pyproject.toml, requirements.txt, PyPI listing, tags page
