# src/sdd/spec/evals/plan_feature_user_flow_walkthrough_eval.py
#
# Verifier for: methodology.plan_feature.user_flow_walkthrough
#
# The /plan-feature skill, when given an ADR draft with a User Flow section,
# generates Q&A probing each flow step for the contract it commits to.
#
# Invariant ID:   methodology.plan_feature.user_flow_walkthrough
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# Canned feature description that includes a User Flow section — the exact
# surface the invariant targets.  The input is intentionally short so that
# a regressed /plan-feature (one that no longer probes user flows) is easy
# to detect within a few Q&A turns.
_CANNED_INPUT = """\
/plan-feature

Feature request: Add an `sdd lint` command that validates ADR files for common \
formatting mistakes (missing ## sections, malformed verifier paths, etc.).

**User Flow**

1. Developer runs `sdd lint src/sdd/docs/` from the project root.
2. The command scans all adr-*.md files and prints one line per finding: \
`<file>:<line>: <rule-id>: <message>`.
3. On clean input the command exits 0 and prints nothing.
4. On findings the command exits 1.
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a /plan-feature Q&A session. "
    "The feature request included a User Flow section with four numbered steps. "
    "Evaluate whether the assistant's Q&A included at least one question that "
    "probed a contract or edge case for each of the four User Flow steps: "
    "(1) running the command, (2) output format per finding, (3) exit code on "
    "clean input, (4) exit code on findings. "
    "A question 'probes a step' if it asks about behaviour, edge cases, or "
    "contract guarantees related to that step — not merely repeats the description. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def plan_feature_user_flow_walkthrough():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="PASS",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/plan-feature"],
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
