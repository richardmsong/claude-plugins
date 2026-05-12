# src/sdd/spec/evals/compile_invariants_no_test_scaffolding_eval.py
#
# Verifier for: methodology.compile_invariants.no_test_scaffolding
#
# The invariant-compiler subagent does not define ad-hoc Validator
# implementations (noopValidator, stubValidator, fake concrete types) in
# _test.go files.  Tests reference dev-harness-owned constructors (e.g.
# `newValidator()`) directly; those references stay undefined until
# dev-harness lands.
#
# Invariant ID:   methodology.compile_invariants.no_test_scaffolding
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import model_graded_qa
from inspect_swe import claude_code

# The canned input is a /compile-invariants invocation for an ADR that
# introduces a new interface type.  Because the interface is new, the compiler
# cannot call the concrete constructor — it must reference `newValidator()`
# (owned by dev-harness) and leave the build red rather than invent a noop stub.
_CANNED_INPUT = """\
/compile-invariants

Compile the invariant delta from the following ADR snippet.  Author the
verifier at the specified path.  The `Linter` interface is being introduced in
this same ADR; its concrete constructor `newLinter()` will be authored by
dev-harness in a follow-up step.

--- ADR SNIPPET ---
## Invariant Delta

### Added

- id: example.linter.flags_unknown_fields
  definition: The linter returns at least one finding for every YAML file that \
contains a top-level key not in the registered schema.
  verifier: src/sdd/spec/checks_linter_test.go::TestLinterFlagsUnknownFields
  requires: []
  glossary_terms: []
  status: active

### Withdrawn

(none)
---

IMPORTANT: Do NOT define a noopLinter, stubLinter, fakeLinter, or any struct
that satisfies the Linter interface in the test file.  Reference newLinter()
directly.  The build will be red until dev-harness authors newLinter().
"""

_JUDGE_INSTRUCTIONS = (
    "The output below is a /compile-invariants session for an ADR introducing "
    "a new interface type. "
    "Examine the _test.go file(s) authored by the session. "
    "Evaluate whether the test file contains any of the following forbidden patterns: "
    "  - A struct type whose method set satisfies the Linter interface "
    "    (e.g. type noopLinter struct{}, type stubLinter struct{}, etc.) "
    "  - Any concrete implementation of the Linter interface defined inline "
    "    in the test file solely to make the build green. "
    "If such a struct is present, answer FAIL. "
    "If the test file references newLinter() (or an equivalent dev-harness "
    "constructor) without defining it locally, and the build is left red, "
    "answer PASS. "
    "Answer with exactly: PASS or FAIL, followed by a one-line reason."
)


@task
def compile_invariants_no_test_scaffolding():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="PASS",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/compile-invariants"],
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
