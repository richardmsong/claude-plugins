# src/sdd/spec/evals/subagent_runs_at_sonnet_tier_eval.py
#
# Verifier for: methodology.subagent.runs_at_sonnet_tier
#
# Every fresh-context subagent spawned by the master session
# (decision-invariant-evaluator, invariant-testing-evaluator,
# invariant-compiler, dev-harness, design-evaluator, mutation-tester) runs at
# the mid-capability Anthropic model tier (Sonnet).
#
# Invariant ID:   methodology.subagent.runs_at_sonnet_tier
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import glob
import os
import re

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState, Generate, solver

# Agent definition files live under <project>/src/sdd/agents/*.md
# The agents directory path is resolved relative to the project root, which is
# located by walking up from this file's location until spec-driven-config.json
# is found.  This avoids a hardcoded absolute path.
_AGENTS_DIR_RELPATH = "src/sdd/agents"


def _find_project_root() -> str | None:
    """Walk up from this file until spec-driven-config.json is found."""
    current = os.path.dirname(os.path.abspath(__file__))
    for _ in range(10):
        if os.path.isfile(os.path.join(current, "spec-driven-config.json")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


def _parse_frontmatter_model(path: str) -> str | None:
    """Return the value of a `model:` key in the YAML frontmatter of a Markdown
    file, or None if the file has no frontmatter or no `model:` key.

    Frontmatter is defined as content between the first `---` line and the
    closing `---` or `...` line at the start of the file.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return None

    if not lines or lines[0].strip() != "---":
        return None

    in_frontmatter = False
    for line in lines:
        stripped = line.strip()
        if stripped == "---" and not in_frontmatter:
            in_frontmatter = True
            continue
        if in_frontmatter and stripped in ("---", "..."):
            break
        if in_frontmatter:
            m = re.match(r"^model\s*:\s*(\S+)", stripped)
            if m:
                return m.group(1)
    return None


# Minimal no-op solver: the scorer does all the work via file inspection.
@solver
def noop_solver():
    async def solve(state: TaskState, generate: Generate) -> TaskState:
        return state

    return solve


@scorer(metrics=[accuracy(), stderr()])
def runs_at_sonnet_tier_scorer() -> Scorer:
    """Programmatic scorer: walks .agent/agents/*.md (or src/sdd/agents/*.md),
    parses each file's frontmatter `model:` field, and asserts that every
    subagent definition declares the Sonnet tier.

    Per-subagent granularity: a single non-Sonnet entry is enough to FAIL.
    Discovery is file-based so adding a new subagent without updating this eval
    is automatically caught.
    """

    async def score(state: TaskState, target: Target) -> Score:
        project_root = _find_project_root()
        if project_root is None:
            return Score(
                value="INCORRECT",
                explanation=(
                    "Could not locate project root (spec-driven-config.json not "
                    "found walking up from eval file).  Cannot check subagent "
                    "model tiers."
                ),
            )

        agents_dir = os.path.join(project_root, _AGENTS_DIR_RELPATH)
        agent_files = sorted(glob.glob(os.path.join(agents_dir, "*.md")))

        if not agent_files:
            # No agent definition files found — this is unexpected.
            return Score(
                value="INCORRECT",
                explanation=(
                    f"No agent definition files found under {agents_dir!r}.  "
                    f"Expected *.md files with YAML frontmatter `model:` fields."
                ),
            )

        results: list[str] = []
        failures: list[str] = []

        for path in agent_files:
            name = os.path.basename(path)
            model = _parse_frontmatter_model(path)
            if model is None:
                # No frontmatter model field.  The invariant asserts that subagents
                # run at the Sonnet tier; an undeclared model is a violation.
                failures.append(
                    f"{name}: no `model:` field in frontmatter (tier unspecified)"
                )
                results.append(f"{name}: MISSING")
            elif "sonnet" in model.lower():
                results.append(f"{name}: {model!r} (CORRECT)")
            else:
                failures.append(
                    f"{name}: model={model!r} does not contain 'sonnet'"
                )
                results.append(f"{name}: {model!r} (INCORRECT)")

        if failures:
            return Score(
                value="INCORRECT",
                explanation=(
                    "One or more subagent definitions do not declare the Sonnet "
                    f"tier.  Failures: {failures}.  All results: {results}."
                ),
            )

        return Score(
            value="CORRECT",
            explanation=(
                f"All {len(agent_files)} subagent definition file(s) declare a "
                f"Sonnet-tier model.  Results: {results}."
            ),
        )

    return score


@task
def subagent_runs_at_sonnet_tier():
    # No LLM SUT needed: the scorer inspects agent definition files directly.
    return Task(
        dataset=[
            Sample(
                input="Check that every subagent definition file declares the Sonnet tier.",
                target="CORRECT",
            ),
        ],
        solver=noop_solver(),
        scorer=[
            runs_at_sonnet_tier_scorer(),
        ],
        epochs=3,
        epochs_reducer="at_least_2_of_3",
        sandbox="local",
    )
