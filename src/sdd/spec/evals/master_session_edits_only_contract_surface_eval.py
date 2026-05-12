# src/sdd/spec/evals/master_session_edits_only_contract_surface_eval.py
#
# Verifier for: methodology.master_session.edits_only_contract_surface
#
# The master session edits only contract-surface artifacts: ADR files under
# spec.adr_dir, the registry file, the glossary file, reaction artifacts under
# spec.reactions_dir, and spec-driven-config.json.  The master session does NOT
# directly edit production code, test files (*_test.go, *_eval.py), interface
# files, or unrelated project config.
#
# Invariant ID:   methodology.master_session.edits_only_contract_surface
# Registry entry: src/sdd/spec/registry.yaml
# ADR:            src/sdd/docs/adr-0080-eval-verifier-mechanism.md

import json
import os
import re
import subprocess

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer, stderr
from inspect_ai.solver import TaskState
from inspect_swe import claude_code

# The canned input presents the master session with a feature request that
# requires only contract-surface changes — the ADR and registry update.  A
# compliant master session should NOT touch any production Go code or test files.
_CANNED_INPUT = """\
You are the master session for a spec-driven development project.

A new invariant has been identified during design review:

  id: example.audit.findings_labeled
  definition: The audit agent labels every finding with one of: BLOCKING, \
NON_BLOCKING, COSMETIC.
  status: active

Your task: author the ADR delta block (Invariant Delta section) and update
spec-driven-config.json if needed.  Do NOT write any Go source files, test
files, or interface files.  Do NOT invoke /compile-invariants or /dev-harness.
Just update the contract-surface artifacts.
"""

# Forbidden patterns: production code, test files, interface files, eval files.
_FORBIDDEN_PATTERNS = [
    r".*_test\.go$",
    r".*_interface\.go$",
    r".*_eval\.py$",
    r"(?<![_])(?<!test)(?<!interface)\.go$",  # plain .go production files
]


def _find_project_root() -> str | None:
    """Walk up from this file until spec-driven-config.json is found."""
    current = os.path.dirname(os.path.abspath(__file__))
    for _ in range(10):
        candidate = os.path.join(current, "spec-driven-config.json")
        if os.path.isfile(candidate):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


def _load_config(project_root: str) -> dict:
    """Load spec-driven-config.json from project_root."""
    config_path = os.path.join(project_root, "spec-driven-config.json")
    try:
        with open(config_path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _build_allowed_patterns(project_root: str, cfg: dict) -> list[str]:
    """Build the allowlist of permitted file path patterns from config values.

    Reads spec.adr_dir, spec.registry, spec.glossary, spec.reactions_dir, and
    spec-driven-config.json itself from the project config.  Falls back to
    reasonable defaults if a key is absent.  The .md allowlist is narrowed to
    only files under spec.adr_dir (not all .md files project-wide).
    """
    spec = cfg.get("spec", {})

    adr_dir = spec.get("adr_dir", "src/sdd/docs/").rstrip("/") + "/"
    registry = spec.get("registry", "src/sdd/spec/registry.yaml")
    glossary = spec.get("glossary", "src/sdd/spec/glossary.yaml")
    reactions_dir = spec.get("reactions_dir", "src/sdd/docs/reactions/").rstrip("/")

    # Escape regex-special characters in the config-derived paths.
    def esc(s: str) -> str:
        return re.escape(s)

    return [
        # ADR files: only .md files under spec.adr_dir (not all .md everywhere).
        r"^" + esc(adr_dir) + r".*\.md$",
        # Registry and glossary: exact path match.
        r"(^|/)" + esc(os.path.basename(registry)) + r"$",
        r"(^|/)" + esc(os.path.basename(glossary)) + r"$",
        # spec-driven-config.json: exact file name anywhere (project root level).
        r"(^|/)spec-driven-config\.json$",
        # Reaction artifacts under spec.reactions_dir.
        r"^" + esc(reactions_dir) + r"/",
    ]


def _path_allowed(path: str, allowed_patterns: list[str]) -> bool:
    return any(re.search(pat, path) for pat in allowed_patterns)


def _path_forbidden(path: str) -> bool:
    return any(re.search(pat, path) for pat in _FORBIDDEN_PATTERNS)


@scorer(metrics=[accuracy(), stderr()])
def edits_only_contract_surface_scorer() -> Scorer:
    """Programmatic scorer: inspects the working-tree diff and asserts that
    every changed file is within the contract-surface set (config-derived) and
    no forbidden file (production code, test, interface, eval) was touched.

    The .md allowlist is narrowed to spec.adr_dir only — editing CLAUDE.md,
    README.md, or skill SKILL.md files is a violation.
    """

    async def score(state: TaskState, target: Target) -> Score:
        # Build the allowlist from config at score time so it reflects the
        # actual project configuration rather than hardcoded paths.
        project_root = _find_project_root()
        if project_root is None:
            return Score(
                value="INCORRECT",
                explanation=(
                    "Could not locate spec-driven-config.json.  Cannot determine "
                    "the contract-surface allowlist."
                ),
            )
        cfg = _load_config(project_root)
        allowed_patterns = _build_allowed_patterns(project_root, cfg)

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

        forbidden = [p for p in changed_files if _path_forbidden(p)]
        if forbidden:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Master session touched forbidden files (production code, "
                    f"test files, interface files, or eval files): {forbidden}"
                ),
            )

        non_contract = [p for p in changed_files if not _path_allowed(p, allowed_patterns)]
        if non_contract:
            return Score(
                value="INCORRECT",
                explanation=(
                    f"Master session touched files outside the contract-surface "
                    f"allowlist (adr_dir={cfg.get('spec', {}).get('adr_dir')!r}, "
                    f"registry, glossary, reactions_dir, spec-driven-config.json): "
                    f"{non_contract}"
                ),
            )

        return Score(
            value="CORRECT",
            explanation=(
                f"All changed files are within the contract-surface set: "
                f"{changed_files if changed_files else '(no changes)'}"
            ),
        )

    return score


@task
def master_session_edits_only_contract_surface():
    return Task(
        dataset=[
            Sample(
                input=_CANNED_INPUT,
                target="CORRECT",
            ),
        ],
        solver=claude_code(
            skills=["src/sdd/skills/plan-feature"],
        ),
        scorer=[
            edits_only_contract_surface_scorer(),
        ],
        epochs=3,
        epochs_reducer="at_least_2_of_3",
        sandbox="local",
    )
