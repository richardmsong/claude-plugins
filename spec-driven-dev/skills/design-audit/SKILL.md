---
name: design-audit
description: Multi-round ambiguity audit loop for a design document. Calls /design-evaluator (fresh-context agent) repeatedly, fixing gaps between rounds until CLEAN. Logs all findings, fixes, and decisions to .agent/audits/.
version: 1.0.0
user_invocable: true
argument-hint: <path to design document>
---

# Design Audit

Runs `/design-evaluator` in a loop, fixing gaps between rounds until CLEAN. The evaluator is a fresh-context agent that sees only the document and codebase. This skill (the audit) classifies gaps, applies fixes, asks the user about design decisions, and re-runs.

## Usage

```
/design-audit <path-to-design-doc>
```

Examples:
- `/design-audit docs/adr-0007-github-oauth.md`
- `/design-audit docs/adr-NNNN-session-sharing.md`

---

## Algorithm

```
1. Validate the file exists
2. Initialize audit log
3. Run /design-evaluator <path>
4. Record findings in log
5. If gaps found: fix them, record fixes, re-run evaluator (loop until CLEAN)
6. Write final CLEAN to log
```

---

## Step 1 — Validate

Check that the file path exists and is a markdown file. If no path is given, look for the most recently modified `docs/adr-*.md` file (root only — ADRs never nest).

---

## Step 2 — Initialize audit log

Derive the log filename from the design doc: `docs/adr-0007-github-oauth.md` -> `.agent/audits/design-github-oauth-<YYYY-MM-DD>.md`.

Create `.agent/audits/` if it doesn't exist. If the log file already exists (multiple audits per day), append.

Write the header:

```markdown
## Audit: <ISO timestamp>

**Document:** <path-to-design-doc>
```

---

## Step 3 — Run design evaluator agent

Spawn the design evaluator as a subagent:

```
Agent({
  subagent_type: "design-evaluator",
  description: "Design evaluator: <doc-name>",
  prompt: "Evaluate the design document at <path>. Report all blocking gaps or CLEAN."
})
```

The evaluator is a **separate agent** (`subagent_type="design-evaluator"`) — it has no conversation context from this session. It reads only the design document and the codebase. It saves its results to `.agent/audits/` and returns either CLEAN or a gap list.

The evaluator can also be spawned standalone (single-pass check without the fix loop) by any caller using `Agent(subagent_type="design-evaluator", ...)`.

---

## Step 4 — Record findings in log

After the evaluator returns, append the round's findings to the audit log:

```markdown
### Round N

**Gaps found: M**

1. **<Gap title>** — <what's missing and why it blocks>
2. **<Gap title>** — <what's missing and why it blocks>
...
```

If the evaluator returned CLEAN:

```markdown
### Round N

CLEAN — no blocking gaps found.
```

---

## Step 5 — Fix and re-audit

If gaps were found, classify each one:

**Factual inconsistencies** (wrong migration mechanism, incorrect API format, stale reference to a file/table that doesn't exist, contradictions between sections): fix these yourself by reading the codebase to find the correct answer. No need to ask the user.

**Design decisions** (architectural choices, behavior in ambiguous scenarios, scope questions, trade-offs with no obvious right answer): ask the user via AskUserQuestion. Batch related questions. Provide concrete options with trade-offs.

Record every fix and decision in the log:

```markdown
#### Fixes applied

| # | Gap | Resolution | Type |
|---|-----|-----------|------|
| 1 | <gap title> | <what was changed in the doc> | factual |
| 2 | <gap title> | <user chose option A: description> | decision |
| 3 | <gap title> | <what was changed in the doc> | factual |
...
```

Then:
1. Fix factual gaps directly in the design document
2. Ask the user about design decisions, incorporate answers
3. Re-run the evaluator (back to step 3)
4. Repeat until the evaluator returns CLEAN

**Do not report the audit as passed until the evaluator returns CLEAN.** Each round of fixes may introduce new ambiguity that wasn't visible before.

---

## Step 6 — Write final status

When the evaluator returns CLEAN, append the summary:

```markdown
### Result

**CLEAN** after N rounds, M total gaps resolved (F factual fixes, D design decisions).
```

---

## Log format — full example

```markdown
## Audit: 2026-04-14T12:00:00Z

**Document:** docs/adr-0007-github-oauth.md

### Round 1

**Gaps found: 7**

1. **git_identity_id delivery unspecified** — no mechanism for how the value reaches the pod
2. **glab not in Alpine repos** — `apk add glab` will fail
3. **glab multi-account not supported** — glab CLI has no `auth switch`
...

#### Fixes applied

| # | Gap | Resolution | Type |
|---|-----|-----------|------|
| 1 | git_identity_id delivery | Added MCProjectSpec field + GIT_IDENTITY_ID env var | factual |
| 2 | glab not in Alpine repos | Changed to binary download from GitLab releases | factual |
| 3 | glab multi-account | User chose: one identity per GitLab host | decision |
...

### Round 2

CLEAN — no blocking gaps found.

### Result

**CLEAN** after 2 rounds, 7 total gaps resolved (5 factual fixes, 2 design decisions).
```

---

## Why this exists

Design documents are written in the context of a conversation — the author has full context from Q&A sessions and implicitly relies on decisions discussed but not written down. A context-free evaluator catches those gaps. This is the same principle as code review: fresh eyes find what the author can't see.

The audit log preserves the history of what was found and how it was resolved. This serves the same purpose as the spec-evaluator's `.agent/audits/` logs: traceability of decisions and fixes across rounds.
