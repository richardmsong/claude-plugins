#!/usr/bin/env python3
# examples/inspect-gate.py
#
# Reference template for Inspect-AI consumers. Copy to your project's
# `scripts/inspect-gate.py` and reference from your `verify[]` shell command.
#
# Usage:
#   python scripts/inspect-gate.py <log-dir>
#
# Reads every *.eval log in <log-dir> written by `inspect eval-set`.
# Exits non-zero in three labeled cases:
#
#   1. No logs found — Inspect didn't run or wrote no logs at <log-dir>.
#   2. A task's log has status != "success" — Inspect-side failure (crash,
#      timeout, API error).  Prints the task name and its status.
#   3. A task's post-reducer aggregate is INCORRECT — score failure.  Prints
#      the task name, invariant_id if available, per-epoch results, and the
#      post-reducer aggregate.
#
# Exits 0 only when every task has status="success" AND aggregate=CORRECT.
#
# Companion invariant (project-scoped in the SDD dogfooding repo):
#   project.inspect_gate.aggregates_failure_modes

import json
import os
import sys
from pathlib import Path


def _read_eval_log(path: Path) -> dict:
    """Read an Inspect .eval log file.  Returns the parsed JSON dict.
    Tries `inspect_ai.log.read_eval_log` first (native Inspect API); falls
    back to plain JSON parsing for minimal-dependency portability.
    """
    try:
        from inspect_ai.log import read_eval_log  # type: ignore

        log = read_eval_log(str(path))
        # Convert the EvalLog dataclass to a plain dict for uniform access.
        return json.loads(log.model_dump_json())
    except Exception:
        # Fallback: plain JSON (works for synthetic test fixtures).
        with open(path, encoding="utf-8") as f:
            return json.load(f)


def _get_reducer_aggregate(log: dict) -> str | None:
    """Extract the post-reducer aggregate from an eval log dict.

    Inspect writes the reducer aggregate into `results.scores[*].reducer`.
    For single-scorer tasks the aggregate is the `reducer` field value.
    Returns the aggregate string (e.g. "CORRECT", "INCORRECT") or None if
    the field is absent.
    """
    try:
        scores = log.get("results", {}).get("scores", [])
        if not scores:
            return None
        # Use the first scorer's reducer aggregate.
        return scores[0].get("reducer")
    except Exception:
        return None


def _get_invariant_id(log: dict) -> str | None:
    """Extract the invariant_id label from the eval log if present.

    Inspect does not natively store an invariant_id field; this convention
    (matching task name to invariant ID) is enforced by the project's
    `project.eval.task_naming_matches_invariant_id` invariant.  The task
    name is used as a proxy.
    """
    try:
        return log.get("eval", {}).get("task")
    except Exception:
        return None


def main(log_dir: str) -> int:
    """Gate logic.  Returns 0 for success, 1 for any failure."""
    log_path = Path(log_dir)

    # --- Failure mode 1: no logs found ---
    eval_files = sorted(log_path.glob("*.eval")) if log_path.is_dir() else []
    if not eval_files:
        print(
            f"ERROR: no eval logs found at {log_dir!r}. "
            "Inspect didn't run or wrote no logs at this path.",
            file=sys.stderr,
        )
        return 1

    failed = False

    for eval_file in eval_files:
        try:
            log = _read_eval_log(eval_file)
        except Exception as exc:
            print(
                f"ERROR: could not read eval log {eval_file.name!r}: {exc}",
                file=sys.stderr,
            )
            failed = True
            continue

        task_name = _get_invariant_id(log) or eval_file.stem
        status = log.get("status", "unknown")

        # --- Failure mode 2: task status != "success" ---
        if status != "success":
            print(
                f"ERROR: Inspect didn't complete task {task_name!r} "
                f"(status={status!r}).  Check the eval log for details: "
                f"{eval_file}",
                file=sys.stderr,
            )
            failed = True
            continue

        # --- Failure mode 3: post-reducer aggregate is INCORRECT ---
        aggregate = _get_reducer_aggregate(log)
        if aggregate is None:
            # No aggregate present — cannot confirm correctness; treat as failure.
            print(
                f"ERROR: task {task_name!r} has no reducer aggregate in its log. "
                "Cannot confirm CORRECT status.",
                file=sys.stderr,
            )
            failed = True
            continue

        if aggregate != "CORRECT":
            # Collect per-epoch results for diagnostics.
            try:
                samples = log.get("samples", [])
                per_epoch = [
                    s.get("scores", [{}])[0].get("value", "?") for s in samples
                ]
            except Exception:
                per_epoch = []

            print(
                f"ERROR: task {task_name!r} (invariant_id={task_name!r}) scored "
                f"{aggregate!r} after reducer.  "
                + (f"Per-epoch results: {per_epoch}.  " if per_epoch else "")
                + f"See {eval_file} for full details.",
                file=sys.stderr,
            )
            failed = True

    if not failed:
        print(f"OK: all {len(eval_files)} eval task(s) passed (status=success, aggregate=CORRECT).")
        return 0

    return 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <log-dir>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
