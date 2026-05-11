# ADR: Validators as Single Source of Truth (Tests Become Their Complement)

**Status**: accepted
**Status history**:
- 2026-05-11: draft
- 2026-05-11: accepted — design audit CLEAN after 3 rounds; compile-invariants stage committed (interface + 32 unit tests; build red by design per foundational-ADR loosening of ADR-0078's compile-gate); registry.yaml carries 31 supersessions + 1 net-new entry; dev-harness writes the concrete validator in a follow-up /feature-change

## Overview

Course-correction on the methodology's verifier architecture introduced under ADR-0078 and shipped with the `sdd verify` CLI in `ce23cf2` / `03e18b9` / `2d08227`. The current shape has check logic split across `spec/*_test.go` files (where it serves both as "validator" and "lifecycle check"), with a duplicate hand-rolled subset in `cmd/sdd/verify.go`. This inversion causes:

1. **Coverage drift** — 14 of 31 methodology invariants are hand-checked by the binary; the other 17 only run via `verify[]` shell-out. A consumer that omits `verify[]` silently loses half the gate.
2. **Duplicate logic** — `checkRegistryIDField()` in `cmd/sdd/verify.go` re-implements `TestRegistryIDField` in `registry_test.go`. They can drift.
3. **Conflated failure modes** — when `TestRegistryIDField` fails, you can't tell whether the validator is buggy or the registry has a bad entry.

The correction: validators move to `spec/checks.go` as ordinary Go functions. Tests in `spec/checks_test.go` become **unit tests** that feed synthetic inputs and assert behavior. The CLI dispatches the validators against any loaded registry. Self-application becomes implicit (the CLI run against `agent-plugins/spec/registry.yaml` is the methodology validating itself).

Invariant definitions sharpen accordingly: they become **claims about validator behavior**, not claims about registry data. The data conformance check moves entirely to runtime (`sdd verify`).

## Motivation

ADR-0078's bootstrap order produced the inversion: verifiers were authored in `*_test.go` first (because `verifier:` field semantics pointed at test files). When the CLI was added in `/feature-change` after ADR-0078's acceptance, Go's `_test.go` package isolation rule prevented direct import — so the CLI hand-rolled a parallel implementation for the checks it needed.

The cost surfaced during the verify-suite gate run after the CLI shipped: `sdd verify` exited 1 with cleanly-localizable structural pass output plus the verify[] shell-out catching what the built-ins missed. The user's question — "where's the proof that it runs the invariants?" — surfaced both that the binary's coverage is partial AND that the architecture itself is inverted.

The deeper realization: the registered "invariants" today are claims about *data shape* ("every registry entry's id matches X"). Operationally, the validator enforces these claims. But the contract surface should be the validator's behavior, not the data's shape — because validators are deterministic and ship in CI; data is variable runtime input. A claim like "the validator flags entries whose id doesn't match X, and accepts entries that do" is bounded, testable with synthetic inputs, and independent of any particular registry.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validator surface | Validators are methods on a concrete `validator` struct (unexported) satisfying an exported `Validator` interface declared in `src/sdd/spec/checks_interface.go`. The interface lists all 32 method signatures. Concrete type lives in `spec/checks.go` (authored by dev-harness, not invariant-compiler). | Interface + concrete pattern formalizes the contract surface in Go. Future readers see the full validator contract in one place (`checks_interface.go`). Methods-on-receiver is slight ceremony vs free functions but earns the interface-documentation benefit + the compile-time satisfaction check (see next row). |
| Interface satisfaction enforcement | Compile-time assertion `var _ Validator = (*validator)(nil)` lives in **test code** (`spec/checks_validator_test.go`), not in production code (`spec/checks.go`). A second assertion `var _ Validator = newValidator()` is wrapped in a test function for explicit-registry discovery. Both assertions enforce satisfaction at compile time — drift fails the build with a precise method-missing or signature-mismatch error. | Enforcement of the satisfaction contract is itself a contract, so it belongs on the test side under the role boundary. Production code (`checks.go`) merely IMPLEMENTS — it doesn't assert what it implements. The test code asserts. Same shape as `EntryID` being protected by test references: the test surface pins the contract; dev-harness can't drift without breaking the test build. |
| Validator struct fields (`CheckError`, `Config`) | Concrete struct definitions live in `spec/checks.go` (or a sibling file), authored by dev-harness. Method signatures in `checks_interface.go` REFERENCE these types but don't define them. Go's package-level type resolution makes this work at build time. Interface file has interface declarations only — no struct definitions. | "Interface file = interface declarations" is the strict role boundary. Structs are concrete types with fields — they hold data, which is implementation. Going further (wrapping data shapes in interfaces themselves) is polymorphism theater for data that has no meaningful alternative implementation. The data SHAPES are still part of the contract (test-immutability pins their field names), but the type declarations live in dev-harness territory. |
| Validator method signature | `func (v validator) CheckXxx(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError` — all methods take the same input bundle. Variants that don't need all inputs ignore irrelevant ones. `CheckError` has structured fields: `EntryID`, `Field`, `Path`, `Message`. | Uniform signature lets the CLI iterate the registered methods and dispatch without per-check shims. Structured error supports CLI output, programmatic consumers, and test assertions equally. |
| Check registration | `AllChecks []NamedCheck` slice in `src/sdd/spec/checks_registry.go` (authored by dev-harness). Each entry is `{Name, Method, InvariantID}` where `Method` is a method value bound to the singleton `validator` instance. Topological sort runs at package init by the `Requires` graph from `Registry`. | Explicit beats reflection. Adding a check = add a method to the interface + concrete + slice entry. The registry file is dev-harness's territory because it threads concrete instances; invariant-compiler doesn't touch it. |
| Test shape | `spec/checks_test.go` (or split per area: `checks_registry_test.go`, etc.). Each check has table-driven tests covering: known-bad input (must flag), known-good input (must accept), edge cases (empty registry, single entry, cycles, etc.). | Table-driven is the cleanest shape for "feed synthetic input → assert validator response." Tests are blind to `spec.Registry` — they never read the embedded data. |
| Test purpose | Tests verify validator correctness. Tests pass iff validators are correctly implemented. Tests do NOT pass-or-fail based on whether the methodology's own registry conforms — that's `sdd verify`'s job at runtime. | Separation of concerns. Validator bug → `go test` fails. Registry violation → `sdd verify` fails. Two failure modes, two signals, two fixes. |
| Invariant definitions | Sharpened from "claims about data" to "claims about validator behavior." Example: `methodology.registry.id_field` definition changes from "every registry entry's id matches `^[a-z]...$`" to "`CheckRegistryIDField` returns a `CheckError` for any registry entry whose id doesn't match `^[a-z]...$`, and returns no error for entries whose id matches." | The invariant *is* a claim about the validator. The validator is the contract's executable form. The test bounds the claim's truth space. |
| Verifier field semantics | `verifier:` still points at a test path (e.g. `spec/checks_test.go::TestCheckRegistryIDField`). But the test is now a real unit test bounding validator behavior with synthetic inputs, not a thinly-disguised runtime application against the embedded registry. | Test = the thing that proves the invariant. Validator = the thing the invariant is a claim about. Runtime = where validators are applied to real registries. Three layers. |
| `methodology.registry.verifier_field` itself | Definition narrows: "every active registry entry's `verifier:` field resolves to a test function in `spec/checks_<area>_test.go` (or `cmd/sdd/verify_test.go`) that exercises the validator named in the invariant's definition with synthetic inputs." | The verifier-field invariant gets a sharper claim — it's not just "path resolves," it's "path resolves to a test of the right shape." Mechanically enforced by `methodology.validator.test_shape_unit_only` (the AST-walking meta-check this ADR registers). |
| CLI dispatcher | `cmd/sdd/verify.go` imports `spec.AllChecks`, iterates, calls each check function with the loaded state, reports results. Drops `checkRegistryIDField()` and all sibling hand-rolled functions. `runStructuralChecks` becomes a 5-line loop. | Single dispatcher. Single source of check logic. Coverage gap closes — 31/31 covered. |
| ADR delta walk in CLI | Stays in CLI (not moved to a check). The per-ADR walk that emits `structural.adr.adr-NNNN-*.md` PASS lines is operationally distinct from an invariant check — it's a *dispatcher* that runs the same registered checks against each ADR file. | The walk is glue, not contract logic. Keeping it in `cmd/sdd/verify.go` is correct. |
| Migration scope | All 31 affected invariants get supersession entries in this ADR's Invariant Delta. New invariant IDs use the `methodology.validator.<area>_<thing>` prefix (e.g. `methodology.validator.registry_id_field` succeeding `methodology.registry.id_field`). Two additional net-new invariants — `methodology.validator.concrete_satisfies_interface` and `methodology.validator.test_shape_unit_only` — bring the total to **33 entries**. | A single ADR captures the architectural shift atomically. Staging across multiple ADRs would mix old and new shapes mid-flight, which is exactly the inversion this ADR fixes. |

| Invariant ID prefix | New invariants adopt `methodology.validator.<area>_<thing>`. Old IDs flip to withdrawn via supersession. e.g., `methodology.registry.id_field` → `methodology.validator.registry_id_field`. | Makes the architectural shift visible at the ID layer. Future readers of `registry.yaml` immediately see that these are claims about validators, not data. Predecessors' references in older ADRs (0078) become "see superseded" pointers — that's the correct historical shape. |
| `CheckError` shape | Structured fields: `EntryID string` (offending registry/glossary/ADR id), `Field string` (e.g. `"definition"`, `"verifier"`), `Path string` (file:line, optional), `Message string` (human-readable prose). Validators populate what's relevant per error; nil/empty for what isn't. | Programmatic consumers (dashboard, audit triage, future tooling) need structured data they can render, filter, sort, group. Tests assert on `EntryID` + `Field` without string matching. CLI renders `Message` for human output. Trade-off vs. flat string: ~30 LOC of struct definition + slight per-validator overhead, in exchange for downstream cleanliness. |
| `AllChecks` ordering | Topological sort by `requires:` DAG at registration time. Prerequisites run before dependents. Implementation: ~30 LOC graph sort in `spec/checks_registry.go` runs once on package init. | Surfaces dependency operationally — if `requires_targets_exist` fails, you know `id_field` was checked first and is OK. Self-documenting. Supports future short-circuiting (skip downstream checks when a prerequisite fails). Cost is negligible (one-time topo at startup). Source-order is fragile (any reordering of the slice silently breaks the dispatch contract); alphabetical is deterministic but ignores the registered dependency structure. |
| CLI test split | The four `methodology.validator.cli_*` invariants split by what's testable: `cli_runs_structural_checks` and `cli_walks_adr_dir` move to unit tests in `cmd/sdd/verify_test.go` (call internal dispatcher functions with synthetic state); `cli_exit_codes` and `cli_shells_to_config` stay as integration tests in `spec/cli_test.go` (fork the binary; assert subprocess behavior). | Honest mapping of contracts to test shapes. Some claims genuinely require subprocess invocation (exit codes, env handling, recursion guard); others are properties of internal functions that can be tested directly. Splitting preserves coverage and keeps each test at the right level. Cost: have to export CLI internals (`runStructuralChecks`, `runWalkADRs`, etc.) — small refactor. |
| Test-shape mechanical enforcement | New invariant `methodology.validator.test_shape_unit_only`: AST-walker scans every `*_test.go` file under `<project>/spec/` AND `<project>/cmd/sdd/` for direct references to `spec.Registry` or `spec.Glossary` (the methodology's embedded data); flags any test that reads them. Validator: `CheckTestShapeUnitOnly` (in `spec/checks.go`, authored by dev-harness). Verifier: AST test in `spec/checks_validator_test.go::TestCheckTestShapeUnitOnly`. | Discipline is cheap to follow but invisible to enforcement — a future test that quietly reads `spec.Registry` re-conflates the failure modes this ADR is trying to separate. Registering as an invariant catches regressions automatically; ~80 LOC AST walker + table-driven tests. Cost worth the protection because the inversion this ADR fixes is exactly the kind that crept in without anyone noticing. Scope covers both `spec/` and `cmd/sdd/` so the dispatcher-test files (`cmd/sdd/verify_test.go`) are also bound. |
| Test file layout | Split per area: `checks_registry_test.go`, `checks_glossary_test.go`, `checks_adr_test.go`, `checks_cross_cutting_test.go`, `checks_config_test.go`, `checks_validator_test.go` (for the new `test_shape_unit_only` meta-check). Each ~150-200 LOC. | Mirrors the registry's logical grouping. Easier to navigate, cleaner merge surfaces during the rewrite. Single-file alternative would be ~750 LOC — heavy enough to slow grep + review. |
| Authoring role separation (HARD) | **invariant-compiler authors only `_test.go` and `_interface.go` files (plus `registry.yaml` edits).** dev-harness authors all other Go files (`checks.go`, `checks_registry.go`, edits to `cmd/sdd/`). **dev-harness MUST NOT edit any `_test.go` or `_interface.go` file.** If a test is wrong or the interface needs to change, the fix routes through /plan-feature backpressure → ADR update → /compile-invariants regenerates. Discipline enforced by dev-harness agent prompt + reviewer discipline; mechanical enforcement deferred. | Without hard separation, dev-harness can "win" by making tests less strict instead of implementing validators correctly — the methodology degenerates into goal-post-moving. Strict separation is the load-bearing rule: tests author the contract; implementation satisfies it. The two roles are adversarial by design. |
| Compile-gate scope (loosened for foundational ADRs) | ADR-0078's "verifier MUST compile in the same commit" gate is **loosened**: for foundational ADRs that introduce new architectural types (like this one), the compile-gate is satisfied across the /plan-feature → /feature-change boundary. After /compile-invariants: tests + interface exist; concrete `validator` struct doesn't; `go build ./...` fails with "undefined: validator". That failure IS dev-harness's input — it precisely tells it what production code to write. Foundational ADRs document the loosening explicitly in their Decision history. | Otherwise the chicken-and-egg makes foundational ADRs impossible: tests can't compile until validators exist; validators can't exist until tests demand them. The loosening recognizes that some ADRs introduce the architecture itself; for those, the build-fail state is intermediate-correct, not a contract violation. Non-foundational ADRs continue to satisfy the strict same-commit gate. |


## User Flow

Authoring or auditing the methodology after this ADR lands:

1. **Add a new methodology invariant.** Add the entry to `registry.yaml` with a `methodology.validator.<area>_<thing>` id and a definition like "`CheckXxx` flags ..., accepts ...". Add `CheckXxx(reg, glos, cfg, adrDir) []CheckError` to the `Validator` interface in `spec/checks_interface.go`. dev-harness then adds the method body to the `validator` struct in `spec/checks.go` and registers it in `AllChecks` (`spec/checks_registry.go`). Author table-driven tests in the matching `spec/checks_<area>_test.go` covering bad inputs (must flag) and good inputs (must accept).
2. **Run the validator suite locally.** `go test ./spec/` verifies the validator code is correct. `./bin/sdd verify` runs all validators against the methodology's own registry; exits 1 if any registered invariant has data that violates a rule.
3. **Add a check that's a property of a different artifact** (e.g., glossary, config, ADR). Same shape: method on the `validator` struct in `spec/checks.go`, registered in `AllChecks` (`spec/checks_registry.go`), tested with synthetic inputs in the matching `spec/checks_<area>_test.go`.
4. **Diagnose a failure**:
   - `go test ./spec/` fails → validator bug. Fix `spec/checks.go::CheckXxx`. Tests guide which input combinations behave wrong.
   - `sdd verify` fails → registry has data that violates a rule. Fix the registry entry, or supersede the invariant if the rule is wrong.

## Component Changes

### `src/sdd/spec/` (rewrite)

- **New**: `spec/checks.go` — concrete `validator` struct + 32 methods (one per registered invariant: 31 ports + 1 AST-walker `CheckTestShapeUnitOnly`); concrete `CheckError` struct (`{EntryID, Field, Path, Message}`); concrete `Config` struct (mirrors `sddConfig` JSON shape); `newValidator() Validator` constructor. **No compile-time `var _ Validator` assertion in production code — that lives in test code, see next item.** **(in scope, dev-harness authors)**
- **New addition to** `spec/checks_validator_test.go` — two compile-time assertions wrapped in `TestValidatorInterfaceSatisfaction`: `var _ Validator = (*validator)(nil)` and `var _ Validator = newValidator()`. Asserts at compile time that concrete + constructor both satisfy the interface. Enforcement lives on the test side. **(in scope, invariant-compiler authors as part of compile-invariants stage)**
- **New**: `spec/checks_registry.go` — `var AllChecks []NamedCheck` (initialized in init() with topological sort by `Requires` DAG) + `type NamedCheck struct{Name, Method, InvariantID}`. `CheckError` type lives in `checks_interface.go`. **(in scope, dev-harness authors)**
- **Rewritten**: `spec/registry_test.go`, `spec/glossary_test.go`, `spec/adr_delta_test.go`, `spec/cross_cutting_test.go`, `spec/config_test.go`, `spec/cli_test.go` — each test function becomes a table-driven unit test feeding synthetic inputs to a validator and asserting behavior. Test functions take the same names as today (so `verifier:` paths in `registry.yaml` don't need to change beyond the file name) but the bodies are entirely different. **(in scope)**
- **Preserved**: `spec/loader.go`, `spec/types.go`, `spec/adr_parser.go` — parsing primitives unchanged. **(no change)**

### `src/sdd/cmd/sdd/verify.go` (simplification)

- **Removed**: `checkRegistryIDField`, `checkRegistryDefinitionField`, `checkRegistryVerifierField`, `checkRegistryStatusField`, `checkRegistryGlossaryTermsField`, `checkRegistryRequiresTargetsExist`, `checkRegistryRequiresDAGAcyclic`, `checkRegistrySupersedesTargetsExist`, `checkRegistryNoAndInDefinition`, all `checkGlossary*` functions. ~400 LOC deleted. **(in scope)**
- **Rewritten**: `runStructuralChecks()` — replaces hand-rolled list with:
  ```go
  for _, c := range spec.AllChecks {
      errs := c.Func(reg, glos, cfg, adrDir)
      results = append(results, toCheckResult(c.Name, errs))
  }
  ```
  ~10 LOC. **(in scope)**
- **Preserved**: config loading, ADR walk, `verify[]` shell-out, recursion guard. **(no change)**

### `src/sdd/spec/registry.yaml` (mass supersession)

- 31 supersession entries + 2 net-new entries under `### Added` in this ADR's delta (`concrete_satisfies_interface`, `test_shape_unit_only`). Each supersession carries `supersedes: <old_id>`; predecessors flip to `status: withdrawn` automatically via delta reconciliation. New IDs use the `methodology.validator.<area>_<thing>` prefix. New definitions are claims about validator behavior. **(in scope)**
- Old entries flip to `status: withdrawn` automatically via delta reconciliation. Predecessors' verifier paths are unchanged (the test functions are rewritten in place; their names stay). **(in scope)**

### `src/sdd/docs/context.md`

- One paragraph added explaining the "validators are the contract surface; tests bound them; CLI applies them" framing. Surfaces the architecture to consumer LLMs. **(in scope)**

### Retired

- Hand-rolled structural checks in `cmd/sdd/verify.go`. Replaced by `spec.AllChecks` dispatch.
- The pattern of "tests run validators against the methodology's own embedded registry." Replaced by `sdd verify`'s runtime application.

## Data Model

### `CheckError` type

```go
package spec

type CheckError struct {
    EntryID string  // offending registry/glossary/ADR id, if applicable
    Field   string  // e.g., "id", "definition", "verifier"
    Path    string  // optional file:line for code-grounded errors
    Message string  // human-readable prose
}
```

### `Validator` interface + `NamedCheck` registry

The interface lives in `spec/checks_interface.go` (authored by invariant-compiler). All 32 methods share one signature:

```go
package spec

type Validator interface {
    CheckRegistryIDField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
    CheckRegistryDefinitionField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
    // ... 31 more methods (32 total including CheckTestShapeUnitOnly)
}
```

The concrete `validator` struct and dispatch slice live in `spec/checks.go` + `spec/checks_registry.go` (authored by dev-harness, not invariant-compiler):

```go
package spec

type validator struct{}
func (v validator) CheckRegistryIDField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError { /* real logic */ }
// ... 31 more method bodies

// Note: the compile-time satisfaction assertion (`var _ Validator = (*validator)(nil)`)
// lives in test code at spec/checks_validator_test.go, not here. Production code implements;
// test code asserts satisfaction.

type NamedCheck struct {
    Name        string                                                                                       // dispatch label, e.g., "registry.id_field"
    Method      func(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError         // method value bound to the singleton validator
    InvariantID string                                                                                       // e.g., "methodology.validator.registry_id_field"
}

var AllChecks []NamedCheck  // initialized in init() from a hard-coded slice, then topologically sorted by Requires DAG
```

### Sharpened invariant definition shape

Before (today's `methodology.registry.id_field`):
```yaml
- id: methodology.registry.id_field
  definition: Every active registry entry's `id` field matches the regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`.
  verifier: registry_test.go::TestRegistryIDField
```

After:
```yaml
- id: methodology.validator.registry_id_field
  definition: The validator `CheckRegistryIDField` (in `spec/checks.go`) returns a `CheckError` for every active registry entry whose `id` field does not match the regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`, and returns no error for entries whose `id` does match.
  verifier: spec/checks_registry_test.go::TestCheckRegistryIDField
  supersedes: methodology.registry.id_field
  status: active
```

`supersedes` already encodes the lineage edge to the predecessor; no `requires:` entry is needed for the same target (it would be a hollow edge — the predecessor is `withdrawn` and won't appear in `AllChecks` ordering).

## Error Handling

- **Validator panics**: `CheckXxx` should never panic on well-formed input. Tests cover input edge cases (nil, empty, oversized). Panics on malformed input route through `loader.go`'s parse-time errors, not the validator.
- **Loaded state nil**: validators accept nil `cfg` or empty `glos` gracefully (return appropriate `CheckError` or no error, depending on the check's contract). Tests cover the nil cases.
- **CLI dispatch failure**: if `AllChecks` is empty (the slice somehow got cleared at build time), `sdd verify` reports a clear error and exits non-zero. Specific message and exit-code shape is defensive behavior, not a registered contract; it should never trigger in practice because `AllChecks` is populated at package init.

## Security

No new security surface. The architectural correction reorganizes existing code without adding capabilities. Validators remain pure-data over loaded structs; no network, file, or process access beyond what loader.go already provides.

## Impact

Touches:
- `src/sdd/spec/checks.go` (new), `spec/checks_registry.go` (new).
- All `spec/*_test.go` files (rewritten as unit tests).
- `src/sdd/cmd/sdd/verify.go` (simplified; ~400 LOC removed).
- `src/sdd/spec/registry.yaml` (31 supersession entries + 2 net-new entries added; 31 predecessors flipped to `status: withdrawn`).
- `src/sdd/docs/context.md` (one paragraph added).

Subsumes:
- ADR-0081 was originally queued for "narrow `requires_delta` + `requires_decision_history`" (legacy ADR scope). Under this architecture, the narrowing happens naturally as a follow-up: the validator `CheckADRRequiresDelta` can include a scope predicate ("skip ADRs whose status-history starts before 2026-05-08"), and the invariant's new definition reflects that. The follow-up ADR moves to a later number (0082+) and is much smaller (definition tweak + validator behavior tweak, no new mechanism).

Doesn't touch:
- The verify[] shell-out mechanism (still useful for per-mechanism verifiers in non-Go languages).
- The audit chain (Layers 1-3 remain unchanged in shape).
- Consumer-facing dispatch contract (`*.eval.yaml` extension routing per ADR-0080 still applies once 0080 lands).

## Scope

**In v1:**
- All 31 existing methodology invariants get their definitions sharpened to claims about validator behavior (via supersession); 1 net-new invariant (`methodology.validator.test_shape_unit_only`) is added.
- Validator logic lives in `spec/checks.go` (single source).
- Tests live in `spec/checks_test.go` (or split files), feed synthetic inputs, assert validator behavior.
- CLI dispatcher in `cmd/sdd/verify.go` imports `spec.AllChecks`, drops hand-rolled duplicates.
- `context.md` updated with the new framing.

**Deferred:**
- Consumer-project examples of registering their own checks (deferred until first consumer needs it).
- `sdd run <invariant-id>` selective dispatcher (still parked in ADR-0079).
- Generalizing the `AllChecks` registry to support consumer-defined validators (Day-1 is methodology-only).

## Invariant Delta

### Added

All 31 supersession entries below follow the same pattern: new id with `methodology.validator.<area>_<thing>` prefix, sharpened definition framed as a claim about validator behavior (e.g. "`CheckXxx` returns a `CheckError` for entries that violate the rule, returns no error for entries that satisfy it"), verifier path pointing at the corresponding unit test in `spec/checks_*_test.go` (or `cmd/sdd/verify_test.go` for unit-testable CLI invariants, or `spec/cli_test.go` for integration-test-only CLI invariants), and `supersedes:` edge to the predecessor. The 32nd entry is net-new (the AST-walking meta-check). For readability, full YAML is shown for the first entry and the new entry; the remaining 30 supersession entries follow the same shape and are listed compactly.

```yaml
# 1. Registry schema (5 entries) — supersessions
- id: methodology.validator.registry_id_field
  definition: The validator `CheckRegistryIDField` returns a `CheckError` for every active registry entry whose `id` field does not match the regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`, and returns no error for entries whose `id` does match.
  verifier: spec/checks_registry_test.go::TestCheckRegistryIDField
  supersedes: methodology.registry.id_field
  glossary_terms: []
  status: active

- id: methodology.validator.registry_definition_field
  definition: The validator `CheckRegistryDefinitionField` returns a `CheckError` for every active registry entry whose `definition` field is empty or contains newlines, and returns no error for entries whose `definition` is a non-empty single-line string.
  verifier: spec/checks_registry_test.go::TestCheckRegistryDefinitionField
  supersedes: methodology.registry.definition_field
  status: active

- id: methodology.validator.registry_verifier_field
  definition: The validator `CheckRegistryVerifierField` returns a `CheckError` for every active registry entry whose `verifier` field is empty, does not contain `::` (path::FuncName form), or whose referenced file/function path is malformed; returns no error otherwise.
  verifier: spec/checks_registry_test.go::TestCheckRegistryVerifierField
  supersedes: methodology.registry.verifier_field
  status: active

- id: methodology.validator.registry_status_field
  definition: The validator `CheckRegistryStatusField` returns a `CheckError` for every active registry entry whose `status` field is not one of `active` or `withdrawn`; returns no error for entries with a valid status.
  verifier: spec/checks_registry_test.go::TestCheckRegistryStatusField
  supersedes: methodology.registry.status_field
  status: active

- id: methodology.validator.registry_glossary_terms_field
  definition: The validator `CheckRegistryGlossaryTermsField` returns a `CheckError` for every active registry entry whose `glossary_terms` field is not a YAML array of strings; returns no error for entries with a (possibly empty) string array.
  verifier: spec/checks_registry_test.go::TestCheckRegistryGlossaryTermsField
  supersedes: methodology.registry.glossary_terms_field
  status: active

# 2. Glossary schema (4 entries) — supersessions
- id: methodology.validator.glossary_term_field
  definition: The validator `CheckGlossaryTermField` returns a `CheckError` for every glossary entry whose `term` field is empty or non-string; returns no error for entries with a non-empty term.
  verifier: spec/checks_glossary_test.go::TestCheckGlossaryTermField
  supersedes: methodology.glossary.term_field
  status: active

- id: methodology.validator.glossary_definition_field
  definition: The validator `CheckGlossaryDefinitionField` returns a `CheckError` for every glossary entry whose `definition` field is empty or non-string; returns no error otherwise.
  verifier: spec/checks_glossary_test.go::TestCheckGlossaryDefinitionField
  supersedes: methodology.glossary.definition_field
  status: active

- id: methodology.validator.glossary_resolves_to_field
  definition: The validator `CheckGlossaryResolvesToField` returns a `CheckError` for every glossary entry whose `resolves_to` field is non-empty but does not point to a valid typed binding identifier; returns no error for entries with empty or valid `resolves_to`.
  verifier: spec/checks_glossary_test.go::TestCheckGlossaryResolvesToField
  supersedes: methodology.glossary.resolves_to_field
  status: active

- id: methodology.validator.glossary_scope_field
  definition: The validator `CheckGlossaryScopeField` returns a `CheckError` for every glossary entry whose `scope` field is not one of `methodology`, `project-cross-cutting`, or `component-local`; returns no error otherwise.
  verifier: spec/checks_glossary_test.go::TestCheckGlossaryScopeField
  supersedes: methodology.glossary.scope_field
  status: active

# 3. ADR delta schema (2 entries) — supersessions
- id: methodology.validator.adr_delta_added_block
  definition: The validator `CheckADRDeltaAddedBlock` returns a `CheckError` for every ADR whose `## Invariant Delta` section has an `### Added` block with malformed YAML entries (missing required fields, wrong types); returns no error for well-formed blocks.
  verifier: spec/checks_adr_test.go::TestCheckADRDeltaAddedBlock
  supersedes: methodology.adr_delta.added_block
  status: active

- id: methodology.validator.adr_delta_withdrawn_block
  definition: The validator `CheckADRDeltaWithdrawnBlock` returns a `CheckError` for every ADR whose `### Withdrawn` block has malformed YAML entries (missing required fields like `id`, `reason`); returns no error for well-formed blocks.
  verifier: spec/checks_adr_test.go::TestCheckADRDeltaWithdrawnBlock
  supersedes: methodology.adr_delta.withdrawn_block
  status: active

# 4. Cross-cutting (8 entries) — supersessions
- id: methodology.validator.registry_verifier_resolves
  definition: The validator `CheckVerifierResolves` returns a `CheckError` for every active registry entry whose `verifier` path does not resolve to an existing file or to an existing function within that file; returns no error for entries whose verifier resolves.
  verifier: spec/checks_cross_cutting_test.go::TestCheckVerifierResolves
  supersedes: methodology.registry.verifier_resolves
  status: active

- id: methodology.validator.registry_verifier_unique
  definition: The validator `CheckVerifierUnique` returns a `CheckError` for every pair of active registry entries that share the same `verifier` path; returns no error if all active verifier paths are unique.
  verifier: spec/checks_cross_cutting_test.go::TestCheckVerifierUnique
  supersedes: methodology.registry.verifier_unique
  status: active

- id: methodology.validator.adr_delta_reconciles
  definition: The validator `CheckDeltaReconciles` returns a `CheckError` when the set of currently-active registry IDs differs from Σ(Added IDs) − Σ(Withdrawn IDs) computed across every `## Invariant Delta` block in `<spec.adr_dir>`; returns no error when the sum reconciles.
  verifier: spec/checks_cross_cutting_test.go::TestCheckDeltaReconciles
  supersedes: methodology.adr.delta_reconciles
  status: active

- id: methodology.validator.glossary_complete
  definition: The validator `CheckGlossaryComplete` returns a `CheckError` for every term appearing in an active registry entry's `glossary_terms` field that does not resolve to a glossary entry; returns no error when every cited term resolves.
  verifier: spec/checks_cross_cutting_test.go::TestCheckGlossaryComplete
  supersedes: methodology.glossary.complete
  status: active

- id: methodology.validator.registry_requires_targets_exist
  definition: The validator `CheckRequiresTargetsExist` returns a `CheckError` for every `requires:` reference in an active registry entry that does not resolve to another existing registry entry; returns no error when all references resolve.
  verifier: spec/checks_cross_cutting_test.go::TestCheckRequiresTargetsExist
  supersedes: methodology.registry.requires_targets_exist
  status: active

- id: methodology.validator.registry_requires_dag_acyclic
  definition: The validator `CheckRequiresDAGAcyclic` returns a `CheckError` when the directed graph formed by active registry entries' `requires:` edges contains a cycle; returns no error when the graph is acyclic.
  verifier: spec/checks_cross_cutting_test.go::TestCheckRequiresDAGAcyclic
  supersedes: methodology.registry.requires_dag_acyclic
  status: active

- id: methodology.validator.registry_supersedes_targets_exist
  definition: The validator `CheckSupersedesTargetsExist` returns a `CheckError` for every active registry entry whose `supersedes:` field references a non-existent entry, or references an entry whose status is not `withdrawn`; returns no error when all supersession links resolve correctly.
  verifier: spec/checks_cross_cutting_test.go::TestCheckSupersedesTargetsExist
  supersedes: methodology.registry.supersedes_targets_exist
  status: active

- id: methodology.validator.tests_bound_to_registry
  definition: The validator `CheckTestsBoundToRegistry` returns a `CheckError` for every test function in `spec/checks_*_test.go` (or sibling verifier files) that does not correspond to an active registry entry's `verifier:` field; returns no error when every test is bound to a registered invariant.
  verifier: spec/checks_cross_cutting_test.go::TestCheckTestsBoundToRegistry
  supersedes: methodology.tests.bound_to_registry
  status: active

# 5. Registry quality (1 entry) — supersession
- id: methodology.validator.registry_no_and_in_definition
  definition: The validator `CheckNoAndInDefinition` returns a `CheckError` for every active registry entry whose `definition` field matches the case-insensitive regex `\band\b`; returns no error for entries whose definitions do not contain a logical AND.
  verifier: spec/checks_registry_test.go::TestCheckNoAndInDefinition
  supersedes: methodology.registry.no_and_in_definition
  status: active

# 6. ADR structural (2 entries) — supersessions
- id: methodology.validator.adr_requires_delta
  definition: The validator `CheckADRRequiresDelta` returns a `CheckError` for every `adr-*.md` file under `<spec.adr_dir>` that lacks a `## Invariant Delta` section, or whose section has no entries under `### Added` or `### Withdrawn`; returns no error for ADRs with a populated delta block.
  verifier: spec/checks_adr_test.go::TestCheckADRRequiresDelta
  supersedes: methodology.adr.requires_delta
  status: active

- id: methodology.validator.adr_requires_decision_history
  definition: The validator `CheckADRRequiresDecisionHistory` returns a `CheckError` for every `adr-*.md` file under `<spec.adr_dir>` that lacks a `## Decision history (rationale notes)` section; returns no error when the section is present.
  verifier: spec/checks_adr_test.go::TestCheckADRRequiresDecisionHistory
  supersedes: methodology.adr.requires_decision_history
  status: active

# 7. Config schema (5 entries) — supersessions
- id: methodology.validator.config_spec_registry
  definition: The validator `CheckConfigSpecRegistry` returns a `CheckError` when a loaded `spec-driven-config.json`'s `spec.registry` field is empty, missing, or does not point to an existing file; returns no error when present and valid.
  verifier: spec/checks_config_test.go::TestCheckConfigSpecRegistry
  supersedes: methodology.config.spec_registry
  status: active

- id: methodology.validator.config_spec_glossary
  definition: The validator `CheckConfigSpecGlossary` returns a `CheckError` when a loaded config's `spec.glossary` field is missing or invalid; returns no error otherwise.
  verifier: spec/checks_config_test.go::TestCheckConfigSpecGlossary
  supersedes: methodology.config.spec_glossary
  status: active

- id: methodology.validator.config_spec_adr_dir
  definition: The validator `CheckConfigSpecADRDir` returns a `CheckError` when a loaded config's `spec.adr_dir` field is missing or does not point to an existing directory; returns no error otherwise.
  verifier: spec/checks_config_test.go::TestCheckConfigSpecADRDir
  supersedes: methodology.config.spec_adr_dir
  status: active

- id: methodology.validator.config_spec_reactions_dir
  definition: The validator `CheckConfigSpecReactionsDir` returns a `CheckError` when a loaded config's `spec.reactions_dir` field is missing or invalid; returns no error otherwise.
  verifier: spec/checks_config_test.go::TestCheckConfigSpecReactionsDir
  supersedes: methodology.config.spec_reactions_dir
  status: active

- id: methodology.validator.config_verify_array_well_formed
  definition: The validator `CheckConfigVerifyArray` returns a `CheckError` when a loaded config's `verify` field is present but is not a JSON array of strings; returns no error when absent or well-formed.
  verifier: spec/checks_config_test.go::TestCheckConfigVerifyArray
  supersedes: methodology.config.verify_array_well_formed
  status: active

# 8. CLI behavior (4 entries) — supersessions; split unit + integration
- id: methodology.validator.cli_runs_structural_checks
  definition: The validator (a unit test in `cmd/sdd/verify_test.go`) asserts that the CLI's `runStructuralChecks` function dispatches every entry in `spec.AllChecks` exactly once when invoked.
  verifier: cmd/sdd/verify_test.go::TestRunStructuralChecksDispatchesAll
  supersedes: methodology.cli.verify_runs_structural_checks
  status: active

- id: methodology.validator.cli_exit_codes
  definition: The validator (an integration test in `spec/cli_test.go`) asserts that the `sdd verify` binary exits non-zero when any registered check returns a `CheckError`, and exits zero when all checks pass.
  verifier: spec/cli_test.go::TestVerifyExitCodes
  supersedes: methodology.cli.verify_exit_codes
  status: active

- id: methodology.validator.cli_shells_to_config
  definition: The validator (an integration test in `spec/cli_test.go`) asserts that the `sdd verify` binary executes every command listed in `spec-driven-config.json`'s `verify[]` array, in order, with the canonical config path propagated via the `SDD_VERIFY_RUNNING_CONFIG` env var to break same-config recursion.
  verifier: spec/cli_test.go::TestVerifyShellsToConfig
  supersedes: methodology.cli.verify_shells_to_config
  status: active

- id: methodology.validator.cli_walks_adr_dir
  definition: The validator (a unit test in `cmd/sdd/verify_test.go`) asserts that the CLI's ADR-walk function reads `<spec.adr_dir>` from config, globs `adr-*.md` (root only, never nested), parses each one's `## Invariant Delta` block via `spec.ParseADRDeltaBlock`, and returns the parsed deltas to the dispatcher.
  verifier: cmd/sdd/verify_test.go::TestRunWalkADRsParsesDeltas
  supersedes: methodology.cli.verify_walks_adr_dir
  status: active

# 9. NEW: interface-satisfaction enforcement (1 entry) — net-new invariant
- id: methodology.validator.concrete_satisfies_interface
  definition: The concrete `validator` type and the `newValidator()` constructor return value both satisfy the `Validator` interface. Asserted at compile time by `var _ Validator = (*validator)(nil)` and `var _ Validator = newValidator()` in `spec/checks_validator_test.go::TestValidatorInterfaceSatisfaction`. Drift in either signature or method count fails `go build`.
  verifier: spec/checks_validator_test.go::TestValidatorInterfaceSatisfaction
  requires: []
  glossary_terms: []
  status: active

# 10. NEW: test-shape meta-check (1 entry) — net-new invariant
- id: methodology.validator.test_shape_unit_only
  definition: The validator `CheckTestShapeUnitOnly` returns a `CheckError` for every `*_test.go` file under `<project>/spec/` (or `<project>/cmd/sdd/`) that contains an AST reference to `spec.Registry` or `spec.Glossary` (the methodology's embedded data); returns no error when no test file reads the embedded registry/glossary directly. Synthetic inputs constructed in the test body are not flagged; only direct reads of the package-level vars are.
  verifier: spec/checks_validator_test.go::TestCheckTestShapeUnitOnly
  requires:
    - methodology.validator.registry_id_field
  glossary_terms: []
  status: active
```

### Withdrawn

(None directly. The 31 predecessor entries flip to `status: withdrawn` via supersession-chain reconciliation; their `verifier:` paths remain pointing at the old test function names — which no longer exist after this commit, because the test files are rewritten. Predecessor entries stay in the registry for historical traceability per ADR-0078's "Invariant status: Two states (`active` / `withdrawn`)" decision.)

*(A subtle consequence: `methodology.validator.registry_verifier_resolves` will report `CheckError` for any withdrawn entry whose verifier path no longer resolves. The validator's implementation must therefore restrict the resolution check to active entries — verifier_resolves should not fire on withdrawn predecessors. This is part of the rewrite.)*

## Decision history (rationale notes)

**Why validators are the single source, not the tests.** Today's tests `Registry.TestRegistryIDField` both implement the rule logic AND apply it to the methodology's own embedded registry. That conflates two concerns: "is the rule correctly implemented?" and "does the methodology's data conform to its rules?" The first is a property of code; the second is a property of data at runtime. Separating them means a registry violation no longer triggers a test failure (it triggers a runtime failure in `sdd verify`), and a validator bug no longer hides behind a passing-registry coincidence (synthetic-input tests would catch it even if every real entry happens to be valid).

**Why tests are the complement to validators, not the validators themselves.** A test that runs `CheckRegistryIDField(spec.Registry)` and asserts no errors is a runtime check disguised as a test — it passes iff the real registry happens to conform. A real test feeds synthetic inputs: known-bad entries (must flag), known-good entries (must accept), edge cases (empty, single, cycles). It passes iff the validator correctly enforces the rule, regardless of what the real registry looks like. This is the standard testing discipline; the current shape violates it because the bootstrap order put the rule logic inside `_test.go` files.

**Why invariant definitions become claims about validator behavior.** Before this ADR, `methodology.registry.id_field`'s definition reads "every registry entry's id matches X" — a claim about data. After, it reads "`CheckRegistryIDField` flags entries whose id doesn't match X, accepts entries whose id matches" — a claim about a function. The shift matters because the validator is the *executable form of the contract* (per ADR-0078's "verifier is the executable form"), and the validator's behavior is what determines whether the rule is enforced in practice. Claims about data drift as data changes; claims about validators are stable as long as the rule stands.

**Why supersession, not mechanical edit.** ADR-0078 specifies: "Substantive changes to a `definition` (the contract surface) are not edits; they route through Supersession." Today's definitions are claims about data; tomorrow's are claims about validator behavior. That's a substantive shift in what the contract surface is — operational semantics change even though the rule remains the same. Each of the 31 affected invariants gets a supersession entry. Predecessors flip to withdrawn; their verifier paths still resolve (test functions are rewritten in place, names unchanged).

**Why a single ADR for all 31 supersessions, not staged.** Staging across multiple ADRs would mix old-shape and new-shape invariants mid-flight — exactly the inversion this ADR fixes. Cross-cutting refactors that require coordination across many entries should land as a single atomic ADR (per ADR-0078's "ADR delta block structure" decision: deltas are atomic units). The cost is one fat ADR; the benefit is no half-state.

**Why the CLI's ADR-walk stays in `cmd/sdd/verify.go`, not migrated to `spec/checks.go`.** The per-ADR walk is operationally a dispatcher loop — it iterates ADR files and applies the same registered check (`CheckADRDelta`) to each. The walk itself isn't a check; it's how the check is applied multiple times. Moving the walk into `spec/` would conflate "what the validator does" with "how often it runs." Keeping it in the CLI preserves separation: validators define what; dispatcher (CLI) decides how often and against what.

**Why `verifier_field` semantics narrow but the field name stays.** ADR-0078's `methodology.registry.verifier_field` said: "every entry has a verifier path that resolves to a real file/function." This ADR narrows the definition: the test that the path resolves to must bound the validator's behavior with synthetic inputs, not run the validator against the embedded registry. The field name `verifier` stays — semantically it still means "the test that proves this invariant." The shape of "proves" sharpens.


**Why this ADR runs before the legacy-ADR rule-narrowing (originally queued as 0081).** Under the corrected architecture, the rule narrowing becomes much smaller: it's a behavior tweak on `CheckADRRequiresDelta` (add a date predicate) plus a definition tweak on the corresponding invariant. Under the inverted architecture, it would have been a more complex multi-file change. Doing the architectural fix first lets the smaller change land cleanly. The rule narrowing moves to a later ADR.

**Why `methodology.validator.*` prefix instead of keeping IDs stable.** Two options were on the table: keep IDs stable (only definitions and verifier paths change) vs. add a `validator.` prefix to mark the architectural shift. Picked the prefix. The shift is operationally substantive — the contract surface moves from data to validator behavior — and that's exactly the kind of change that should be visible from the ID alone, not require reading the definition. The cost is real (31 ID changes propagate through every `requires:` reference and every ADR that cites an invariant), but every citation becomes a "see superseded" pointer — the correct historical shape under invariant-driven dev. Future readers who skim `registry.yaml` immediately see "validator.*" and know they're reading claims about functions, not data.

**Why structured `CheckError` over flat `Message` string.** Considered: ship a flat `Message` string that the CLI prints and tests substring-match. Rejected: that's a lossy contract that pushes parsing burden onto every downstream consumer (CLI pretty-print, dashboard, audit triage, future tooling). Structured fields (`EntryID`, `Field`, `Path`, `Message`) cost ~30 LOC of struct definition and a slight per-validator overhead, in exchange for clean downstream rendering and assertion. Tests can assert on `EntryID == "methodology.registry.id_field"` and `Field == "id"` without fragile string matching. The Message field stays for human-readable prose.

**Why topological sort over alphabetical or source order.** Three options on the table: source-order (today's behavior — fragile to refactors), alphabetical (deterministic but blind to dependencies), topological by `requires:` DAG (self-documenting + supports short-circuiting). Picked topo. The `requires:` graph in the registry already encodes operational dependency; running validators in dependency order means failures localize correctly — if `requires_targets_exist` reports a problem, you know `id_field` ran first and the entry's id was at least well-formed. Topo sort runs once at package init; cost is negligible (<31 nodes, dense graph). Short-circuiting downstream checks on prerequisite failure is a deferred optimization, but the ordering enables it cheaply later.

**Why split the CLI tests into unit + integration instead of all-integration or all-unit.** All-integration (the current shape) covers subprocess behavior but is heavy for testing internal dispatcher logic. All-unit (refactor every CLI behavior into testable internals) loses coverage of real subprocess semantics — exit codes, env propagation, the recursion guard. Splitting is the honest middle: claims that are properties of internal functions (`cli_runs_structural_checks` = "dispatcher iterates AllChecks"; `cli_walks_adr_dir` = "walker returns ADR files from configured dir") move to unit tests; claims that genuinely require subprocess (`cli_exit_codes` = "process exits 1 on failure"; `cli_shells_to_config` = "verify[] commands are exec'd with the right env") stay as integration tests. Each contract gets tested at the right level. Cost: have to export a few CLI internals — small.

**Why register a meta-invariant for test-shape rather than rely on discipline.** Three options on the table: discipline (PR review), mechanical enforcement (AST walker), or defer until drift evidence. Picked mechanical. The shape-drift this ADR fixes (tests doubling as validators against the methodology's own embedded data) is exactly the kind of inversion that crept in silently during the bootstrap — no one wrote a PR comment saying "your test is conflating two failure modes." That's the canonical signal that the rule needs enforcement that doesn't require humans to catch. A new invariant `methodology.validator.test_shape_unit_only` with an AST-walking verifier (`CheckTestShapeUnitOnly`) scans `*_test.go` files for direct references to `spec.Registry` or `spec.Glossary` and flags any test that reads them. Cost: ~80 LOC of AST walking + table-driven unit tests. Benefit: the very kind of regression this ADR exists to fix can never silently recur.

**Why split test files per area, not one giant `checks_test.go`.** Single-file alternative would be ~750 LOC — heavy enough to slow grep and review. Splitting per area (`checks_registry_test.go`, `checks_glossary_test.go`, `checks_adr_test.go`, `checks_cross_cutting_test.go`, `checks_config_test.go`, `checks_validator_test.go`) mirrors the registry's logical grouping. Each file ~150-200 LOC. Easier to navigate, cleaner merge surfaces during the actual rewrite. The discovery overhead ("which file holds TestCheckXxx?") is trivial — IDE jump-to-symbol handles it.

**Why the interface-satisfaction assertion lives in test code, not in production code.** Initial draft put `var _ Validator = (*validator)(nil)` in `spec/checks.go` (production), alongside the concrete `validator` definition. User pushback: the assertion is itself a contract check — "concrete satisfies interface" is a claim that gets enforced. Under the methodology's role boundary, enforcement of contracts lives in test code; implementation lives in production code. So the assertion moves to `spec/checks_validator_test.go`, wrapped in `TestValidatorInterfaceSatisfaction`. Two assertions: `var _ Validator = (*validator)(nil)` (catches concrete-type drift) and `var _ Validator = newValidator()` (catches constructor-return-type drift). Both fail at compile time if dev-harness's implementation drifts from the interface; the test never runs at runtime. Same shape as the test-immutability rule protecting field names (`EntryID`, etc.) — the test surface pins the contract; dev-harness can't drift without breaking the test build. Registered as `methodology.validator.concrete_satisfies_interface` in this ADR's Invariant Delta.

**Why use an interface + concrete pattern instead of free functions.** Two shapes considered: free functions (`func CheckXxx(reg []Invariant) []CheckError`) directly in `spec/checks.go`, or methods on a concrete `validator` struct satisfying an exported `Validator` interface. Picked the interface pattern. Three real benefits: (1) the interface declaration in `checks_interface.go` is a single-file, declarative contract surface — future readers see all 32 validator methods in one place by signature; (2) Go's structural typing + the compile-time assertion `var _ Validator = (*validator)(nil)` catches drift between interface and implementation at build time — dev-harness can't silently implement a method with the wrong signature; (3) the interface gives a clean role-separation seam — invariant-compiler authors the interface (contract surface); dev-harness authors the concrete struct (implementation). Free functions don't have an interface analog in Go; they don't give the compile-time check. Cost: methods-on-receiver ceremony (slight). Tests need an interface instance — either via a noop in `_test.go` or a test helper. Worth it for the interface-as-contract framing.

**Why invariant-compiler authors only `_test.go` and `_interface.go` (HARD role separation).** Without a hard line, dev-harness could edit tests to make them pass — moving the goal posts instead of implementing validators correctly. The methodology depends on tests being the immutable contract surface that drives implementation. So: invariant-compiler authors tests + interface declarations (the contract). dev-harness authors implementations (the satisfaction). dev-harness MUST NOT edit `_test.go` or `_interface.go` files. If a test is wrong, the fix routes through /plan-feature backpressure: ADR update → re-run /compile-invariants → tests get regenerated. Discipline enforced by dev-harness agent prompt + reviewer discipline at PR boundaries; mechanical enforcement (e.g., git-diff filter forbidding test edits in dev-harness commits) is deferred to a follow-up ADR if drift evidence justifies it.

**Why the compile-gate loosens for foundational ADRs.** ADR-0078's rule "verifier MUST compile in the same commit as the ADR" assumes the validator type already exists — for normal feature ADRs that's true. For *foundational* ADRs that introduce the architecture itself (like this one), the rule creates a chicken-and-egg: the test can't compile until the validator exists; the validator can't exist until the test demands it. Resolution: loosen the gate for foundational ADRs. After /compile-invariants: tests + interface authored; build fails on undefined concrete `validator`. That failure state is the input to dev-harness's first /feature-change run, which authors `checks.go` (concrete validator), `checks_registry.go` (AllChecks slice), and edits `cmd/sdd/verify.go` to use them — making the build pass. The compile-gate is satisfied at the /feature-change boundary, not within /plan-feature. Non-foundational ADRs continue to satisfy the strict same-commit gate. Foundational ADRs identify themselves by explicitly noting the loosening in Decision history (like this one does).

## Open questions

Resolved (during this ADR's authoring, batch 1):

- ~~Prefix for sharpened invariants~~ — **`methodology.validator.<area>_<thing>`**. See Decisions table and Decision history.
- ~~`CheckError` granularity~~ — **Structured fields** (`EntryID`, `Field`, `Path`, `Message`). See Decisions table and Decision history.

Resolved (during this ADR's authoring, batch 2):

- ~~`AllChecks` ordering~~ — **Topological sort by `requires:` DAG**. See Decisions table and Decision history.
- ~~`cli_test.go` migration~~ — **Split unit + integration**. Two of the four CLI invariants move to `cmd/sdd/verify_test.go` (dispatcher loop, ADR walk); two stay in `spec/cli_test.go` (exit codes, shell-out subprocess behavior). See Decisions table and Decision history.

Resolved (during this ADR's authoring, batch 3):

- ~~Test-shape mechanical enforcement~~ — **New invariant + AST-walker** (`methodology.validator.test_shape_unit_only`). See Decisions table and Decision history.
- ~~Per-area test file split~~ — **Split per area**. See Decisions table.

(No items still open.)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| Validator unit test scaffolding | Each of the 33 sharpened/new invariants has a unit test in `spec/checks_<area>_test.go` (or `cmd/sdd/verify_test.go` for the 2 unit-testable CLI ones) that exercises its validator with at least one known-bad input (flags) and one known-good input (accepts) | Author tests as part of this ADR's compile-invariants stage; `go test ./spec/ -v` runs them all (will fail red against undefined `newValidator` until dev-harness lands the concrete struct) | Each `CheckXxx` method, split test files per area |
| CLI dispatch end-to-end | `sdd verify` invokes every entry in `spec.AllChecks` against the methodology's own registry; output includes one `PASS|FAIL structural.<check.Name>` line per check | Run `./bin/sdd verify` against the methodology repo; assert output line count == len(AllChecks) | `cmd/sdd/verify.go`, `spec.AllChecks`, all validators |
| Lifecycle failure → CLI signal | A registry entry with an invalid `id` causes `sdd verify` to exit 1 with the offending entry surfaced; `go test` continues to pass (because the validator is correctly implemented; the failure is data-side) | Synthetic registry with one bad entry; run both `go test` and `sdd verify` | Validator, CLI, registry loader |
| Validator bug → test failure | A regression in `CheckRegistryIDField` (e.g., wrong regex) causes the corresponding unit test to fail; `sdd verify` may still exit 0 if the real registry happens to satisfy even the buggy validator | Synthetic bug introduced in `spec/checks.go`; `go test ./spec/ -run TestCheckRegistryIDField` fails | Unit tests, validator |
| Supersession chain consistency | The 31 supersession entries each have a `supersedes:` field pointing at the corresponding predecessor; `methodology.registry.supersedes_targets_exist` continues to pass; the 31 predecessor entries flip to `status: withdrawn` automatically via delta reconciliation | Run `sdd verify` post-merge; assert all 31 chains resolve | Registry, delta_reconciles, supersedes_targets_exist |

## Implementation Plan

| Component | Lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------|---------------------------|-------|
| `spec/checks.go` (validators, 32 methods on the concrete `validator` struct: 31 ports of existing test logic + the AST-walker `CheckTestShapeUnitOnly`) | 500-750 | 120k | One method per registered invariant; ports logic from existing `*_test.go`. AST walker uses `go/ast` + `go/parser`. |
| `spec/checks_registry.go` (NamedCheck, CheckError, AllChecks slice + topo sort) | 130-180 | 35k | Types + 32-entry slice + topological-sort init. |
| Rewrite `*_test.go` as unit tests (split per area: `checks_registry_test.go`, `checks_glossary_test.go`, `checks_adr_test.go`, `checks_config_test.go`, `checks_cross_cutting_test.go`, `checks_validator_test.go`) | 800-1100 | 170k | Table-driven; ~64 test cases (2 per check minimum) + AST-walker test fixtures. Each file ~150-200 LOC. |
| `cmd/sdd/verify_test.go` (unit tests for the 2 unit-testable CLI invariants) | 100-150 | 30k | Export `runStructuralChecks`, `runWalkADRs`; test with synthetic state. |
| Simplify `cmd/sdd/verify.go` (delete hand-rolled `checkXxx`; import `spec.AllChecks`; iterate) | -400 / +40 | 40k | Net -360 LOC. |
| Update `cmd/sdd/cli_test.go` (keep `TestVerifyExitCodes`, `TestVerifyShellsToConfig`; remove the 2 that moved to unit tests) | -100 | 20k | Wait — this file is actually at `spec/cli_test.go`. Same logic: remove the 2 that moved. |
| Update registry.yaml (31 supersession entries + 1 new entry; flip 31 predecessors to `status: withdrawn`) | 310 | 60k | Mechanical from the new validator signatures. |
| Update context.md (one paragraph on the validator/test/CLI separation) | 8 | 10k | Surfaces the new framing to consumer LLMs. |
| Plugin build (version bump + dist propagation) | n/a | 5k | Run `go run build.go`. |

**Total estimated tokens**: ~490k
**Estimated wall-clock**: ~4-6 days of dev-harness work, paced by the test-rewriting (mechanical but tedious) and the AST walker (which is the only genuinely new piece of code; the rest is port-and-restructure).
