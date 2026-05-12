# src/sdd/spec/evals/master_session_runs_at_opus_tier_eval.py
#
# Verifier for: methodology.master_session.runs_at_opus_tier
#
# The master session — the persistent Claude Code session that orchestrates ADR
# authoring, audit loops, and subagent spawning — runs at the highest-capability
# Anthropic model tier (Opus).
#
# Invariant ID:   methodology.master_session.runs_at_opus_tier
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import os
import re
import subprocess

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState, solver, Generate

# The tier check is programmatic: it reads the master-session model configuration
# from environment variables and, as a fallback, `claude --info` CLI output.
# No LLM solver SUT is needed — running a fresh claude_code() SUT would test
# Inspect's model assignment for that SUT, not the master session's own tier.
#
# The check asserts that the configured model for the master-session context
# contains "opus" in the model identifier string.  It reads:
#   1. The CLAUDE_MODEL or ANTHROPIC_MODEL env var (project-level override), or
#   2. The INSPECT_EVAL_MODEL env var (used by Inspect for its default judge), or
#   3. `claude --info` output, if the CLI is on PATH.
#
# If none of these sources reports a model containing "opus", the check fails —
# an unconfigured or non-Opus model tier is not evidence of Opus compliance.

_MODEL_ENV_VARS = ["CLAUDE_MODEL", "ANTHROPIC_MODEL", "ANTHROPIC_CLAUDE_MODEL"]

# A minimal no-op solver: passes the sample through without invoking an LLM SUT.
# The scorer does all the work via env-var / CLI introspection.
@solver
def noop_solver():
    async def solve(state: TaskState, generate: Generate) -> TaskState:
        return state

    return solve


def _check_claude_info() -> str | None:
    """Run `claude --info` and return the model identifier line, or None."""
    try:
        result = subprocess.run(
            ["claude", "--info"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        # Look for a line like "Model: claude-opus-..." or "model: claude-opus-..."
        match = re.search(r"(?i)\bmodel[:\s]+(\S+)", result.stdout)
        if match:
            return match.group(1)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


@scorer(metrics=[accuracy(), stderr()])
def runs_at_opus_tier_scorer() -> Scorer:
    """Programmatic scorer: checks that the master-session model identifier
    contains 'opus' (case-insensitive).  Reads from standard model env vars;
    falls back to `claude --info` CLI output.  Does NOT launch a fresh SUT.
    """

    async def score(state: TaskState, target: Target) -> Score:
        # 1. Check standard env vars — these reflect the master session's
        #    own configured model, not the model Inspect assigns to a SUT.
        for var in _MODEL_ENV_VARS:
            val = os.environ.get(var, "")
            if val:
                if "opus" in val.lower():
                    return Score(
                        value="CORRECT",
                        explanation=f"Master-session model env var {var}={val!r} contains 'opus'",
                    )
                else:
                    return Score(
                        value="INCORRECT",
                        explanation=(
                            f"Master-session model env var {var}={val!r} does not "
                            f"contain 'opus'.  The master session must run at the "
                            f"Opus tier."
                        ),
                    )

        # 2. Fall back to `claude --info` CLI output.  This reflects the
        #    harness model configured for the current environment.
        cli_model = _check_claude_info()
        if cli_model is not None:
            if "opus" in cli_model.lower():
                return Score(
                    value="CORRECT",
                    explanation=(
                        f"`claude --info` reported model {cli_model!r}, which "
                        f"contains 'opus'"
                    ),
                )
            else:
                return Score(
                    value="INCORRECT",
                    explanation=(
                        f"`claude --info` reported model {cli_model!r}, which does "
                        f"not contain 'opus'.  The master session must run at the "
                        f"Opus tier."
                    ),
                )

        # 3. No model information found — inconclusive, treated as failure.
        return Score(
            value="INCORRECT",
            explanation=(
                "Could not determine the master-session model tier: no model env "
                "vars set and `claude --info` did not return a model identifier.  "
                "Set CLAUDE_MODEL or ANTHROPIC_MODEL to the Opus model identifier."
            ),
        )

    return score


@task
def master_session_runs_at_opus_tier():
    # No LLM SUT needed: the scorer reads env vars and CLI output directly.
    # A minimal Sample is provided so Inspect can execute the task.
    return Task(
        dataset=[
            Sample(
                input="Check that the master-session model tier is Opus.",
                target="CORRECT",
            ),
        ],
        solver=noop_solver(),
        scorer=[
            runs_at_opus_tier_scorer(),
        ],
        epochs=3,
        epochs_reducer="at_least_2_of_3",
        sandbox="local",
    )
