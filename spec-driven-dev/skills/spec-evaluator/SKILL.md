---
name: spec-evaluator
description: Spec compliance audit for one or all components. Spawns the spec-evaluator agent (fresh context, no conversation history) per component. Saves results to .agent/audits/.
version: 1.0.0
user_invocable: true
argument-hint: [component-name]
---

# Spec Evaluator

Spawns the `spec-evaluator` agent for one or all components. The agent has no conversation context — it reads only spec docs and code.

## Doc discovery

Agents glob ADRs at `docs/adr-*.md` (root only — ADRs never nest) and specs at `docs/**/spec-*.md` (recursive). Component-local specs live under per-component subfolders; components without a dedicated subfolder use only cross-cutting specs + relevant ADRs.

### Dynamic component discovery

Rather than using a hardcoded component table, discover components at runtime by scanning the `docs/` directory:

1. `Glob("docs/**/spec-*.md")` — find all spec files.
2. Group by directory: each directory containing spec files represents a component.
   - Specs at `docs/` root (e.g. `docs/spec-state-schema.md`) are cross-cutting — they apply to multiple components.
   - Specs under `docs/<component>/` (e.g. `docs/my-service/spec-api.md`) are component-local.
3. For each component directory, derive the component name from the directory name.
4. Present the discovered component list to the user when invoked without arguments.

Cross-cutting specs (at `docs/` root) are included in the evaluation of every component that references them.

## Usage

```
/spec-evaluator [component]
```

**component**: any component name discovered via the scan above.

Omit to audit **all** discovered components in parallel.

---

## Single component

```
Agent({
  subagent_type: "spec-evaluator",
  description: "Spec evaluator: <component>",
  prompt: "Evaluate the <component> component. Component root: <root>. Spec files: <list of spec paths for this component>. Also read cross-cutting specs at docs/spec-*.md. Read all spec docs and compare against the component's code."
})
```

The agent saves results to `.agent/audits/spec-<component>-<YYYY-MM-DD>.md` and returns CLEAN or a gap list.

---

## All components (no argument)

First, discover components by scanning `docs/**/spec-*.md` and grouping by directory.

Then spawn one agent per component **in parallel**:

```
For each discovered component:
  Agent({
    subagent_type: "spec-evaluator",
    prompt: "Evaluate <component>. Spec files: <paths>. Also read cross-cutting specs.",
    run_in_background: true
  })
```

Wait for all to complete, then print combined summary:

```
### <component-1>: N gaps
### <component-2>: N gaps
### <component-3>: N gaps
...

See .agent/audits/ for full per-component reports.
```

---

## After running

If CLEAN: the component is spec-complete. Report to the calling skill.

If gaps found: the caller (typically `/feature-change`) passes gaps to `dev-harness`, then re-runs this evaluator. Loop until CLEAN.
