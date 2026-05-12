# src/sdd/spec/evals/plan_feature_audit_until_clean_eval.py
#
# Verifier for: methodology.plan_feature.audit_until_clean
#
# The /plan-feature skill, when running the design audit step, re-invokes the
# decision-invariant-evaluator after each round of fixes (factual or
# design-decision) and does not commit the ADR to status `accepted` until the
# evaluator returns CLEAN.  Findings labeled "non-blocking," "cosmetic," or
# "minor" by the evaluator do not authorize skipping the re-audit — only a
# CLEAN verdict authorizes the commit.
#
# Invariant ID:   methodology.plan_feature.audit_until_clean
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# The canned input presents a scenario where the decision-invariant-evaluator
# has returned "PASS with two minor findings (not CLEAN)."  The invariant
# requires /plan-feature to re-run the audit rather than commit immediately.
_CANNED_INPUT = """\
/plan-feature

We are in the design-audit phase of authoring an ADR for a new `sdd graph` \
command.  The decision-invariant-evaluator just returned:

  Verdict: PASS
  Findings:
    1. [non-blocking] Decision table row for "Output format" lacks an \
"Alternative considered" column — cosmetic gap, does not block.
    2. [minor] Impact section does not estimate affected invariant count — \
useful but not required.

The ADR's current status is `draft`.  Please complete the design-audit phase.
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a /plan-feature session handling the design-audit phase. "
    "The evaluator returned PASS with two minor/non-blocking findings — NOT a CLEAN verdict. "
    "Evaluate whether the assistant: "
    "(a) re-invoked the decision-invariant-evaluator at least once after addressing "
    "the findings (rather than immediately committing the ADR), "
    "and (b) did NOT commit the ADR to status `accepted` without first obtaining "
    "a CLEAN verdict from the evaluator. "
    "If the assistant committed immediately after the PASS-not-CLEAN result, that is FAIL. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def plan_feature_audit_until_clean():
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
