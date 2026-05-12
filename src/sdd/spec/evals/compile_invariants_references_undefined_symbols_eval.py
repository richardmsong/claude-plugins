# src/sdd/spec/evals/compile_invariants_references_undefined_symbols_eval.py
#
# Verifier for: methodology.compile_invariants.references_undefined_symbols
#
# The invariant-compiler subagent's output, for foundational ADRs that introduce
# new types, leaves the build red — test files reference at least one symbol
# (constructor, type, function) that dev-harness will create.  The red build is
# the dispatch mechanism to dev-harness.
#
# Invariant ID:   methodology.compile_invariants.references_undefined_symbols
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import re
import subprocess

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState
from inspect_swe import claude_code

# The canned input is a /compile-invariants invocation for a foundational ADR
# that introduces the `Parser` type.  No coaching text about what the expected
# outcome is — the scorer asserts the red-build property independently.
_CANNED_INPUT = """\
/compile-invariants

Compile the invariant delta from the following ADR snippet.  The `Parser` type
is net-new; its constructor `newParser()` will be authored by dev-harness.

--- ADR SNIPPET ---
## Invariant Delta

### Added

- id: example.parser.accepts_valid_yaml
  definition: The parser returns a non-nil Document for every YAML input that \
passes schema validation.
  verifier: src/sdd/spec/checks_parser_test.go::TestParserAcceptsValidYAML
  requires: []
  glossary_terms: []
  status: active

### Withdrawn

(none)
---
"""

# Regex that matches Go compiler "undefined: <symbol>" error messages.
_UNDEFINED_SYMBOL_RE = re.compile(r"undefined:\s+\w+", re.MULTILINE)


@scorer(metrics=[accuracy(), stderr()])
def references_undefined_symbols_scorer() -> Scorer:
    """Programmatic scorer: runs `go build ./spec/...` and asserts that
    (a) the exit code is non-zero AND (b) stderr contains an "undefined: <sym>"
    diagnostic — confirming the build is red and the red build was caused by
    an undefined symbol reference (the dispatch signal to dev-harness).
    """

    async def score(state: TaskState, target: Target) -> Score:
        try:
            result = subprocess.run(
                ["go", "build", "./spec/..."],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            return Score(
                value="INCORRECT",
                explanation="go not found on PATH; cannot check build status",
            )

        build_failed = result.returncode != 0
        has_undefined = bool(_UNDEFINED_SYMBOL_RE.search(result.stderr))

        if not build_failed:
            return Score(
                value="INCORRECT",
                explanation=(
                    "Build exited zero — the invariant-compiler should have left "
                    "the build red by referencing an undefined symbol.  A green "
                    "build means the compiler either defined the symbol itself or "
                    "no symbol was referenced."
                ),
            )

        if not has_undefined:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Build is red (exit {result.returncode}) but stderr does not "
                    f"contain an 'undefined: <symbol>' diagnostic.  The failure "
                    f"may be unrelated to undefined symbol references.  "
                    f"stderr: {result.stderr[:300]!r}"
                ),
            )

        return Score(
            value="CORRECT",
            explanation=(
                f"Build is red and stderr contains an undefined-symbol diagnostic "
                f"(matched {_UNDEFINED_SYMBOL_RE.pattern!r}).  "
                f"First match: {_UNDEFINED_SYMBOL_RE.search(result.stderr).group()!r}"
            ),
        )

    return score


@task
def compile_invariants_references_undefined_symbols():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="CORRECT",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/compile-invariants"],
        ),
        scorer=[
            references_undefined_symbols_scorer(),
        ],
        epochs=3,
        sandbox="local",
    )
