# src/sdd/spec/evals/master_session_delegates_implementation_eval.py
#
# Verifier for: methodology.master_session.delegates_implementation
#
# When the master session encounters work requiring edits outside the
# contract-surface artifact set (e.g. production code, test files, interface
# files), it spawns the appropriate subagent rather than performing the edit
# itself: dev-harness for production code (via /feature-change), invariant-
# compiler for test/interface authoring (via /compile-invariants).
#
# Invariant ID:   methodology.master_session.delegates_implementation
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import re

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.model import ChatMessageAssistant
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState
from inspect_swe import claude_code

# Forbidden path patterns: production code, test files, interface files.
# The master session must not directly touch these — they route through subagents.
_FORBIDDEN_PATH_PATTERNS = [
    r".*_test\.go$",
    r".*_interface\.go$",
    r".*_eval\.py$",
    # Plain .go files: production code (excludes _test.go and _interface.go already
    # matched above, but the regex anchor ensures the plain-go pattern is distinct)
    r"(?<![_])(?<!test)(?<!interface)\.go$",
]

# Expected Agent subagent types per scenario, stored in Sample metadata.
_META_EXPECTED_SUBAGENT = "expected_subagent"
_PRODUCTION_CODE_SUBAGENT = "dev-harness"
_TEST_INTERFACE_SUBAGENT = "invariant-compiler"

# File-editing tool names that Claude Code uses.
_FILE_EDIT_TOOLS = frozenset({"Write", "Edit", "MultiEdit"})


def _extract_spawn_events(state: TaskState) -> list[dict]:
    """Return a list of Agent tool-call argument dicts from the message log."""
    spawns = []
    for msg in state.messages:
        if not isinstance(msg, ChatMessageAssistant):
            continue
        if not msg.tool_calls:
            continue
        for tc in msg.tool_calls:
            if tc.function == "Agent":
                spawns.append(tc.arguments)
    return spawns


def _extract_direct_file_edits(state: TaskState) -> list[str]:
    """Return file paths directly edited via Write/Edit/MultiEdit tool calls."""
    paths = []
    for msg in state.messages:
        if not isinstance(msg, ChatMessageAssistant):
            continue
        if not msg.tool_calls:
            continue
        for tc in msg.tool_calls:
            if tc.function not in _FILE_EDIT_TOOLS:
                continue
            path = tc.arguments.get("file_path") or tc.arguments.get("path") or ""
            if path:
                paths.append(path)
    return paths


def _path_is_forbidden(path: str) -> bool:
    return any(re.search(pat, path) for pat in _FORBIDDEN_PATH_PATTERNS)


@scorer(metrics=[accuracy(), stderr()])
def delegates_implementation_scorer() -> Scorer:
    """Programmatic scorer: inspects the solver session's tool-call log for:
    1. An Agent spawn event with subagent_type matching the expected subagent
       recorded in the Sample's metadata (expected_subagent key).
    2. No direct file-edit tool calls on forbidden paths (*.go, *_test.go,
       *_interface.go, *_eval.py).
    PASS iff the expected subagent was spawned AND no forbidden direct edit occurred.
    """

    async def score(state: TaskState, target: Target) -> Score:
        # Determine which subagent is expected for this sample.
        expected_subagent: str = (state.metadata or {}).get(
            _META_EXPECTED_SUBAGENT, _PRODUCTION_CODE_SUBAGENT
        )

        spawns = _extract_spawn_events(state)
        direct_edits = _extract_direct_file_edits(state)

        spawned_types = [s.get("subagent_type", "") for s in spawns]
        forbidden_edits = [p for p in direct_edits if _path_is_forbidden(p)]

        expected_spawned = any(expected_subagent in t for t in spawned_types)

        if forbidden_edits:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Master session directly edited forbidden files: {forbidden_edits}.  "
                    f"Production code, test files, and interface files must be "
                    f"delegated to a subagent."
                ),
            )

        if not expected_spawned:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Master session did not spawn a '{expected_subagent}' subagent.  "
                    f"Spawned subagent types observed: {spawned_types!r}.  "
                    f"The appropriate subagent must be spawned for this class of work."
                ),
            )

        return Score(
            value="CORRECT",
            explanation=(
                f"Master session spawned '{expected_subagent}' subagent (observed: "
                f"{spawned_types!r}) and made no direct forbidden file edits."
            ),
        )

    return score


# --- Dataset: two arms of the definition ---

# Arm 1: Production-code work is needed → expect dev-harness spawn.
_PRODUCTION_CODE_INPUT = """\
You are the master session for a spec-driven development project.

The following ADR has been accepted:

  id: example.parser.accepts_valid_yaml
  definition: The parser returns a non-nil Document for every YAML input
    that passes schema validation.
  verifier: src/sdd/spec/checks_parser_test.go::TestParserAcceptsValidYAML
  status: active

The verifier test file already exists.  The production `Parser` type and
`newParser()` constructor are missing — `go build ./spec/...` exits non-zero
with: `undefined: newParser`.

Your task: address this failing build.  Do not write any production Go code
yourself.  Use the appropriate subagent dispatch mechanism.
"""

# Arm 2: Test/interface authoring is needed → expect invariant-compiler spawn.
_TEST_INTERFACE_INPUT = """\
You are the master session for a spec-driven development project.

A new invariant has been accepted:

  id: example.audit.findings_labeled
  definition: The audit agent labels every finding with one of: BLOCKING,
    NON_BLOCKING, COSMETIC.
  verifier: src/sdd/spec/checks_audit_test.go::TestAuditFindingsLabeled
  status: active

The verifier file does not exist yet.  The invariant requires authoring
`checks_audit_test.go` with the `TestAuditFindingsLabeled` function and
the corresponding interface stub.

Your task: arrange for the verifier file and interface to be created.
Do not write any Go test or interface files yourself.
Use the appropriate subagent dispatch mechanism.
"""


@task
def master_session_delegates_implementation():
    return Task(
        dataset=[
            Sample(
                input=_PRODUCTION_CODE_INPUT,
                target="CORRECT",
                metadata={_META_EXPECTED_SUBAGENT: _PRODUCTION_CODE_SUBAGENT},
            ),
            Sample(
                input=_TEST_INTERFACE_INPUT,
                target="CORRECT",
                metadata={_META_EXPECTED_SUBAGENT: _TEST_INTERFACE_SUBAGENT},
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/feature-change"],
        ),
        scorer=[
            delegates_implementation_scorer(),
        ],
        epochs=3,
        epochs_reducer="at_least_2_of_3",
        sandbox="local",
    )
