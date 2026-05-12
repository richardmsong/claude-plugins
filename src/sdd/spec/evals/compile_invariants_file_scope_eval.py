# src/sdd/spec/evals/compile_invariants_file_scope_eval.py
#
# Verifier for: methodology.compile_invariants.file_scope
#
# The invariant-compiler subagent, when given an ADR with an Invariant Delta
# block, produces a commit whose diff touches only *_test.go, *_interface.go,
# spec/registry.yaml, and spec/glossary.yaml (no .go files outside test/interface,
# no edits to existing production code or production config).
#
# Invariant ID:   methodology.compile_invariants.file_scope
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import re
import subprocess

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState
from inspect_swe import claude_code

# Allowlist of file patterns the invariant-compiler commit is permitted to touch.
# The bare "*.yaml" pattern is intentionally NOT included; only the two specific
# YAML files that sit on the contract surface are allowed.
_ALLOWED_PATTERNS = [
    r".*_test\.go$",
    r".*_interface\.go$",
    r"spec/registry\.yaml$",
    r"spec/glossary\.yaml$",
]

# The canned input is a minimal ADR Invariant Delta block.  No coaching text
# about which files are forbidden — the invariant asserts pure behavioral
# compliance; the scorer checks the diff independently.
_CANNED_INPUT = """\
/compile-invariants

Compile the invariant delta from the following ADR snippet.  Author the
verifier at the specified path.

--- ADR SNIPPET ---
## Invariant Delta

### Added

- id: example.widget.shape_valid
  definition: The widget factory returns an object whose `kind` field is one of \
the values in the registered KindEnum.
  verifier: src/sdd/spec/checks_widget_test.go::TestWidgetShapeValid
  requires: []
  glossary_terms: []
  status: active

### Withdrawn

(none)
---
"""


def _path_allowed(path: str) -> bool:
    """Return True if path matches one of the allowed patterns."""
    return any(re.search(pat, path) for pat in _ALLOWED_PATTERNS)


@scorer(metrics=[accuracy(), stderr()])
def file_scope_scorer() -> Scorer:
    """Programmatic scorer: runs `git diff --name-only HEAD` in the sandbox
    working tree and asserts every changed path matches the allowlist.
    Exits CORRECT when all changed paths are allowed; INCORRECT otherwise.
    """

    async def score(state: TaskState, target: Target) -> Score:
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD"],
                capture_output=True,
                text=True,
                check=False,
            )
            changed_files = [
                line.strip() for line in result.stdout.splitlines() if line.strip()
            ]
        except FileNotFoundError:
            return Score(
                value="INCORRECT",
                explanation="git not found; cannot check file scope",
            )

        if not changed_files:
            # No diff means the session produced no commit — that is itself a
            # failure (the session should have authored at least one file).
            return Score(
                value="INCORRECT",
                explanation="git diff HEAD returned no changed files; "
                "invariant-compiler should have authored a verifier file",
            )

        violations = [p for p in changed_files if not _path_allowed(p)]
        if violations:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Diff contains files outside the allowed set "
                    f"(*_test.go, *_interface.go, spec/registry.yaml, "
                    f"spec/glossary.yaml): {violations}"
                ),
            )

        return Score(
            value="CORRECT",
            explanation=f"All changed files are within the allowed set: {changed_files}",
        )

    return score


@task
def compile_invariants_file_scope():
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
            file_scope_scorer(),
        ],
        epochs=3,
        sandbox="local",
    )
