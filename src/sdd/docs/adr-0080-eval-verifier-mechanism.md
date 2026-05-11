# ADR: Eval as a Verifier Mechanism (LLM-Behavior Contracts)

**Status**: draft
**Status history**:
- 2026-05-11: draft

## Overview

Add **eval** as a verifier mechanism in the invariant-driven development taxonomy: a way to register contracts on LLM-driven behavior (skills, agents, methodology processes) where the verifier is a deterministic scorer over LLM outputs against canned inputs. Eval-verifiers are **CI gates** like all other verifiers — they run via `sdd verify`, gated on a SHA-cache so unchanged skills don't re-run. The runner is a custom Go binary (`sdd eval`) shipped with the plugin; no external framework dependency.

This is a methodology extension over ADR-0078. The verification taxonomy in 0078 listed: *unit, table, property, architectural-rule, AST, type-system, schema, codegen-completeness, integration, journey*. Eval is the eleventh mechanism — distinct because it's the first whose verifier may invoke an LLM at evaluation time. ADR-0078's "no LLM in recurring CI" was framed as a cost heuristic; this ADR amends that explicitly: LLMs run in CI when the contract is genuinely LLM-judged, gated by a SHA-cache so the recurring cost on unchanged skills is zero.

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
| CI vs audit | **CI gate, cache-protected.** Eval-verifiers run via `sdd verify` like all other verifiers. The SHA-cache makes the recurring cost on unchanged skills zero. | ADR-0078's "no LLM in CI" was a cost heuristic, not a principle. If a contract is real, it gates merges — otherwise it's advisory, which is the trap invariant-driven dev was built to escape. Cache + sampling + threshold contains the cost. |
| Eval runner | **Custom Go binary (`sdd eval`) shipped with the plugin.** ~300-500 LOC: shells out to the harness (`claude --print "/skill ..."` for Claude Code consumers; configurable per-consumer), captures the conversation transcript, runs scorers, writes JSON results, manages SHA-cache. | Inspect-AI is the closest fit but adds Python 3.10+ + ~35 deps + no first-class CI gate + no SHA cache + no documented subprocess-as-SUT pattern. Building thin in Go preserves the methodology's zero-dep stance and gives full control over the gate semantics. Inspect's design (epochs/reducers, log format, scorer vocab) informs the runner; the dependency is studied, not adopted. See Appendix. |
| Dispatch | Eval verifier paths match `*.eval.yaml`. `dispatch{}` maps the extension to `sdd eval <path>`. `sdd verify` invokes the runner; the runner consults its cache and writes results to `<project>/spec/eval-runs/`. | Same dispatch model as ADR-0078 (path extension → command). Lets the registry stay agnostic to runner internals. |
| Eval YAML schema | Declarative: `description`, `harness` (the SUT command template), `inputs[]` (canned inputs with variable substitution), `scorers[]` (programmatic + LLM-judge mixed per-eval), `epochs`, `reducer`. | Declarative YAML is diff-friendly, cache-friendly, and survives runner replacement. Inspect's Python-only `@task` format is more expressive but locks consumers into Python. |
| Scorer types | Three supported: **programmatic** (regex, JSON-shape, contains-substring), **llm-judge** (rubric prompt + grade pattern), **mixed** (programmatic for hard asserts, LLM-judge for soft asserts). Vocabulary borrowed from Inspect's `includes`/`match`/`pattern`/`model_graded_qa`. | Programmatic is cheap and deterministic; LLM-judge is necessary for "did the skill actually walk every flow step." Mixing both per-eval lets each invariant choose what's cheap and what's real. |
| Variance handling (epochs + reducer) | Each eval declares `epochs: N` (default 3) and a `reducer` (`pass_at_k`, `at_least_n`, `mean`, `mode` — vocabulary borrowed from Inspect). Default reducer: `at_least_2_of_3`. | LLM outputs vary; a single sample is flake-prone. N samples + reducer gives a statistically meaningful pass/fail. Inspect's `--epochs-reducer` design is the proven shape. |
| Cost discipline (SHA cache) | Eval runs are cached by **harness SHA + skill SHA + eval-yaml SHA + input SHA + model identifier**. Cache hit returns the prior result without invoking the LLM. Cache stored at `<project>/spec/eval-cache/<eval-id>-<composite-sha>.json`; checked into git so CI shares cache across runs. | The recurring CI cost concern is real: a developer commits 20×/day; without a cache, every commit re-runs all evals. With cache, only commits that touch the skill / harness / eval YAML pay LLM tokens. Caching the cache in git lets CI and local dev share results. |
| Cache invalidation | Cache key changes invalidate; otherwise sticky. Explicit cache bust via `sdd eval --no-cache <invariant-id>` or `sdd eval --bust-cache <invariant-id>`. | Cache is a load-bearing optimization, not a correctness layer. Bust must be cheap and obvious. |
| Audit chain Layer 2 (statement-↔-verifier) extension | Now also audits **eval rubrics**: invariant-testing-evaluator reads the eval YAML and reconstructs the invariant statement from the scorers' assertions; diffs against the registered `definition`. Catches drift where the eval no longer tests what its invariant claims. | Without this audit, eval rubrics drift quietly — a "valid" eval that scores everything pass-by-default would still gate green. Layer 2 already does this for static verifier code; extending it to eval YAML is a natural fit. |
| Audit chain Layer 3 (mutation tester) extension | Mutation tester now also mutates **skill text**: a deliberate edit to SKILL.md that removes the user-flow-walkthrough instruction MUST cause the corresponding eval to fail. Eval that doesn't catch its skill mutation = eval doesn't actually bite. | Mutation testing was previously about verifier code; under invariant-driven dev with eval verifiers, the "code" being mutation-tested is the skill (the SUT). Audit-only; never a CI gate. |
| First consumers | (1) Skill behavior contract: `methodology.plan_feature.user_flow_walkthrough`. (2) Four agent-behavior role-boundary contracts surfaced by ADR-0081: `methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}` and `methodology.dev_harness.test_files_not_edited`. All registered with eval YAMLs at `<project>/spec/evals/<area>/<name>.eval.yaml`. | Five evals Day-1 is enough to validate the mechanism across two consumer surfaces (skills + subagents) and exercise both same-author and adversarial scoring shapes. Adding the role-boundary contracts catches the exact failure modes ADR-0081's authoring revealed (two stopped invariant-compiler runs because of prompt-level discipline leakage). Other skill disciplines deferred to follow-up ADRs as they emerge. |

## User Flow

Authoring an eval-verified invariant:

1. **`/plan-feature` Q&A** surfaces a contract on LLM behavior (e.g. "/plan-feature must walk user flows during Q&A when given an ADR with a User Flow section").
2. **Add the entry to the ADR's `### Added` block** with `verifier: <project>/spec/evals/<path>/<name>.eval.yaml`.
3. **`/compile-invariants`** invokes `invariant-compiler` subagent. For eval verifiers, the compiler authors a YAML stub with: `harness` template (e.g. `claude --print "/plan-feature ..."`), one or more canned `inputs[]`, programmatic + LLM-judge `scorers[]`, default `epochs: 3, reducer: at_least_2_of_3`. The compiler does NOT run the eval at compile time — only authors it.
4. **`/feature-change`** implements the skill change (e.g. adds the user-flow-walkthrough mandate to `/plan-feature/SKILL.md`). The verify suite (`sdd verify && verify[]`) runs. For the eval verifier:
   - Composite SHA computed (harness + skill + eval-yaml + input + model).
   - Cache hit → return cached pass/fail; CI free.
   - Cache miss → runner invokes the harness `epochs` times, runs scorers, computes pass/fail via reducer, writes result file and cache entry.
5. **Audit run (`/audit-invariants`)** layer 2 reads the eval YAML and reconstructs the invariant statement from the scorers; flags drift. Layer 3 mutates SKILL.md (`go-mutesting`-style on the markdown) and re-runs the eval; an eval that passes after the mutation is flagged as not-actually-biting.

## Component Changes

### Eval mechanism (new)

- **`sdd eval` Go binary** (subcommand of `sdd`): reads eval YAML, manages cache, invokes harness, runs scorers, writes results. ~300-500 LOC. **(in scope)**
- **Eval YAML schema**: declarative format, see Data Model. Validated at parse time. **(in scope)**
- **Cache directory**: `<project>/spec/eval-cache/`, checked into git. Each file is small JSON keyed by composite SHA. **(in scope)**
- **Result directory**: `<project>/spec/eval-runs/`, gitignored. Per-run JSON with timestamps and raw outputs. **(in scope)**

### `sdd verify` integration

- Eval verifier paths (`*.eval.yaml`) dispatch to `sdd eval <path>`. Existing dispatch mechanism from ADR-0078. **(in scope)**
- `sdd verify` reports per-eval pass/fail in the same output stream as other verifiers. **(in scope)**

### Audit chain

- **Layer 2 extension**: `invariant-testing-evaluator` agent prompt extended to handle eval YAML inputs (reconstructs invariant statement from scorers, not just from test code). **(in scope)**
- **Layer 3 extension**: `mutation-tester` agent extended to mutate skill text (line-by-line edits to SKILL.md) and run impacted evals. Audit-only. **(in scope)**

### Skills

- `/compile-invariants` extended to recognize eval verifier paths and author eval YAML stubs instead of Go test functions. **(in scope)**
- `/plan-feature/SKILL.md` extended with user-flow-walkthrough mandate (the first eval-verified discipline). **(in scope)**

### Configuration

`spec-driven-config.json` gains a `dispatch{}` rule for eval verifiers:

```json
{
  "spec": { ... },
  "verify": [
    "sdd verify",
    "go test ./..."
  ],
  "dispatch": {
    "*.eval.yaml": "sdd eval {{path}}"
  }
}
```

No new top-level config key. Evals are normal verifiers under `verify[]`'s dispatch.

## Data Model

### Eval YAML schema

```yaml
description: <one-line statement matching the invariant definition>
harness:
  command: ["claude", "--print", "{{input}}"]
  cwd: "."
  timeout: 120s
  capture: stdout    # or stderr | both
inputs:
  - name: adr-with-flow-section
    vars:
      input: |
        /plan-feature --resume 0099
        <canned ADR draft with a User Flow section>
scorers:
  - type: pattern
    name: mentions-flow-step
    value: '(?i)flow step'
    weight: 1
  - type: llm-judge
    name: walks-each-flow-step
    model: claude-sonnet-4-6
    prompt: |
      The output below is a Q&A round from /plan-feature.
      The input ADR has a User Flow section with N steps.
      Did the Q&A include at least one question probing each step
      for the contract it commits to?

      Output: {{output}}

      Answer with: PASS or FAIL, followed by a one-line reason.
    grade_pattern: '^(PASS|FAIL)'
    weight: 2
epochs: 3
reducer: at_least_2_of_3   # also supported: pass_at_k, mean, mode
```

### Eval result schema

```json
{
  "eval_id": "methodology.plan_feature.user_flow_walkthrough",
  "composite_sha": "abc123...",
  "harness_sha": "harness-config-sha",
  "skill_sha": "skill-md-sha",
  "eval_yaml_sha": "yaml-sha",
  "input_sha": "input-sha",
  "model": "claude-opus-4-7",
  "timestamp": "2026-05-11T12:00:00Z",
  "epochs": 3,
  "epoch_results": [
    {"scorer_results": [{"name": "mentions-flow-step", "pass": true}, {"name": "walks-each-flow-step", "pass": true}], "epoch_pass": true},
    {"scorer_results": [...], "epoch_pass": true},
    {"scorer_results": [...], "epoch_pass": false}
  ],
  "reducer": "at_least_2_of_3",
  "pass": true,
  "raw_outputs": ["...", "...", "..."]
}
```

### Cache entry schema

Same shape as result, written to `<project>/spec/eval-cache/<eval-id>-<composite-sha>.json`. CI reads this file directly; cache hit skips harness invocation entirely.

## Error Handling

- **Harness command not found**: `sdd eval` reports "harness command not on PATH: `claude`" and fails the verifier. Suggest `verify[]` precondition to check.
- **Harness timeout**: per-eval `timeout` exceeded → that epoch fails (counts toward reducer). Two consecutive timeouts → fail-fast with a warning that the SUT may be hung.
- **LLM API errors (rate limit, auth, network)**: retries with exponential backoff (default 3 retries); if still failing, that epoch errors (distinct from "scorer failed"). Errored epochs count as failed by default; configurable per-eval.
- **Scorer parse error** (malformed grade-pattern, invalid regex): fails at parse time during `/compile-invariants` or `sdd eval --validate`.
- **Cache corruption**: invalid JSON → log warning, treat as cache miss, rebuild.

## Security

- **Eval cache in git**: cache files may contain LLM outputs from canned inputs. Inputs should never include real secrets; canned inputs are reviewed during ADR authoring.
- **Eval-runs directory gitignored**: contains raw model outputs from real runs; may include incidental PII or sensitive context. Default `.gitignore` template excludes `<project>/spec/eval-runs/`.
- **API keys**: `sdd eval` requires `ANTHROPIC_API_KEY` (or per-provider env var) for LLM-judge scorers and harness invocations. Fail-fast if absent; clear error message naming the missing variable.
- **Harness command injection**: the YAML's `command:` array is invoked directly (not shell-interpolated). Variable substitution in `{{...}}` placeholders is escaped before assembly. Authors can't author an eval that runs `rm -rf /` via crafted input.

## Impact

- Touches `sdd verify` (new dispatch rule), introduces `sdd eval` subcommand, extends `/compile-invariants` (new mechanism), extends `/audit-invariants` (Layer 2 + 3 extensions), extends `/plan-feature` (first eval-verified discipline).
- ADR-0079's parking lot loses one item ("evals as audit ritual extension") since it's now scoped to this ADR.
- ADR-0078's "no LLM in CI" promise is explicitly amended (see Decision history).

## Scope

**In v1:**
- `eval` as a registered verifier mechanism with `*.eval.yaml` dispatch.
- `sdd eval` Go binary with cache, epoch/reducer support, programmatic + LLM-judge scorers.
- Five first evals: one skill-behavior contract (`methodology.plan_feature.user_flow_walkthrough`) + four agent-behavior role-boundary contracts (`methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}`, `methodology.dev_harness.test_files_not_edited`).
- `/compile-invariants` authoring eval YAML stubs.
- `/audit-invariants` Layer 2 + 3 extensions for evals.

**Deferred:**
- Multiple eval frameworks (Inspect-AI, Promptfoo, Langfuse) as alternative runners.
- Process evals beyond the four role-boundary ones (e.g. /feature-change end-to-end behavior, /plan-feature end-to-end coherence).
- Dashboard surfacing of eval-run history.
- Per-eval token budget enforcement (today: implicit via epochs cap).
- Selective `sdd eval <invariant-id>` invocation parallel to `sdd run <id>`.
- Cross-model evals (run the same eval against multiple models, compare).

## Invariant Delta

### Added

```yaml
- id: methodology.registry.eval_verifier_dispatch_exists
  definition: Every active registry entry whose verifier path matches `*.eval.yaml` has a dispatch rule in spec-driven-config.json's dispatch map.
  verifier: src/sdd/spec/registry_test.go::TestRegistryEvalVerifierDispatchExists
  requires:
    - methodology.registry.verifier_field
    - methodology.config.spec_registry
  glossary_terms: []
  status: active

- id: methodology.eval.yaml_well_formed
  definition: Every file matching `*.eval.yaml` under <project>/spec/evals/ parses against the eval YAML schema (description, harness, inputs, scorers, epochs, reducer fields present and well-typed).
  verifier: src/sdd/spec/eval_test.go::TestEvalYAMLWellFormed
  requires:
    - methodology.config.spec_registry
  glossary_terms: []
  status: active

- id: methodology.eval.cache_keys_complete
  definition: Every eval cache entry filename encodes the composite SHA of harness, skill, eval YAML, input, and model identifier.
  verifier: src/sdd/spec/eval_test.go::TestEvalCacheKeysComplete
  requires:
    - methodology.eval.yaml_well_formed
  glossary_terms: []
  status: active

- id: methodology.cli.sdd_eval_subcommand
  definition: The `sdd` binary supports an `eval <path>` subcommand that reads an eval YAML, manages the SHA cache, invokes the harness for cache misses, runs scorers, and writes JSON results.
  verifier: src/sdd/spec/eval_test.go::TestSDDEvalSubcommand
  requires:
    - methodology.cli.verify_runs_structural_checks
    - methodology.eval.yaml_well_formed
  glossary_terms: []
  status: active

- id: methodology.plan_feature.user_flow_walkthrough
  definition: The /plan-feature skill, when given an ADR draft with a User Flow section, generates Q&A probing each flow step for the contract it commits to.
  verifier: src/sdd/spec/evals/plan-feature/user-flow-walkthrough.eval.yaml
  requires:
    - methodology.cli.sdd_eval_subcommand
    - methodology.eval.yaml_well_formed
  glossary_terms: []
  status: active

# Role-boundary contracts: agent-behavior invariants on invariant-compiler and
# dev-harness. Surfaced during ADR-0081 authoring (validator-single-source);
# they're behavioral claims about the agents, not data-shape claims, so they
# need eval verifiers (not static AST scans). Registered here because ADR-0080
# is the eval-as-verifier-mechanism ADR.

- id: methodology.compile_invariants.file_scope
  definition: The invariant-compiler subagent, when given an ADR with an Invariant Delta block, produces a commit whose diff touches only `*_test.go`, `*_interface.go`, and `*.yaml` files (no `.go` files outside test/interface, no edits to existing production code).
  verifier: src/sdd/spec/evals/compile-invariants/file-scope.eval.yaml
  requires:
    - methodology.cli.sdd_eval_subcommand
    - methodology.eval.yaml_well_formed
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.no_test_scaffolding
  definition: The invariant-compiler subagent does not define ad-hoc Validator implementations (noopValidator, stubValidator, fake concrete types) in `_test.go` files. Tests reference dev-harness-owned constructors (e.g. `newValidator()`) directly; those references stay undefined until dev-harness lands.
  verifier: src/sdd/spec/evals/compile-invariants/no-test-scaffolding.eval.yaml
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.references_undefined_symbols
  definition: The invariant-compiler subagent's output, for foundational ADRs that introduce new types, leaves the build red — test files reference at least one symbol (constructor, type, function) that dev-harness will create. The red build is the dispatch mechanism to dev-harness.
  verifier: src/sdd/spec/evals/compile-invariants/references-undefined-symbols.eval.yaml
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.dev_harness.test_files_not_edited
  definition: The dev-harness subagent, when given a failing build and a list of failing verifiers, produces a commit whose diff does not modify any `_test.go` or `_interface.go` file. Tests are immutable to dev-harness; if a test needs to change, the fix routes through /plan-feature → /compile-invariants.
  verifier: src/sdd/spec/evals/dev-harness/test-files-not-edited.eval.yaml
  requires:
    - methodology.cli.sdd_eval_subcommand
    - methodology.eval.yaml_well_formed
  glossary_terms: []
  status: active
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why eval as a mechanism, not a special-case audit layer.** Could have been framed as "Layer 2.5 of the audit chain" with no taxonomy expansion. Picked mechanism status because: (a) it generalizes — agent evals, process evals, journey evals all fit the same shape (canned input → LLM output → scorer); (b) it makes registry surface uniform — `verifier:` field always means "the file at this path is the executable form of the contract," whatever its dispatch is; (c) it future-proofs — when consumers add their own eval verifiers, they don't need a separate registration path.

**Why CI gate, not audit-time only.** Initial draft proposed audit-time only, citing ADR-0078's "no LLM in CI" promise. User pushback: that promise was a cost-driven heuristic, not a principle. If a contract is real, it gates merges — otherwise it's advisory, which is the trap invariant-driven dev was built to escape. Cost is bounded by SHA cache (unchanged skills don't re-run), epoch limits (default 3 samples), and reducer thresholds (default `at_least_2_of_3`). ADR-0078's "no LLM in CI" is amended: LLMs run in CI when the contract is genuinely LLM-judged, gated by cache so the recurring cost on unchanged skills is zero.

**Why custom Go runner, not Inspect-AI.** Inspect-AI was researched in detail (see Appendix). It's the most credible agent-eval framework, AISI-backed, actively maintained, but the fit is wrong: Python 3.10+ with ~35 deps (AWS SDK, terminal UI, debug server) on a Go methodology; no first-class CI pass/fail gate (`eval_set().success` reports task-completion, not score-threshold); no SHA cache (only model-response cache); no documented subprocess-as-SUT pattern (custom `@agent` wrapping `subprocess.run` is undocumented territory); pre-1.0 API churn (220 releases on 0.3.x). Building thin in Go (~300-500 LOC) preserves the methodology's zero-dep stance and gives full control over the gate semantics. Inspect's *design* informs the runner — epochs/reducers, log format, scorer vocabulary — but the dependency is studied, not adopted.

**Why declarative YAML eval format, not Python `@task` files.** Inspect's Python-first format is more expressive but locks consumers into Python and into Inspect's type system. Declarative YAML is diff-friendly, cache-friendly, framework-agnostic, and survives runner replacement. The tradeoff is expressiveness: complex multi-turn agent loops are easier in Python. Day-1 evals are simple ("run this skill against this input, score this output"), so YAML suffices. If complex agent loops are needed later, the eval YAML can declare a Python or Go custom-scorer file as a verifier path.

**Why testing surface = "skill in the harness" not "raw LLM with SKILL.md as prompt."** A skill's behavior depends on the harness (Claude Code's tool use, subagents, hooks, model selection). Testing the skill against a raw `messages.create()` call doesn't validate what consumers actually run. The eval YAML's `harness.command` template lets each consumer name their invocation (Claude Code uses `claude --print`; future consumers may differ). The runner shells out; the harness is opaque to it.

**Why cache by composite SHA, including model identifier.** Single-input cache keys don't survive model upgrades: a skill that passed on claude-opus-4-7 may fail on claude-opus-4-8 even if SKILL.md is unchanged. Including model in the cache key forces re-runs on model changes, which is the right behavior (a new model is a different SUT). The cache-bust flag (`--bust-cache`) exists for explicit re-validation without changing inputs.

**Why cache files in git, eval-runs gitignored.** Cache files are small JSON (≤2KB each), share across CI and local dev, and represent durable verifier state — same justification as committed lockfiles. Eval-runs are large (raw model outputs), per-run, and incidental — gitignoring keeps the repo small. The cache is the contract's executable state; eval-runs are the audit trail.

**Why mutation-tester extension into skill text, not just verifier code.** Under invariant-driven dev with eval verifiers, the "code" being checked is the SUT — for skill invariants, that's SKILL.md. Mutating verifier code (`go-mutesting` on `*_test.go`) was Layer 3's original job. Mutating SKILL.md is the natural extension when the verifier is an eval: a deliberate removal of "walk user flows during Q&A" from SKILL.md must cause the corresponding eval to fail. If it doesn't, the eval doesn't actually bite — same diagnostic as a static verifier that doesn't catch a mutation.

**Why role-boundary contracts on invariant-compiler and dev-harness belong in this ADR (not ADR-0081 or ADR-0078).** During ADR-0081's authoring, four role-boundary rules emerged: invariant-compiler authors only `_test.go` and `_interface.go` files; doesn't define test scaffolding; leaves the build red for foundational ADRs; dev-harness never edits test or interface files. These are *behavioral* claims about agents — "the subagent, given canned input X, produces output Y" — not static claims about data or files. Static verifiers can't enforce them: agents are LLMs, output varies per invocation, deterministic check on a single commit doesn't capture the policy. Only an eval verifier — run the agent against canned inputs and score the output's conformance — can register these as real contracts. So they wait for this ADR's eval mechanism to land. Without that mechanism they're prompt-level discipline (which failed twice during ADR-0081's authoring: I gave invariant-compiler the wrong rules in two consecutive dispatches, and only the user catching it kept the contract honest). Registering them as eval-verified invariants mechanically enforces what discipline alone misses.

**Why register four separate invariants rather than one umbrella "agents follow their role boundaries."** Each rule's failure mode is distinct: file-scope violations look like a `.go` file edit in an invariant-compiler commit; scaffolding violations look like a `noopValidator` type definition in `_test.go`; undefined-symbol violations look like a commit that adds production-side stubs to make build pass; dev-harness test-edit violations look like a `*_test.go` change in a dev-harness commit. Per ADR-0078's independence rule, each is a separate claim because each can fail independently (and each has its own eval rubric). Lumping them into "agents follow boundaries" would conflate the signal — when the umbrella eval fails, you can't tell which boundary leaked.

## Open questions

- **Eval-runner concurrency**: serial across evals is slow on large registries; parallel hits API rate limits. Default: serial Day-1 (simplest, predictable). Worth registering an invariant about it?
- **LLM-judge model selection**: which model judges? Same model as the harness (cheap, but may share biases), a stronger model (better judge, more cost), or per-eval declarable? Current draft: per-eval declarable, with a default in `spec-driven-config.json`. Worth a Decisions row?
- **Eval rubric authoring discipline**: `invariant-compiler` authors the YAML stub from the invariant statement. The LLM-judge `prompt` field is generated text — what catches rubric drift between invariant `definition` and eval `prompt`? Current draft: audit chain Layer 2 covers this. Is that sufficient, or should the registry track `definition_sha` and `prompt_sha` to surface drift even without a Layer 2 run?
- **Failure attribution discipline**: when an eval fails, is it the skill (real bug), the rubric (test bug), the harness (config issue), or the model (model regression)? The result file has the raw outputs; a human triages. Worth a documented triage rule, or is it inherently judgment-based?
- **First non-skill consumer**: when this ADR ships, are there candidate agent-behavior invariants worth registering immediately (e.g. `methodology.invariant_compiler.verifier_compiles`), or wait for a real demand signal?
- **Cross-model evals**: should the same eval run against multiple models in CI (compare outputs)? Defer for now; useful if the methodology grows model-portability claims.

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| End-to-end: register an eval-verified invariant | Author the invariant in an ADR, run /compile-invariants, eval YAML stub appears, sdd verify runs sdd eval, result file written | Manual: author registry.yaml entry + ADR delta; commit; run sdd verify | /compile-invariants, invariant-compiler, sdd verify, sdd eval, registry |
| Cache hit on unchanged skill | Re-running sdd verify without skill/harness/yaml changes returns cached results, no API calls | Pre-populate cache; assert no network activity | sdd eval cache, sdd verify |
| Cache invalidation on skill edit | Edit /plan-feature/SKILL.md; re-run sdd verify; cache misses; new eval run executes | Modify SKILL.md, re-run verify | Cache, sdd eval |
| Cache invalidation on model upgrade | Change the model identifier in eval YAML; cache misses; new run executes | Modify model field, re-run | Cache key construction |
| Threshold-edge result | An eval with epochs=3, reducer=at_least_2_of_3, samples passing [pass, pass, fail] reports pass=true | Synthetic eval with stub scorer behavior | sdd eval reducer logic |
| Harness command-not-found | sdd eval reports clear error when `claude` (or harness command) is not on PATH | Run in env without harness installed | Error handling |
| Layer 2 audit catches rubric drift | Audit chain Layer 2 reads eval YAML, reconstructs invariant from scorers, flags when reconstruction diverges from definition | Synthetic eval with deliberately drifted prompt | invariant-testing-evaluator |
| Layer 3 mutation catches non-biting eval | Mutate SKILL.md to remove the user-flow-walkthrough mandate; corresponding eval must fail | Synthetic SKILL.md mutation | mutation-tester, sdd eval |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `sdd eval` Go subcommand | ~400-600 | 100k | Cache, harness invocation, scorer engine, JSON result |
| Eval YAML schema + parser | ~200 | 40k | Pydantic-style validation in Go |
| LLM-judge scorer (Anthropic SDK call) | ~150 | 30k | API wrapper, retry/backoff |
| Programmatic scorers (regex, pattern, includes) | ~100 | 25k | Pure Go, no external deps |
| Reducer logic (pass_at_k, at_least_n, mean, mode) | ~80 | 20k | Pure functions |
| SHA cache | ~120 | 30k | Composite hash, JSON read/write, atomic file ops |
| `sdd verify` dispatch update | ~30 | 10k | Add eval-path glob to dispatch loop |
| `/compile-invariants` eval-YAML stub authoring | ~200-300 | 60k | invariant-compiler subagent extension |
| `/audit-invariants` Layer 2 extension (rubric audit) | ~150 | 50k | invariant-testing-evaluator prompt extension |
| `/audit-invariants` Layer 3 extension (skill mutation) | ~250 | 70k | mutation-tester prompt extension + SKILL.md mutator |
| `methodology.plan_feature.user_flow_walkthrough` eval YAML | ~80 | 30k | First skill eval; canned input + rubric |
| `methodology.compile_invariants.file_scope` eval YAML | ~100 | 35k | Agent-behavior eval: harness runs invariant-compiler on a canned ADR, scorer checks the resulting commit's diff against allowed file patterns (regex match on file paths). |
| `methodology.compile_invariants.no_test_scaffolding` eval YAML | ~90 | 30k | Agent-behavior eval: scorer scans authored `_test.go` files for `type *Validator struct{}` patterns and ad-hoc method definitions. |
| `methodology.compile_invariants.references_undefined_symbols` eval YAML | ~80 | 30k | Agent-behavior eval: scorer runs `go build` on the post-commit state; PASS iff build fails with "undefined" errors (foundational ADR signal). |
| `methodology.dev_harness.test_files_not_edited` eval YAML | ~90 | 30k | Agent-behavior eval: harness runs dev-harness against a fixture with failing tests, scorer asserts no `_test.go` or `_interface.go` files appear in the resulting diff. |
| `/plan-feature` user-flow-walkthrough mandate text | ~30 | 20k | Skill text update |
| New invariants in registry (9 entries) + verifiers | ~450 | 90k | dispatch + yaml_well_formed + cache_keys + sdd_eval_subcommand + plan_feature.user_flow_walkthrough + 4 role-boundary entries |
| Documentation in `context.md` | ~50 | 15k | Distributed plugin payload |

**Total estimated tokens**: ~720k
**Estimated wall-clock**: ~6-8 days of dev-harness work, paced by the harness-shell-out pattern (first non-trivial Go subcommand that invokes another CLI) and the four agent-behavior eval YAMLs (canned ADR fixtures + scorer authoring).

---

## Appendix A — Inspect-AI Research

This appendix records the research that drove the "custom Go runner, not Inspect-AI" decision. Preserved verbatim because the decision will be revisited if Inspect-AI's gaps close.

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
`--epochs N` for N samples. `--epochs-reducer mean|median|mode|max|at_least_n|pass_at_k` for variance handling. Strong design that this ADR's Go runner adopts directly. **No first-class pass/fail threshold across an eval set.**

### Result format
`.eval` (compressed binary, ~1/8 size of JSON) or `.json`, written to `./logs/`. Configurable to S3 or Azure Blob. Programmatic access via `EvalLog`.

### Caching
Caches **model API responses**, not eval runs. Key includes model + messages + epoch + generation config + tools. **No SHA-of-skill-file cache**; the "skip evals for unchanged skills" layer must be built externally.

### Bottom line (from research)
> Inspect-AI is the most credible, actively-maintained agent-eval framework in the ecosystem and technically capable of being the eval verifier mechanism — but it imposes a Python runtime on a Go methodology, ships no SHA-of-input cache, exposes no first-class pass/fail CI gate, and offers no documented pattern for wrapping `claude --print` as the SUT. Recommend treating Inspect as a reference implementation to study, not a dependency to adopt: for Day-1, define the eval verifier as a path-extension dispatch (e.g. `*.eval.yaml` → in-tree Go runner that calls Anthropic API + simple scorers + SHA cache) and revisit Inspect only if the eval requirements outgrow what 200 lines of Go can express.

### Sources
- [Inspect AI docs](https://inspect.aisi.org.uk/)
- [UKGovernmentBEIS/inspect_ai on GitHub](https://github.com/UKGovernmentBEIS/inspect_ai)
- [Agents](https://inspect.aisi.org.uk/agents.html), [Custom agents](https://inspect.aisi.org.uk/agent-custom.html), [Tasks](https://inspect.aisi.org.uk/tasks.html), [Scorers](https://inspect.aisi.org.uk/scorers.html), [Eval logs](https://inspect.aisi.org.uk/eval-logs.html), [Eval sets](https://inspect.aisi.org.uk/eval-sets.html), [Caching](https://inspect.aisi.org.uk/caching.html), [Options](https://inspect.aisi.org.uk/options.html)
- pyproject.toml, requirements.txt, PyPI listing, tags page
