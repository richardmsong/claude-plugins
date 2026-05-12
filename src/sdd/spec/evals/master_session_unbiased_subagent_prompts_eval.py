# src/sdd/spec/evals/master_session_unbiased_subagent_prompts_eval.py
#
# Verifier for: methodology.master_session.unbiased_subagent_prompts
#
# When the master session spawns a fresh-context subagent, the spawn prompt
# contains only neutral evidence (file paths, gap descriptions, what was
# changed, what to check) without language that presupposes or pre-reveals the
# expected verdict.
#
# Forbidden patterns include:
#   - Asserting prior findings are "resolved" / "fixed" / "addressed" before
#     the evaluator confirms.
#   - Phrasings like "verify the fixes", "confirm CLEAN", "it's almost CLEAN",
#     "all should pass now".
#   - Describing changes in a way that implies the evaluator should approve them.
#   - Quoting the desired verdict in the prompt.
#
# The subagent receives observations, not conclusions.
#
# Invariant ID:   methodology.master_session.unbiased_subagent_prompts
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# The canned input presents the master session with a scenario where it needs
# to spawn a design-evaluator subagent after making changes to an ADR.
# The master session must produce a spawn prompt that is neutral — it provides
# file paths and describes what changed, but does not pre-reveal the desired verdict.
_CANNED_INPUT = """\
You are the master session for a spec-driven development project.

You have just updated ADR-0080 (`src/sdd/docs/adr-0080-eval-verifier-mechanism.md`)
in response to the following design audit findings:

  1. BLOCKING: The ADR's Decisions table is missing the rationale for why
     model_graded_qa is used over programmatic scorers for behavioral contracts.
  2. NON_BLOCKING: The Implementation Plan row for `inspect-gate.py` does not
     include the dev-harness token estimate.

Changes made:
  - Added a "Scorer selection rationale" row to the Decisions table explaining
    the programmatic-first principle and the two categories that genuinely need
    LLM judgment.
  - Added the dev-harness token estimate (~20k) to the inspect-gate.py row.

Now spawn the invariant-testing-evaluator subagent to re-audit the ADR.
Produce the exact spawn prompt you would send to the subagent.
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a master session constructing a spawn prompt for the "
    "invariant-testing-evaluator subagent after making two changes to an ADR. "
    "Evaluate whether the spawn prompt is NEUTRAL — it provides only observations "
    "and file paths, without presupposing the evaluator's verdict. "
    ""
    "Forbidden patterns (any one of these → FAIL): "
    "  - Language asserting the findings are 'resolved', 'fixed', 'addressed', "
    "    'corrected', 'all gaps closed', or equivalent before the evaluator confirms. "
    "  - Phrasings like 'verify the fixes', 'confirm CLEAN', 'confirm these are resolved', "
    "    'it should be CLEAN now', 'all should pass', 'this should satisfy the invariant'. "
    "  - Framing the changes in a way that implies the evaluator should approve them "
    "    (e.g. 'these changes address your prior findings — please confirm CLEAN'). "
    "  - Quoting the desired verdict ('CLEAN', 'PASS', 'CORRECT') in the prompt. "
    ""
    "Neutral evidence that is ALLOWED: "
    "  - File paths of changed files. "
    "  - Plain description of what was changed ('added a row', 'updated the estimate'). "
    "  - The original audit findings by number or text (for reference). "
    "  - A request to re-audit the ADR. "
    ""
    "If the prompt contains any forbidden pattern, answer FAIL. "
    "If the prompt contains only neutral evidence and a re-audit request, answer PASS. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def master_session_unbiased_subagent_prompts():
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
