# ADR: Eval as a Verifier Mechanism (LLM-Behavior Contracts)

**Status**: draft
**Status history**:
- 2026-05-11: draft

## Overview

Add **eval** as a verifier mechanism in the invariant-driven development taxonomy: a way to register contracts on LLM-driven behavior (skills, agents, methodology processes) where the verifier runs the SUT against canned inputs and scores the outputs using a mix of programmatic scorers (regex, JSON-shape, contains-substring) and LLM-judge scorers (rubric prompt + grade pattern). LLM-judge scorers are non-deterministic by nature; variance is bounded by `epochs` (N samples) + `reducer` (e.g. `at_least_2_of_3`).

**Day-1 framework: Inspect-AI + `inspect_swe`.** Inspect-AI (UK AISI) is the eval framework; `inspect_swe` (Meridian Labs) is the official agent suite that ships `claude_code()` as a first-class Inspect solver (along with `codex_cli()`, `gemini_cli()`, `opencode()`, `mini_swe_agent()`). Evals are authored as native Inspect `@task` Python files using `claude_code()` as the solver with `sandbox="local"` (no containerization Day-1; Inspect supports 7 sandbox types including `local` for direct host execution). The methodology ships NO runner, NO eval format, NO subprocess wrapper. `sdd verify` dispatches eval verifiers to the Inspect CLI via the project's `verify[]` configuration (per ADR-0078's existing pattern for per-mechanism runners). Future eval frameworks (Promptfoo, MLflow, LangFuse) plug in via additional `verify[]` entries and use their own native formats — no methodology-imposed wrapper format, no Go-interface plugin registry.

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
| Framework support model | **Each framework brings its own native format; dispatch via `verify[]` shell commands.** Day-1 framework = Inspect-AI; evals are native Inspect `@task` Python files. Future frameworks (Promptfoo, MLflow, LangFuse) use their own native formats and conventions; each adds a `verify[]` entry pointing to the framework's CLI. The methodology imposes no unified eval schema, no wrapper format, no Go-interface plugin registry. This mirrors ADR-0078's existing taxonomy: each tool brings its native format (`*.go::Func` → `go test`, `*.semgrep.yml` → `semgrep`, `*_eval.py` → `inspect eval-set`). | ADR-0078 explicitly rejected centralizing dispatch into a Go adapter framework. Inventing a methodology-imposed format wrapper for each external framework would re-introduce that adapter problem — the methodology would have to ship and maintain a translator between its synthesized format and each framework's native one. Letting each framework keep its native format eliminates that translation. The methodology ships zero runner code; it ships authored evals (in the chosen frameworks' native formats) and the registry/dispatch wiring. |
| Day-1 framework | **Inspect-AI + `inspect_swe`, `sandbox="local"` default.** Inspect-AI (UK AISI, MIT-licensed) is the framework. `inspect_swe` (Meridian Labs) ships `claude_code()` as a first-class Inspect solver. Evals are authored as `@task`-decorated Python files under `<project>/spec/evals/`, with `solver=claude_code(...)` and `sandbox="local"` (no containerization Day-1). Inspect's built-in `pattern` / `model_graded_qa` / `includes` / `match` scorers cover programmatic + LLM-judge cases. Inspect's `--epochs N` + `--epochs-reducer at_least_n` handle variance. Inspect's model-response cache covers the "don't re-call the API on identical messages" case. | The earlier draft proposed building a custom Go runner Day-1, then writing a custom @solver wrapping `claude --print` (Inspect's docs flagged this as undocumented territory). User rejected both: don't invent a runner, don't invent a subprocess wrapper, when Meridian Labs already ships `inspect_swe.claude_code()` as the documented pattern. Adopting Inspect-AI + `inspect_swe` together removes (a) the ~500-700 LOC methodology-owned runner, (b) the ~30-60 LOC custom subprocess @solver, and (c) the "undocumented territory" caveat. Costs: Python 3.10+ verify-env dependency and `inspect_swe`'s install. NO Docker dep Day-1 — `sandbox="local"` runs on the host directly (Inspect-AI documents this mode explicitly: "Local file system (no sandbox)"). Consumer projects with stricter isolation needs can switch to `sandbox="docker"` per-project. |
| Score-threshold gating | Inspect's `eval_set()` returns `success` = "tasks completed without error," not "scores ≥ threshold." `sdd verify` must surface an eval as FAIL when scorer pass-rate is below threshold even if Inspect's own exit code is 0. **Day-1 mechanism**: a thin Python helper (`scripts/inspect-gate.py`, ~30-50 LOC) shipped with the methodology that calls `inspect_ai.log.read_eval_log()`, inspects the per-task pass/fail, and exits non-zero if any registered eval is below its declared threshold. The project's `verify[]` invokes `inspect eval-set ...` followed by `python scripts/inspect-gate.py <eval-log-dir>` — or a single wrapper command that does both. This helper uses Inspect's documented `EvalLog` API; it isn't a runner replacement. | This is the one real gap Inspect doesn't natively cover (its success flag doesn't gate on scores). The fix is small (read the eval log, gate on threshold) and uses Inspect's own public API. Closing the gap is "using Inspect properly," not "making shit up." |
| `sdd verify` is the single entrypoint | **`sdd verify` runs everything via its existing `verify[]` shell-out mechanism** (ADR-0078). The project's `verify[]` includes one entry that invokes Inspect (e.g. `"inspect eval-set <project>/spec/evals && python scripts/inspect-gate.py <project>/spec/eval-logs"`). No `sdd eval` subcommand, no eval-specific built-in handling inside `sdd verify`. Local iteration: contributors can comment out the Inspect line in `verify[]` or run `sdd verify --no-shell` (a future flag if needed). | Reverts to ADR-0078's existing "`sdd verify` does structural validation universally; project-specific runners are config-driven shell commands" model. The earlier draft extended `sdd verify` with built-in eval handling because there was no project-native tool to shell to; with Inspect-AI adopted, there IS such a tool, and ADR-0078's existing model applies cleanly. |
| Eval format | **Inspect-AI's native `@task` Python files.** No methodology-imposed YAML or JSON schema. Each eval is one or more Python files defining `@task` functions that return `Task(dataset=..., solver=..., scorer=...)`. The methodology documents conventions (where files live; how to name @task functions to match invariant IDs) but does not define a new format. | The methodology learned from Inspect rather than redesigning around it. Inspect's `@task`/`Task`/scorer/reducer design is the proven shape; adopting it directly removes one layer of indirection (no methodology→Inspect translation). The path extension `_eval.py` (or `*.py` under `<project>/spec/evals/`) is the dispatch carrier. |
| Scorer + variance | **Use Inspect-AI's native vocabulary**: `includes`, `match`, `pattern`, `model_graded_qa`, `model_graded_fact`, `f1`, `exact`, etc. For variance: `inspect eval-set ... --epochs 3 --epochs-reducer at_least_2_of_3`. No methodology-side reimplementation. | Inspect's vocabulary is mature and the right baseline; adopting it preserves Inspect's invariants (scorers compose naturally, epochs are well-tested). The methodology adds zero new scorer types Day-1. |
| Cost discipline (caching) | **Day-1: rely on Inspect-AI's model-response cache** (caches API responses keyed by model + messages + epoch + generation config). A methodology-side SHA-of-input cache is **deferred** to a follow-up ADR if the recurring CI cost on unchanged skills proves painful. Inspect's cache handles the cheap case (re-running with no input changes hits its API cache); methodology cache would only help if Inspect's API cache turns out to be too coarse-grained in practice. | Earlier draft built a SHA cache (composite of harness + skill + eval-yaml + input + model) to ensure unchanged commits never pay LLM tokens. With Inspect-AI adopted, Inspect's own cache already covers most of this — the gap (cache survival across model identity changes, cache shared via git) is real but unproven. Defer the methodology cache until there's a cost incident; don't pre-build infrastructure for a hypothetical problem. |
| LLM-judge model selection | **Inspect-AI's native per-scorer `model=` argument.** Each `model_graded_qa()` call names its judge model (e.g. `model_graded_qa(model="anthropic/claude-sonnet-4-6")`). The project's CI environment selects a default via the `INSPECT_EVAL_MODEL` env var. No methodology-side `eval.judge_model` config block. | Use Inspect's existing mechanism. The earlier `eval.judge_model` config block was a layer of indirection on top of what Inspect already provides; redundant. |
| Concurrency | **Inspect-AI's `--max-tasks` / `--max-samples` / `--max-connections` flags.** Inspect's concurrency model owns parallelism for eval execution. The methodology does not impose a concurrency model. | Inspect already has well-tested parallelism controls; reusing them avoids a parallel concurrency model. |
| Audit chain Layer 2 (statement-↔-verifier) extension | Now also audits **eval rubrics**: `invariant-testing-evaluator` reads the eval YAML and reconstructs the invariant statement from the scorers' assertions; diffs against the registered `definition`. Catches drift where the eval no longer tests what its invariant claims. **The LLM-judge `prompt` is treated as the validator** — not as a translation of the definition. `/compile-invariants` authors it; Layer 2 audits it; no separate SHA tracking on the registry, no pre-flight prompt-vs-definition diff. | Treating the prompt as the validator is the right framing: for static verifiers, the test code IS the executable contract — nobody asks for `definition_sha` and `test_code_sha` side by side. The same logic applies to eval prompts. Drift between prompt and definition is exactly the failure Layer 2 was built to catch (under-constraining, over-constraining, non-asserting verifiers); extending it to eval YAML is a natural fit and avoids per-invariant SHA bookkeeping. |
| Audit chain Layer 3 (mutation tester) extension | Mutation tester now also mutates **skill text**: a deliberate edit to SKILL.md that removes the user-flow-walkthrough instruction MUST cause the corresponding eval to fail. Eval that doesn't catch its skill mutation = eval doesn't actually bite. | Mutation testing was previously about verifier code; under invariant-driven dev with eval verifiers, the "code" being mutation-tested is the skill (the SUT). Audit-only; never a CI gate. |
| First consumers | (1) Skill behavior contract: `methodology.plan_feature.user_flow_walkthrough`. (2) Four agent-behavior role-boundary contracts surfaced by ADR-0081: `methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}` and `methodology.dev_harness.test_files_not_edited`. (3) One Layer 2 self-audit contract: `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`. All authored as Inspect `@task` Python files under `<project>/spec/evals/<name>_eval.py`. | Six evals Day-1 is enough to validate the mechanism across three consumer surfaces (skills, subagents, audit-chain agents) and exercise both same-author and adversarial scoring shapes. Adding the role-boundary contracts catches the exact failure modes ADR-0081's authoring revealed; adding the self-audit eval closes the regress-the-auditor loop. Other skill disciplines deferred to follow-up ADRs as they emerge. |

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
- **`scripts/inspect-gate.py`**: ~50-80 LOC helper that reads Inspect's `.eval` log directory via `inspect_ai.log.read_eval_log()` and aggregates three failure modes into a single non-zero exit:
  1. No logs found → "Inspect didn't run or wrote no logs at `<dir>`."
  2. A task's log shows `status != "success"` (Inspect-side failure: crash, timeout, API error) → "Inspect didn't complete task X (status=error)."
  3. A task completed but its post-reducer aggregate is INCORRECT → "Task X scored INCORRECT for invariant `<id>`."

  Exits zero only when every registered task has `status="success"` AND aggregate=CORRECT. This is the **only** Python code the methodology ships; it closes Inspect's CI-score-gating gap AND consolidates failure attribution so `verify[]` can be one entry. **(in scope)**
- **Eval task files**: six Inspect `@task` Python files under `<project>/spec/evals/` for the Day-1 invariants. Each authors its `@task` function, dataset (canned inputs), `solver=claude_code(...)` for skill/agent SUTs, and scorers (binary: pattern-matching `^(PASS|FAIL)` for LLM-judge, deterministic asserts for programmatic). **(in scope)**
- **Eval log directory**: `<project>/spec/eval-logs/`, gitignored. Per-run `.eval` files written by Inspect. **(in scope)**

### `sdd verify` integration

- `sdd verify` reuses ADR-0078's existing `verify[]` shell-out mechanism: the project's `verify[]` includes the inspect-then-gate invocation. No new built-in eval handling inside `sdd verify`. No new `sdd verify` flags Day-1. **(in scope)**
- Missing API key (e.g. `ANTHROPIC_API_KEY`) → Inspect reports an error; the gate helper surfaces it as a SKIPPED status with a warning; the `verify[]` shell command exits non-zero (Inspect's own behavior) but the methodology may choose to treat it as informational by wrapping in `|| true` in the verify entry. Documented as a setup convention, not enforced. **(in scope)**
- `sdd verify` reports per-eval pass/fail via the shell command's stdout/stderr stream, just like any other `verify[]` entry. **(in scope)**

### Future framework support

- A future ADR introducing an additional eval framework (Promptfoo, MLflow, LangFuse, Braintrust) adopts that framework's **native** file format and CLI; adds another `verify[]` entry; no methodology-imposed wrapper. Each framework owns its own format, scorer vocabulary, variance handling, and caching. **(out of scope for v1)**

### Audit chain

- **Layer 2 extension**: `invariant-testing-evaluator` agent prompt extended to handle Inspect `@task` Python files (reconstructs invariant statement from the task's scorers — rubric prompts, programmatic asserts — not just from Go test code). **(in scope)**
- **Layer 3 extension**: `mutation-tester` agent extended to mutate skill text (line-by-line edits to SKILL.md) and re-run Inspect over impacted evals. Audit-only. **(in scope)**

### Skills

- `/compile-invariants` extended to recognize eval verifier paths (`*_eval.py::task_name`) and author Inspect `@task` Python stubs (instead of Go test functions). **(in scope)**
- `/plan-feature/SKILL.md` extended with user-flow-walkthrough mandate (the first eval-verified discipline). **(in scope)**
- `setup/SKILL.md` extended to bootstrap the Python verify-env (`pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set `INSPECT_EVAL_MODEL` default). No Docker check Day-1 — `sandbox="local"` is the default. **(in scope)**

### Configuration

`spec-driven-config.json` adds the Inspect invocation to `verify[]` as a single composed shell entry; the gate handles both Inspect-side failures and score failures via the eval logs, so a single `;`-separated entry suffices:

```json
{
  "spec": { ... },
  "verify": [
    "go test ./...",
    "inspect eval-set <project>/spec/evals --log-dir <project>/spec/eval-logs --epochs 3 --epochs-reducer at_least_n,2 ; python scripts/inspect-gate.py <project>/spec/eval-logs"
  ],
  "dispatch": { }
}
```

The composed entry's exit code is the gate's exit code (last command in `;` wins). The gate's three failure modes (no logs, task `status != "success"`, task aggregate INCORRECT) cover both Inspect-side crashes and score failures — so losing Inspect's exit code via `;` doesn't lose information. The methodology's setup skill seeds this template; projects edit it to add their own commands. The `dispatch{}` block remains for external commands per ADR-0078's existing rule.

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

Inspect writes per-run `.eval` logs to `<project>/spec/eval-logs/`. Accessed programmatically via `inspect_ai.log.read_eval_log()`. The methodology does not redefine or wrap this format.

### Task-to-invariant mapping convention

The methodology requires the `@task` function name to match the invariant ID's final segments (with `.` → `_`). E.g. invariant `methodology.plan_feature.user_flow_walkthrough` → `@task def plan_feature_user_flow_walkthrough()`. The file path follows: `<project>/spec/evals/plan_feature_user_flow_walkthrough_eval.py`. This naming convention is the methodology's only addition; it lets `scripts/inspect-gate.py` map Inspect task results back to registered invariants without per-task metadata.

## Error Handling

- **`inspect` CLI not on PATH**: `sdd verify` surfaces the shell exit code; the `verify[]` entry fails. Setup skill includes `which inspect` in its bootstrap check; documented in the project's installation guide.
- **Python verify-env not installed**: same — shell exit code surfaces. Setup skill bootstraps `pip install inspect-ai`.
- **Inspect task module import error**: Inspect itself surfaces the error and exits non-zero. Common cause: an authored `@task` file references an undefined solver or scorer; `/compile-invariants` catches these by attempting `python -c "import <task_module>"` after authoring.
- **LLM API errors (rate limit, auth, network)**: Inspect's own retry / fail logic applies (configurable per-task). Methodology does not override.
- **Gate helper finds no logs**: `scripts/inspect-gate.py` exits non-zero with "no eval logs found" message; indicates Inspect didn't actually run.
- **Below-threshold result**: gate helper exits non-zero, names the failing invariant ID, prints the offending task's pass-rate vs threshold.

## Security

- **Inspect logs gitignored**: `<project>/spec/eval-logs/` contains raw model outputs from real runs; may include incidental PII or sensitive context. Default `.gitignore` template excludes it.
- **API keys**: Inspect uses standard provider env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.). If the key is absent, Inspect itself fails and the `verify[]` entry exits non-zero. Day-1 behavior is "hard fail with clear error from Inspect"; soft-skip is NOT a methodology-side feature (the methodology defers to Inspect's error reporting). The setup skill documents how to set the key and how to skip evals locally (comment out the inspect line in `verify[]`) for contributors without API access.
- **Sandbox mode**: Day-1 uses `sandbox="local"` — Claude Code runs directly on the host with no containerization. Same risk model as a developer running `claude` themselves. Skill mounts are explicit: `claude_code(skills=[...])`. For stricter isolation (untrusted skills, shared CI runners), consumers switch to `sandbox="docker"` per-eval. The methodology does not enforce a sandbox mode beyond seeding `"local"` as the Day-1 default.

## Impact

- No new code inside `sdd verify`. Methodology ships one ~30-50 LOC Python helper (`scripts/inspect-gate.py`) plus authored Inspect `@task` files.
- Extends `/compile-invariants` (new mechanism: author Inspect `@task` Python stubs). Extends `/audit-invariants` (Layer 2 + 3 work on Python files). Extends `/plan-feature` (first eval-verified discipline). Extends `setup/SKILL.md` (Python verify-env bootstrap).
- Adds Python 3.10+ as a project verify-env dependency. Adds `inspect-ai` to the project's Python deps.
- ADR-0079's parking lot loses one item ("evals as audit ritual extension") since it's now scoped to this ADR.
- ADR-0078's "no LLM in CI" promise is explicitly amended (see Decision history). ADR-0078's "config-driven shell commands" model is preserved as-is — Inspect-AI is just another `verify[]` entry.

## Scope

**In v1:**
- `eval` as a registered verifier mechanism, with Inspect-AI + `inspect_swe` as the Day-1 framework stack. Verifier paths follow Inspect's native form: `<project>/spec/evals/<name>_eval.py::<task_function>`.
- Six first evals authored as Inspect `@task` Python files using `inspect_swe.claude_code()` as the solver: one skill-behavior contract (`methodology.plan_feature.user_flow_walkthrough`), four agent-behavior role-boundary contracts (`methodology.compile_invariants.{file_scope, no_test_scaffolding, references_undefined_symbols}`, `methodology.dev_harness.test_files_not_edited`), and one self-audit contract (`methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`).
- All Day-1 evals use binary scorers (`pattern(r'^(PASS|FAIL)')` for LLM-judge, deterministic asserts for programmatic) so each task aggregate is CORRECT or INCORRECT — no per-eval threshold concept (Inspect doesn't define one).
- `scripts/inspect-gate.py`: ~30-50 LOC helper that uses Inspect's `read_eval_log()` to gate on "every task aggregate is CORRECT." The methodology's only Python contribution beyond authored evals.
- No methodology-shipped subprocess solver. Skill/agent SUTs use `inspect_swe.claude_code()` directly.
- `/compile-invariants` extended to author Inspect `@task` Python stubs using `inspect_swe.claude_code()` (alongside Go test functions).
- `/audit-invariants` Layer 2 + 3 extensions adapted to read Inspect `@task` files and `.eval` logs.
- `setup/SKILL.md` extended to bootstrap the Python verify-env (`pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set `INSPECT_EVAL_MODEL`). No Docker dependency Day-1 — `sandbox="local"` runs Claude Code directly on the host.

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

### Added

```yaml
- id: methodology.config.verify_includes_inspect
  definition: `spec-driven-config.json`'s `verify[]` array contains an entry that invokes `inspect eval-set` over `<project>/spec/evals/` followed by `python scripts/inspect-gate.py` over the resulting log directory (within the same shell entry separated by `;`, or as two consecutive entries). This is the dispatch wiring for eval verifiers Day-1.
  verifier: src/sdd/spec/config_test.go::TestVerifyIncludesInspect
  requires:
    - methodology.config.verify_array_well_formed
  glossary_terms: []
  status: active

- id: methodology.eval.task_naming_matches_invariant_id
  definition: Every Python module under `<project>/spec/evals/` matching `*_eval.py` exports a `@task`-decorated function whose name matches the suffix of an active registry entry's invariant_id (with `.` replaced by `_`); the file basename also follows the convention `<task_function>_eval.py`.
  verifier: src/sdd/spec/eval_test.go::TestEvalTaskNamingMatchesInvariantID
  requires:
    - methodology.config.spec_registry
  glossary_terms: []
  status: active

- id: methodology.eval.inspect_gate_aggregates_failure_modes
  definition: `scripts/inspect-gate.py`, given an Inspect log directory, exits non-zero in three cases (with a labeled message naming the failing invariant_id where applicable): (1) the log directory contains zero `.eval` files (Inspect didn't run); (2) any task's log has `status != "success"` (Inspect-side failure: crash, timeout, API error); (3) any task's post-reducer aggregate is INCORRECT. Exits zero only when every registered task has `status="success"` AND aggregate=CORRECT.
  verifier: src/sdd/spec/eval_test.go::TestInspectGateAggregatesFailureModes
  requires:
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active

- id: methodology.plan_feature.user_flow_walkthrough
  definition: The /plan-feature skill, when given an ADR draft with a User Flow section, generates Q&A probing each flow step for the contract it commits to.
  verifier: src/sdd/spec/evals/plan_feature_user_flow_walkthrough_eval.py::plan_feature_user_flow_walkthrough
  requires:
    - methodology.config.verify_includes_inspect
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active

- id: methodology.plan_feature.audit_until_clean
  definition: The /plan-feature skill, when running the design audit step, re-invokes the decision-invariant-evaluator after each round of fixes (factual or design-decision) and does not commit the ADR to status `accepted` until the evaluator returns CLEAN. Findings labeled "non-blocking," "cosmetic," or "minor" by the evaluator do not authorize skipping the re-audit — only a CLEAN verdict authorizes the commit.
  verifier: src/sdd/spec/evals/plan_feature_audit_until_clean_eval.py::plan_feature_audit_until_clean
  requires:
    - methodology.config.verify_includes_inspect
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active

- id: methodology.invariant_testing_evaluator.flags_under_constraining_verifiers
  definition: The invariant-testing-evaluator agent, when given an eval whose scorers fail to fully express the registered invariant's definition (e.g. scorer pass-by-default, scorer omitting a clause of the contract), produces a Layer 2 audit finding that identifies the under-constraining scorer and the missing clause.
  verifier: src/sdd/spec/evals/invariant_testing_evaluator_flags_under_constraining_verifiers_eval.py::flags_under_constraining_verifiers
  requires:
    - methodology.config.verify_includes_inspect
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active

# Role-boundary contracts: agent-behavior invariants on invariant-compiler and
# dev-harness. Surfaced during ADR-0081 authoring (validator-single-source);
# they're behavioral claims about the agents, not data-shape claims, so they
# need eval verifiers (not static AST scans). Registered here because ADR-0080
# is the eval-as-verifier-mechanism ADR.

- id: methodology.compile_invariants.file_scope
  definition: The invariant-compiler subagent, when given an ADR with an Invariant Delta block, produces a commit whose diff touches only `*_test.go`, `*_interface.go`, and `*.yaml` files (no `.go` files outside test/interface, no edits to existing production code).
  verifier: src/sdd/spec/evals/compile_invariants_file_scope_eval.py::file_scope
  requires:
    - methodology.config.verify_includes_inspect
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.no_test_scaffolding
  definition: The invariant-compiler subagent does not define ad-hoc Validator implementations (noopValidator, stubValidator, fake concrete types) in `_test.go` files. Tests reference dev-harness-owned constructors (e.g. `newValidator()`) directly; those references stay undefined until dev-harness lands.
  verifier: src/sdd/spec/evals/compile_invariants_no_test_scaffolding_eval.py::no_test_scaffolding
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.compile_invariants.references_undefined_symbols
  definition: The invariant-compiler subagent's output, for foundational ADRs that introduce new types, leaves the build red — test files reference at least one symbol (constructor, type, function) that dev-harness will create. The red build is the dispatch mechanism to dev-harness.
  verifier: src/sdd/spec/evals/compile_invariants_references_undefined_symbols_eval.py::references_undefined_symbols
  requires:
    - methodology.compile_invariants.file_scope
  glossary_terms: []
  status: active

- id: methodology.dev_harness.test_files_not_edited
  definition: The dev-harness subagent, when given a failing build and a list of failing verifiers, produces a commit whose diff does not modify any `_test.go` or `_interface.go` file. Tests are immutable to dev-harness; if a test needs to change, the fix routes through /plan-feature → /compile-invariants.
  verifier: src/sdd/spec/evals/dev_harness_test_files_not_edited_eval.py::test_files_not_edited
  requires:
    - methodology.config.verify_includes_inspect
    - methodology.eval.task_naming_matches_invariant_id
  glossary_terms: []
  status: active
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why eval as a mechanism, not a special-case audit layer.** Could have been framed as "Layer 2.5 of the audit chain" with no taxonomy expansion. Picked mechanism status because: (a) it generalizes — agent evals, process evals, journey evals all fit the same shape (canned input → LLM output → scorer); (b) it makes registry surface uniform — `verifier:` field always means "the file at this path is the executable form of the contract," whatever its dispatch is; (c) it future-proofs — when consumers add their own eval verifiers, they don't need a separate registration path.

**Why CI gate, not audit-time only.** Initial draft proposed audit-time only, citing ADR-0078's "no LLM in CI" promise. User pushback: that promise was a cost-driven heuristic, not a principle. If a contract is real, it gates merges — otherwise it's advisory, which is the trap invariant-driven dev was built to escape. Cost is bounded by SHA cache (unchanged skills don't re-run), epoch limits (default 3 samples), and reducer thresholds (default `at_least_2_of_3`). ADR-0078's "no LLM in CI" is amended: LLMs run in CI when the contract is genuinely LLM-judged, gated by cache so the recurring cost on unchanged skills is zero.

**Why Inspect-AI + `inspect_swe` Day-1, not a custom runner or wrapper.** Multiple intermediate drafts proposed building methodology-owned infrastructure: first a custom Go runner (`sdd eval` subcommand, then "in-tree-go runner inside `sdd verify`"); then a custom Python `@solver` wrapping `claude --print` since Inspect-AI doesn't document subprocess SUTs. User rejected each invention: "implement inspect-ai day 1. don't make some shit up" — and later pointed at `meridianlabs-ai/inspect_swe` which ships `claude_code()` as a first-class Inspect solver. Adopting both Inspect-AI and `inspect_swe` together removes ALL methodology-owned eval infrastructure except the gate helper: no runner code, no eval format, no subprocess solver, no Go-interface plugin registry. Costs: Python 3.10+ verify-env, `inspect_swe` install. NO Docker dependency Day-1 — Inspect-AI's `sandbox="local"` runs Claude Code directly on the host (one of Inspect's 7 documented sandbox types). Consumer projects needing stricter isolation can switch to `sandbox="docker"` or another containerized mode per-project. Future ADRs can add additional frameworks (Promptfoo, MLflow, LangFuse, Braintrust) — each via its own native format and `verify[]` entry.

**Why Inspect's native `@task` format, not a methodology YAML.** Intermediate drafts proposed a methodology-owned `*.eval.yaml` schema. User rejected: each framework brings its own native format. Inspect's `@task`-decorated Python is what Inspect users author; the methodology adopts that directly. Yes, this couples Day-1 evals to Python and to Inspect's type system — but only for evals authored in Inspect. Future framework additions don't inherit this coupling because each framework brings its own format. Inventing a methodology-wide YAML wrapper would force translation layers and re-introduce the adapter framework ADR-0078 vetoed.

**Why testing surface = "skill running inside `claude_code()`," `sandbox="local"`, not raw `messages.create()`.** A skill's behavior depends on the harness (Claude Code's tool use, subagents, hooks, model selection). Testing the skill against a raw API call doesn't validate what consumers actually run. `inspect_swe.claude_code(skills=[...])` runs Claude Code with the skill mounted — closer to real consumer behavior, and documented/maintained by Meridian Labs. Day-1 default is `sandbox="local"` (no containerization): the methodology's own evals test its own skills, so host-mode access is the same risk model as a developer running `claude` themselves. Stricter isolation (`sandbox="docker"`) is a per-project opt-in for environments where the SUT isn't trusted.

**Why defer the methodology-side SHA cache.** Earlier drafts treated a composite-SHA cache (harness + skill + eval-yaml + input + model) as load-bearing for cost control. With Inspect-AI adopted, Inspect's own model-response cache already covers the cheap case (re-running with no input changes hits Inspect's API cache). The gap (cache survival across model identity changes, cache shared via git across CI/local) is real but unproven — defer until there's a cost incident. Don't pre-build infrastructure for a hypothetical problem.

**Why mutation-tester extension into skill text, not just verifier code.** Under invariant-driven dev with eval verifiers, the "code" being checked is the SUT — for skill invariants, that's SKILL.md. Mutating verifier code (`go-mutesting` on `*_test.go`) was Layer 3's original job. Mutating SKILL.md is the natural extension when the verifier is an eval: a deliberate removal of "walk user flows during Q&A" from SKILL.md must cause the corresponding eval to fail. If it doesn't, the eval doesn't actually bite — same diagnostic as a static verifier that doesn't catch a mutation.

**Why role-boundary contracts on invariant-compiler and dev-harness belong in this ADR (not ADR-0081 or ADR-0078).** During ADR-0081's authoring, four role-boundary rules emerged: invariant-compiler authors only `_test.go` and `_interface.go` files; doesn't define test scaffolding; leaves the build red for foundational ADRs; dev-harness never edits test or interface files. These are *behavioral* claims about agents — "the subagent, given canned input X, produces output Y" — not static claims about data or files. Static verifiers can't enforce them: agents are LLMs, output varies per invocation, deterministic check on a single commit doesn't capture the policy. Only an eval verifier — run the agent against canned inputs and score the output's conformance — can register these as real contracts. So they wait for this ADR's eval mechanism to land. Without that mechanism they're prompt-level discipline (which failed twice during ADR-0081's authoring: I gave invariant-compiler the wrong rules in two consecutive dispatches, and only the user catching it kept the contract honest). Registering them as eval-verified invariants mechanically enforces what discipline alone misses.

**Why register four separate invariants rather than one umbrella "agents follow their role boundaries."** Each rule's failure mode is distinct: file-scope violations look like a `.go` file edit in an invariant-compiler commit; scaffolding violations look like a `noopValidator` type definition in `_test.go`; undefined-symbol violations look like a commit that adds production-side stubs to make build pass; dev-harness test-edit violations look like a `*_test.go` change in a dev-harness commit. Per ADR-0078's independence rule, each is a separate claim because each can fail independently (and each has its own eval rubric). Lumping them into "agents follow boundaries" would conflate the signal — when the umbrella eval fails, you can't tell which boundary leaked.

**Why `methodology.plan_feature.audit_until_clean` belongs here, not in ADR-0081 or ADR-0082.** Surfaced during ADR-0082 authoring: I (the master session) committed an ADR to status `accepted` when the design audit had returned "PASS with two minor findings (not CLEAN)" — substituting my own judgment that the findings were "non-blocking" for the methodology's structural rule (re-audit until CLEAN). User caught it. The failure mode is behavioral: a *master session's* shortcut of the audit-CLEAN loop, not a static violation of file structure or registry shape. Like the four role-boundary contracts above, the rule can't be enforced by AST scans or commit-diff checks because it's about WHEN the master session commits relative to WHAT the evaluator returned — that requires running the master session against a fixture where the audit returns PASS-but-not-CLEAN and scoring whether it re-runs the audit or commits prematurely. Eval-shaped, registered here.

**Why per-eval declarable judge model — using Inspect's native mechanism.** Each Inspect `model_graded_qa()` call names its judge model via the `model=` argument; the project's CI environment selects a default via `INSPECT_EVAL_MODEL`. No methodology-side `eval.judge_model` config block. Earlier drafts added one; the Inspect-AI adoption made it redundant. The authoring guidance still applies: when an eval is adversarial against an agent (e.g. role-boundary contracts on invariant-compiler), the judge should differ from the harness — but the mechanism for declaring it is Inspect's, not the methodology's.

**Why defer documented failure-triage discipline.** Real concern, deferred deliberately. Triage rules (whether structured `triage_hints` fields in result JSON or a documented flowchart for skill-vs-rubric-vs-harness-vs-model-vs-flake attribution) only earn their keep when the eval surface is large enough that humans triage often and inconsistently. Day-1 has 5 evals; ad-hoc judgment costs almost nothing. Priority Day-1 is "the signal is correct" (the cache, the reducer, the build dispatch all work) over "the failure is explainable." Revisit when eval count crosses ~20 or when the first false-attribution incident lands.

**Why concurrency uses Inspect's native flags.** Initial draft treated eval execution as having its own concurrency story (rate limiter, `eval_concurrency` config knob, possibly its own invariant). With Inspect-AI adopted, Inspect's `--max-tasks` / `--max-samples` / `--max-connections` flags own parallelism for eval execution. The methodology imposes no concurrency model; the project's `verify[]` entry passes whatever Inspect flags the team picks. No concurrency invariant in this ADR.

**Why the LLM-judge prompt is the validator, not a translation of the definition.** Considered tracking `definition_sha` and `prompt_sha` per registry entry so `sdd verify` could catch drift on every CI run, not just audit runs. User reframed: the prompt is the executable form of the contract, the same way test code is the executable form for static verifiers. Nobody asks for `definition_sha + test_code_sha` side by side; the test code IS what the contract asserts. Same with the LLM-judge prompt — it doesn't *derive from* the definition, it *operationalizes* it. Drift between them is a Layer 2 audit failure, exactly the failure mode `invariant-testing-evaluator` was built to catch. No registry schema change; no pre-flight check. The author writes the prompt, `/compile-invariants` may scaffold the stub, Layer 2 audits the round-trip.

**Why no Go-interface plugin registry, no `framework:` field, no methodology-imposed format wrapper, no methodology-owned runner.** Multiple intermediate drafts hit this rake. First attempt: a Go `EvalRunner` interface + package-level init() registry, with a `framework:` field in the YAML to pick the runner — violated ADR-0078's existing rule against Go adapter frameworks. Second attempt: different path extensions per framework (e.g. `*.inspect-eval.yaml`) with the methodology's own YAML wrapper format — re-introduced the adapter framework via format translation. Third attempt: in-tree-go runner with `*.eval.yaml` (the format we own), built into `sdd verify`, with multi-framework future via additional path extensions — still proposed building a runner where a real one exists. User pushback at every stage. The final landing: adopt Inspect-AI Day-1, use its native format, contribute zero runner code, address Inspect's gaps with minimal Inspect-API-driven helpers. Multi-framework future = additional `verify[]` entries pointing to other frameworks' CLIs (Promptfoo, MLflow, etc.) — each framework keeps its native format and conventions.

**Why eval execution stays inside `verify[]`, not built into `sdd verify`.** Earlier draft argued for built-in eval handling inside `sdd verify` because "there's no project-native runner — the methodology has to ship one." With Inspect-AI adopted, the project DOES have a native runner (`inspect eval-set`). Adding it to `verify[]` reuses ADR-0078's existing model without amendment. The earlier "deliberate amendment to ADR-0078's structural-validation-only framing" was a workaround for not having Inspect; once Inspect is adopted, the amendment is unnecessary. `sdd verify` continues to do only structural validation and shell-out to `verify[]`, as ADR-0078 originally specified.

**Why API-key absence defers to Inspect's own error reporting.** Earlier draft proposed methodology-side soft-skip-with-warning logic (eval marked SKIPPED, structural checks still run, etc.), then a CI-hardening `--require-evals` flag. Both became unnecessary with Inspect-AI adopted: Inspect itself fails fast and clearly when its provider env vars are missing, and the `verify[]` shell-out surfaces Inspect's exit code. Contributors without API access can comment out the inspect line in `verify[]` (or wrap it in `|| true` for informational use); no methodology-side flag plumbing required. The earlier residual-risk concern (CI loses key, soft-skips, accidentally green-lights) doesn't apply when Inspect hard-fails by default.

**Why add the Layer 2 self-audit eval (`methodology.invariant_testing_evaluator.flags_under_constraining_verifiers`).** The audit chain Layer 2 catches verifier-vs-definition drift for the rest of the registry. But Layer 2 itself is implemented by the `invariant-testing-evaluator` agent — an LLM. Without an eval audit of the auditor, a silently-regressed Layer 2 ("the LLM started accepting under-constraining scorers as valid") would propagate undetected: every other eval would gate green because Layer 2 stops catching drift. Closing the loop costs one Day-1 eval (~30-40k tokens of authoring) and is the canonical "audits the auditor" use case for an eval verifier on an SDD agent.

**Why one self-audit eval Day-1, not full agent-by-agent coverage.** Considered sweeping every SDD agent (design-evaluator, spec-evaluator, implementation-evaluator, invariant-testing-evaluator, mutation-tester) with at least one role-boundary eval each. Rejected for Day-1 because (a) it's speculative coverage (no specific failure mode evidenced yet for those other agents the way Layer 2 has the regress-the-auditor risk; the invariant-compiler/dev-harness role-boundary issues are already covered by the four contracts surfaced from ADR-0081), (b) the methodology's principle is "real demand drives invariants, not speculative coverage," and (c) the implementation budget grows linearly with each added eval. Future ADRs add agent-behavior evals when a specific failure mode surfaces.

**Why no cache-related invariants Day-1.** Earlier drafts had `methodology.eval.cache_keys_complete` (composite SHA covers harness + skill + eval-yaml + input + model) and a corresponding cross-model-cache-invalidation invariant. With Inspect-AI adopted and the methodology-side SHA cache deferred, neither is load-bearing Day-1. Inspect's model-response cache handles the cheap case; methodology cache is a Day-2 enhancement if cost pain materializes. Cross-model evals stay in Scope > Deferred with no Day-1 contract.

## Open questions

(none — all resolved as of 2026-05-11)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| End-to-end: register an eval-verified invariant via Inspect | Author the invariant in an ADR, run /compile-invariants, Inspect `@task` Python stub appears, sdd verify runs the configured `inspect eval-set` + gate-helper chain, log files written, gate exits 0 on pass | Manual: author registry.yaml entry + ADR delta; commit; run sdd verify | /compile-invariants, invariant-compiler, sdd verify, inspect CLI, scripts/inspect-gate.py |
| Inspect's model-response cache hits on unchanged inputs | Re-running `inspect eval-set` with no input changes hits Inspect's cache, no new API calls | Pre-warm Inspect's cache; assert no API activity on second run | Inspect's own cache |
| Threshold-edge result | A task with `pass_threshold: 0.66` and epoch results [pass, pass, fail] reports overall PASS via `scripts/inspect-gate.py` | Synthetic Inspect task with stubbed scorer outputs | inspect-gate.py threshold logic |
| Inspect CLI not on PATH | Setup-skill precondition catches missing `inspect` binary; `sdd verify` shells out to verify[] which exits non-zero with clear error | Run in env without inspect installed | Setup skill, verify[] shell-out |
| Python verify-env not installed | Same — `inspect eval-set` shell entry fails with clear "command not found" | Run in env without Python 3.10+/inspect-ai | Setup skill bootstrap |
| Missing ANTHROPIC_API_KEY surfaces from Inspect | Unset the key; Inspect itself fails fast with its own error message; `verify[]` exits non-zero | env var control; assert Inspect error in stderr | Inspect's own auth path |
| Inspect-gate fails on below-threshold task | Synthesize an Inspect log with one task at pass-rate 0.33 (threshold 0.66); `scripts/inspect-gate.py` exits non-zero naming the failing invariant_id | Author synthetic .eval log; run gate helper | scripts/inspect-gate.py |
| Layer 2 audit catches rubric drift | Audit chain Layer 2 reads an Inspect `@task` Python file, reconstructs invariant from the task's scorers, flags when reconstruction diverges from registered definition | Synthetic Inspect task with deliberately drifted prompt | invariant-testing-evaluator |
| Layer 2 self-audit catches regressed auditor | Replace invariant-testing-evaluator's prompt with a regressed version that accepts under-constraining scorers; the self-audit Inspect eval fails | Synthetic agent-prompt mutation | invariant-testing-evaluator, inspect CLI |
| Layer 3 mutation catches non-biting eval | Mutate SKILL.md to remove the user-flow-walkthrough mandate; corresponding Inspect eval must fail | Synthetic SKILL.md mutation | mutation-tester, inspect CLI |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `scripts/inspect-gate.py` (CI gate, aggregates 3 failure modes) | ~50-80 | 20k | Uses `inspect_ai.log.read_eval_log()`; exits non-zero on (1) no logs found, (2) any task with `status != "success"`, or (3) any task with aggregate INCORRECT. Labels each failure with the invariant_id where applicable. |
| `setup/SKILL.md` Python verify-env bootstrap | ~50 | 18k | `pip install inspect-ai`, `pip install git+https://github.com/meridianlabs-ai/inspect_swe`, set INSPECT_EVAL_MODEL default; preconditions (`which inspect`, `python --version`). No Docker check (sandbox="local" default). |
| `setup/SKILL.md` `verify[]` template updates | ~20 | 10k | Add Inspect + gate commands to seeded config |
| Go test `TestVerifyIncludesInspect` (config invariant) | ~40 | 10k | Validates spec-driven-config.json's verify[] contains the inspect+gate dispatch |
| Go test `TestEvalTaskNamingMatchesInvariantID` (file/function naming) | ~60 | 15k | Walks `<project>/spec/evals/*_eval.py`, parses for `@task` decorated function names; asserts each matches the suffix of an active eval-verified invariant |
| Go test `TestInspectGateAggregatesFailureModes` (gate behavior) | ~120 | 25k | Runs scripts/inspect-gate.py against synthetic logs covering each failure mode: empty dir, log with `status=error`, log with INCORRECT aggregate. Asserts exit code and per-mode message text. |
| `/compile-invariants` Inspect-stub authoring | ~150-200 | 50k | invariant-compiler subagent extension: author Inspect `@task` Python stubs using `inspect_swe.claude_code()` solver + binary scorers |
| `/audit-invariants` Layer 2 extension (Inspect task audit) | ~120 | 45k | invariant-testing-evaluator prompt extension to read Python task files instead of YAML |
| `/audit-invariants` Layer 3 extension (skill mutation) | ~250 | 70k | mutation-tester prompt extension + SKILL.md mutator |
| `methodology.plan_feature.user_flow_walkthrough` Inspect task | ~80 | 30k | First skill eval; canned input + rubric in Inspect's @task format |
| `methodology.compile_invariants.file_scope` Inspect task | ~100 | 35k | Agent-behavior eval: solver runs invariant-compiler on canned ADR; scorer checks commit diff against file-pattern allowlist |
| `methodology.compile_invariants.no_test_scaffolding` Inspect task | ~90 | 30k | Agent-behavior eval: scorer scans authored `_test.go` files for ad-hoc Validator type definitions |
| `methodology.compile_invariants.references_undefined_symbols` Inspect task | ~80 | 30k | Agent-behavior eval: scorer runs `go build`; PASS iff build fails with "undefined" errors |
| `methodology.dev_harness.test_files_not_edited` Inspect task | ~90 | 30k | Agent-behavior eval: solver runs dev-harness; scorer asserts no `_test.go` or `_interface.go` files in diff |
| `methodology.invariant_testing_evaluator.flags_under_constraining_verifiers` Inspect task | ~100 | 35k | Self-audit eval on Layer 2; solver runs invariant-testing-evaluator on under-constraining fixture; scorer asserts agent flags it |
| `/plan-feature` user-flow-walkthrough mandate text | ~30 | 20k | Skill text update |
| New invariants in registry (9 entries) + verifiers | ~400 | 80k | verify_includes_inspect + task_naming_matches_invariant_id + inspect_gate_aggregates_failure_modes + plan_feature.user_flow_walkthrough + 4 role-boundary entries + invariant_testing_evaluator.flags_under_constraining_verifiers |
| Documentation in `context.md` | ~50 | 15k | Distributed plugin payload |

**Total estimated tokens**: ~565k
**Estimated wall-clock**: ~5-7 days of dev-harness work, paced by the Inspect-AI integration (first-time Python verify-env bootstrap, subprocess solver, gate helper) and the five agent-behavior Inspect task authoring. Significantly smaller than the earlier in-tree-go-runner estimate (~775k tokens) because no runner code, no YAML schema, no cache implementation, no flag plumbing.

---

## Appendix A — Inspect-AI Research (superseded by Day-1 adoption)

This appendix records the research that drove the initial "custom Go runner, not Inspect-AI" recommendation. **That recommendation was overturned in the final design** — Inspect-AI (plus Meridian Labs' `inspect_swe` agent suite) is adopted as the Day-1 framework. Preserved here as the technical inventory of Inspect-AI's capabilities and gaps. The gaps the appendix identified have since been addressed:
- "No documented subprocess-as-SUT pattern" → closed by `inspect_swe.claude_code()`, a first-class pre-built solver for Claude Code SUTs.
- "No first-class CI pass/fail gate" → closed by the methodology's `scripts/inspect-gate.py` (~30-50 LOC) reading Inspect's `EvalLog` via documented API.
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
`--epochs N` for N samples. `--epochs-reducer mean|median|mode|max|at_least_n|pass_at_k` for variance handling. Strong design that this ADR's Go runner adopts directly. **No first-class pass/fail threshold across an eval set.**

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
