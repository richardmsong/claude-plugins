# src/sdd/spec/evals/invariant_testing_evaluator_flags_under_constraining_verifiers_eval.py
#
# Verifier for: methodology.invariant_testing_evaluator.flags_under_constraining_verifiers
#
# The invariant-testing-evaluator agent, when given an eval whose scorers fail
# to fully express the registered invariant's definition (e.g. scorer
# pass-by-default, scorer omitting a clause of the contract), produces a Layer 2
# audit finding that identifies the under-constraining scorer and the missing clause.
#
# Invariant ID:   methodology.invariant_testing_evaluator.flags_under_constraining_verifiers
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# The canned input presents the Layer 2 auditor with a fixture that is
# deliberately under-constraining:
#
#   - Registered definition has two clauses: (A) output contains a summary
#     line, and (B) exit code is 0 on clean input.
#   - The eval's scorer only asserts clause A; clause B is missing entirely.
#
# The invariant requires the auditor to flag the under-constraining scorer
# and name the missing clause.
_CANNED_INPUT = """\
/audit-invariants layer2

Audit the following invariant–verifier pair for under-constraining scorers:

--- REGISTRY ENTRY ---
id: example.linter.clean_exit
definition: The linter, when given clean input, prints nothing to stdout and exits with code 0.
verifier: src/sdd/spec/evals/example_linter_clean_exit_eval.py::clean_exit
status: active

--- EVAL FILE (src/sdd/spec/evals/example_linter_clean_exit_eval.py) ---
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import includes
from inspect_swe import claude_code

@task
def clean_exit():
    return Task(
        dataset=[Sample(input="sdd lint clean_input/", target="")],
        solver=claude_code(skills=["src/sdd/skills/linter"]),
        scorer=[
            includes(""),   # asserts stdout is empty — but does NOT assert exit code
        ],
        epochs=3,
        sandbox="local",
    )
---

Perform a Layer 2 audit: does the eval's scorer fully operationalize the
registered definition?  Identify any missing clauses and name the
under-constraining scorer.
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a Layer 2 audit by the invariant-testing-evaluator agent. "
    "The registered definition has two clauses: (A) prints nothing to stdout, "
    "and (B) exits with code 0. The eval's scorer checks only clause A "
    "(stdout is empty) and does NOT check the exit code (clause B). "
    "Evaluate whether the agent: "
    "(a) identified the under-constraining scorer (the `includes('')` call that "
    "does not verify the exit code), "
    "and (b) named the missing clause (exit code must be 0). "
    "If the agent accepted the eval as sufficient without flagging the missing "
    "exit-code assertion, that is FAIL. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def invariant_testing_evaluator_flags_under_constraining_verifiers():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="PASS",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/audit-invariants"],
        ),
        scorer=[
            model_graded_qa(
                instructions=_JUDGE_INSTRUCTIONS,
                model="anthropic/claude-sonnet-4-6",
                grade_pattern=r"^(PASS|FAIL)",
            ),
        ],
        epochs=3,
        sandbox="local",
    )
