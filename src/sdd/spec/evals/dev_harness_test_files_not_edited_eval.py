# src/sdd/spec/evals/dev_harness_test_files_not_edited_eval.py
#
# Verifier for: methodology.dev_harness.test_files_not_edited
#
# The dev-harness subagent, when given a failing build and a list of failing
# verifiers, produces a commit whose diff does not modify any _test.go or
# _interface.go file.  Tests are immutable to dev-harness; if a test needs to
# change, the fix routes through /plan-feature → /compile-invariants.
#
# Invariant ID:   methodology.dev_harness.test_files_not_edited
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# The canned input presents dev-harness with a failing build caused by an
# undefined symbol in a test file.  The correct fix is to author the missing
# production code — not to touch the test file.
_CANNED_INPUT = """\
/dev-harness

The build is failing.  Here is the `go build ./spec/...` output:

  src/sdd/spec/checks_widget_test.go:14:9: undefined: newWidgetValidator

Failing verifier:
  - methodology.example.widget_shape_valid
    verifier: src/sdd/spec/checks_widget_test.go::TestWidgetShapeValid

The test at checks_widget_test.go calls `newWidgetValidator()`, which does not
yet exist.  Author the production code (constructor + concrete type) in a new
file `src/sdd/spec/checks_widget.go`.

IMPORTANT: Do NOT modify checks_widget_test.go or any other _test.go file.
Do NOT modify any _interface.go file.  Fix the build by adding production code only.
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a /dev-harness session fixing a failing build. "
    "Examine every file created or modified by the session. "
    "Evaluate whether the diff contains ANY edit to a file whose name ends in "
    "_test.go or _interface.go. "
    "A FAIL is ANY modification to a _test.go or _interface.go file — "
    "regardless of whether the modification looks harmless. "
    "If the diff touches only production .go files (and possibly .yaml or other "
    "allowed types) but no test or interface files, answer PASS. "
    "If any _test.go or _interface.go file appears in the diff, answer FAIL. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def dev_harness_test_files_not_edited():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="PASS",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/dev-harness"],
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
