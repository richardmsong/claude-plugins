
# Compile Invariants

Given an ADR with an `## Invariant Delta` block, loop until both gates pass:

- **Build gate**: every authored verifier compiles (`go build ./... && go vet ./...`).
- **Roundtrip gate (layer-2 audit)**: every authored verifier faithfully expresses its invariant's definition. Checked by the `invariant-testing-evaluator` agent.

Invokable inline by `/plan-feature` (during ADR authoring) or standalone (when the delta block already exists and verifiers need regeneration).

## Usage

```
/compile-invariants <path-to-adr>
```

Examples:
- `/compile-invariants docs/adr-0078-invariant-driven-development.md`
- `/compile-invariants docs/adr-NNNN-<slug>.md`

---

## Algorithm

```
Loop:
  1. invariant-compiler agent authors/re-authors verifiers from the delta
  2. Build gate: go build ./... && go vet ./...
       If fail → re-invoke compiler with the build error, go to 1
  3. Roundtrip gate: spawn invariant-testing-evaluator on each just-authored
     or just-touched verifier
       If drift (verifier under/over-constrains its definition, or is non-asserting):
         classify the divergence:
           a. Verifier wrong → re-invoke compiler with the divergence as context, go to 1
           b. Definition wrong → bubble up to the caller as backpressure
              (the definition needs sharpening; only /plan-feature can do that)
       go to 1 (or return as backpressure)
  4. CLEAN: both gates pass — return the final report
```

Each loop pass spawns agents in the background (their definitions declare `background: true`). Wait for completion notifications; do not poll.

---

## Step 1 — Validate

Check the path exists. Read the file and confirm a `## Invariant Delta` heading is present with at least one entry under `### Added` or `### Withdrawn`. If neither block exists, error with: "ADR has no invariant delta — use /plan-feature to author one, or use a regular code commit if no contract is changing."

---

## Step 2 — Spawn invariant-compiler

```
Agent({
  subagent_type: "invariant-compiler",
  description: "Compile invariants: <adr-name>",
  prompt: "Compile the invariant delta block in <path>. For every ### Added entry, author a compiling verifier at the named path. For every ### Withdrawn entry, remove the named verifier. Report the result."
})
```

The agent runs with no conversation context (its frontmatter declares `background: true` so the call is async by default). It reads the ADR, the codebase, and existing verifier files for pattern. It writes verifier code only — no production code.

**Wait for the completion notification — do not poll.**

On any subsequent loop iteration, re-invoke with the prior error/divergence as added context.

---

## Step 3 — Build gate

After the compiler returns, run from the project root (or wherever the verifiers live — read `spec.registry`'s parent directory from `spec-driven-config.json`):

```bash
go build ./...
go vet ./...
```

(For non-Go projects, use the project's equivalent build/lint runners. The methodology is mechanism-neutral; the principle is "every authored verifier compiles.")

If either fails, capture the output and **go back to Step 2** with the failure as additional context for the compiler. Loop until both pass.

---

## Step 4 — Roundtrip gate (layer-2 audit)

For each verifier the compiler just authored or touched, spawn the layer-2 evaluator:

```
Agent({
  subagent_type: "invariant-testing-evaluator",
  description: "Roundtrip: <invariant-id>",
  prompt: "The registry entry is at <registry-path>, id <invariant-id>. The verifier code is at <verifier-path>. Read the verifier, reconstruct the invariant statement from the test code alone, then diff against the registered definition. Report CLEAN or drift."
})
```

Multiple verifiers can be roundtripped in parallel — spawn each call in its own message turn (or batch them in a single message with multiple Agent calls; each runs in background per its frontmatter).

**Wait for completion notifications.** Aggregate results.

If any verifier reports drift, classify the divergence:

- **Verifier wrong** (under-asserts, over-asserts, or non-asserting): re-invoke `invariant-compiler` with the evaluator's report as the prompt. Go back to Step 2.
- **Definition wrong** (the divergence reveals the registered prose is imprecise or claims something the test author judged differently): the verifier author can't fix this — the definition is on the contract surface and must be sharpened by `/plan-feature` (the master session). Return early with a backpressure report; the caller decides whether to refine the definition and re-invoke.

If every verifier returns CLEAN, both gates pass — proceed to Step 5.

---

## Step 5 — Return

Hand the final report back to the caller (typically `/plan-feature`):

```
COMPILE-INVARIANTS REPORT (final)

Added: <count>
Withdrawn: <count>

Build gate: PASS
Roundtrip gate: PASS

Per-invariant test status (informational):
- <id>: PASS | FAIL with reason — expected if impl pending
```

The caller commits the ADR + verifier files together (the methodology's `methodology.registry.verifier_resolves` invariant enforces their co-commit).

If the loop returned with backpressure (definition needs sharpening), the report flags those invariants:

```
BACKPRESSURE — definition refinement needed

For each flagged invariant:
- <id>: <evaluator's divergence report>
- Recommended action: <sharpen definition: ... | re-author verifier: ...>
```

The caller (/plan-feature) refines the affected definitions in the ADR and re-invokes /compile-invariants.

---

## Why this skill exists

The methodology requires every `### Added` invariant to ship with a verifier that (a) compiles and (b) actually expresses the contract its definition claims. Without automation, authors either skip writing the verifier (drift) or block on mechanical translation. The compiler does the translation; the layer-2 roundtrip ensures the translation didn't drift from the contract.

The verifier is the contract's executable form. Authoring it is the precision-forcing function — a contract that can't be expressed as a verifier wasn't precise enough. The roundtrip is what enforces "expressed faithfully" rather than "expressed at all."
