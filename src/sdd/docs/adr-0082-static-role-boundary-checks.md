# ADR: Static Role-Boundary Validators (Capturing This Session's Sharp Edges)

**Status**: accepted
**Status history**:
- 2026-05-11: draft
- 2026-05-11: accepted — design audit PASS (two minor cosmetic findings fixed inline: registry definition truncation + value-vs-pointer receiver mismatch in Decisions table); compile-invariants stage already on disk (interface + 3 unit tests + 3 registry entries); build red on the 3 new method names by design; dev-harness writes the bodies in a follow-up /feature-change

## Overview

Register three new methodology invariants that mechanically enforce role-boundary discipline via AST walkers, capturing lessons from ADR-0081's authoring session where prompt-level discipline failed multiple times:

1. **`methodology.validator.interface_file_purity`** — `*_interface.go` files contain only `type X interface { ... }` declarations. No struct/concrete-type definitions. (Caught the user-pushback "structs are code, not interfaces" mid-ADR-0081.)
2. **`methodology.validator.no_test_scaffolding_types`** — `*_test.go` files don't define concrete `Validator`-satisfying types (`noopValidator`, `stubValidator`, `fakeValidator`, or any struct with the full Validator method set). (Caught the user-pushback "dev-harness shall not touch the _test files!" preventing test-side scaffolding that would let dev-harness "win" by editing tests.)
3. **`methodology.validator.no_production_satisfaction_assertions`** — `var _ <Interface> = <expr>` compile-time satisfaction assertions live only in `*_test.go` files. (Caught the user-pushback "those two should be tested in the _test.go side" moving the `var _ Validator = (*validator)(nil)` assertion out of production code.)

Each follows the existing `methodology.validator.test_shape_unit_only` shape: AST walker via `go/ast` + `go/parser`, registered method on the `validator` struct, real unit test with a synthetic file corpus exercising known-bad + known-good fixtures.

Builds on the strict role separation declared in ADR-0081's "Authoring role separation (HARD)" decision. Where ADR-0081 captured the rule in prose, this ADR encodes it mechanically. Bumps methodology's active registry from 33 to 36 entries.

## Motivation

ADR-0081's authoring session exposed a recurring failure mode: I (the master session) authored agent dispatch prompts that violated the methodology's role-boundary rules, and only the user catching them prevented bad commits. Specifically:

- Initial `/compile-invariants` dispatch had invariant-compiler authoring stub validator structs in `checks.go` (production code in invariant-compiler's territory).
- Second dispatch had invariant-compiler defining `noopValidator` in `_test.go` files, providing test-side scaffolding that let dev-harness "win" trivially.
- Initial ADR-0081 draft put `CheckError struct` + `Config struct` in `checks_interface.go` (concrete types in interface file).
- Initial dev-harness dispatch was told to put `var _ Validator = (*validator)(nil)` in `checks.go` (production assertion).

Each was caught by user pushback (5 instances counted by the meta-audit during ADR-0081 implementation). Each is the exact kind of leak prompt-level discipline cannot prevent reliably: the rule lives in the skill text or in agent prompts, but agents (and master sessions authoring prompts) can drift.

The methodology's own protection mechanism is the registry: register the rule, author a verifier, the verifier catches future drift mechanically. Three of the lessons from ADR-0081 are *statically* checkable today (AST walks on Go source). The remaining lessons (skill-text-vs-claim alignment, gate-on-binary-not-test-runner, agent-output-conformance) are behavioral and wait for ADR-0080's eval-as-verifier mechanism.

This ADR captures the static-checkable subset now. The behavioral ones land with ADR-0080.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validator pattern | Each of the three checks is a new method on the existing `validator` struct in `spec/checks.go`. Method signature matches the existing Validator interface: `func (v *validator) CheckXxx(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError` (pointer receiver, consistent with the other 33 methods on `*validator`). The `reg` / `glos` / `cfg` parameters are unused for these file-scanning checks; `adrDir` provides the project root anchor for resolving file paths. | Reuses the established architecture from ADR-0081. No new interface category, no new dispatch path. Each new validator is a sibling of `CheckTestShapeUnitOnly`. |
| File walking root | Project root = `filepath.Dir(adrDir)` (same convention as `CheckVerifierResolves` after the ADR-0081 path-resolution fix). Walks `<root>/spec/` AND `<root>/cmd/sdd/`. | Consistent with the methodology's existing path-resolution discipline. Same anchor point used elsewhere. Avoids inventing a new "project root" parameter. |
| Interface file detection | A "interface file" is any Go source file whose name matches `*_interface.go` (case-insensitive). The methodology declares this convention; any consumer adopting invariant-driven dev follows it. | Filename convention is the simplest signal. Alternative (e.g., scan files for `interface` keyword and classify dynamically) is more brittle. The convention is already documented in ADR-0081. |
| What counts as "concrete type definition" in an interface file | Any `type X struct { ... }` declaration. Type aliases (`type X = Y`) and interface declarations are allowed. | Struct declarations are the canonical concrete-data type in Go. Catching `type X struct` is the load-bearing signal. Permits type aliases for legitimate use cases. |
| What counts as a forbidden "methodology-interface-satisfying type" in test files | A struct type declared in a `_test.go` file whose method set is a superset of any interface declared in a `*_interface.go` file in the same module. Detected via AST: (1) walk `*_interface.go` files and collect the method sets of each declared interface; (2) walk `_test.go` files and for each struct declaration, collect methods defined on it in the same file; (3) flag the struct if its method set covers any collected interface's method set. | Catches `noopValidator`/`stubValidator`/`fakeValidator` patterns regardless of name. Generalizes to future methodology interfaces (e.g., a hypothetical `LoaderInterface` in `loader_interface.go`) — fakes of any methodology interface are forbidden automatically without rule updates. Generic test mocks (e.g., `mockHTTPClient`, `fakeFileReader` satisfying unrelated interfaces) remain allowed because those interfaces aren't declared in `*_interface.go` files. Method-set structural matching is robust against creative naming; name-pattern matching (e.g., regex on `noop*`) is fragile. |
| What counts as a "satisfaction assertion" | A package-level `var _ <expr> = <expr>` declaration where the LHS type is an interface declared in the same package (or imported package), and the assignment is in a non-`_test.go` file. Detected via AST: walk `GenDecl` of kind `VAR`, check identifier is `_`, check type is an interface name resolvable in the package. | Captures the specific Go idiom for compile-time interface satisfaction. Doesn't flag arbitrary `var _ = ...` patterns (which are common for unused-variable workarounds and should remain allowed). |
| Test corpus shape | Each new test uses `t.TempDir()` to construct a synthetic test corpus: 1-2 files that should be flagged (known-bad), 1-2 files that should be accepted (known-good), 1-2 edge cases (empty file, file with no relevant declarations). Table-driven, same shape as `TestCheckTestShapeUnitOnly`. | Matches established pattern. Synthetic inputs only; never reads the actual methodology source. |
| Migration scope | Three net-new invariants. No supersession. No predecessors to flip to `withdrawn`. Bumps active count from 33 → 36. | These are new claims, not refinements of existing ones. |
| Foundational-ADR loosening applies | This ADR introduces new methods on the existing `validator` interface + struct. Per ADR-0081's "compile-gate scope (loosened for foundational ADRs)" decision, the new test files reference undefined methods until dev-harness lands them. Build is red after `/compile-invariants`; dev-harness writes the method bodies in `checks.go` to satisfy. | Inherited from ADR-0081's architectural pattern. Adding methods to an existing interface is a contract change that follows the same red-build-as-input pattern. |

## User Flow

Same as ADR-0081's authoring flow, scoped narrowly:

1. **Author this ADR + Invariant Delta** with 3 new entries.
2. **`/compile-invariants`** — invariant-compiler:
   - Extends the `Validator` interface in `spec/checks_interface.go` with 3 new method signatures.
   - Appends 3 new test functions to existing `spec/checks_validator_test.go` (or a new file if grouping suggests).
   - Appends 3 new entries to `spec/registry.yaml`.
3. **`/feature-change` (dev-harness)** — implements:
   - 3 new method bodies on the `validator` struct in `spec/checks.go`.
   - Registers 3 new `NamedCheck` entries in `spec/checks_registry.go`.
4. **Verify**: `./bin/sdd verify` exits 0 (modulo legacy-ADR scope failures).

## Component Changes

### `spec/checks_interface.go` (extend the `Validator` interface)

Add 3 method signatures:
```go
CheckInterfaceFilePurity(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
CheckNoTestScaffoldingTypes(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
CheckNoProductionSatisfactionAssertions(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
```

**(in scope, invariant-compiler authors)**

### `spec/checks.go` (add 3 methods on the `validator` struct)

Three new AST-walking validators. Each ~60-100 LOC.

- `CheckInterfaceFilePurity`: walks files matching `*_interface.go`; for each, parses the AST and flags any `*ast.StructType` declaration. Returns `CheckError{Path: file, Message: "...", Field: "type declaration"}` per violation.
- `CheckNoTestScaffoldingTypes`: (1) enumerates all `*_interface.go` files in the module and collects each declared interface's method set; (2) walks `*_test.go` files; for each struct declaration, collects methods defined on it in the same file; (3) flags the struct if its method set is a superset of any collected interface's method set. Resolves interface method sets by introspecting interface declarations in `*_interface.go` files via AST. Mocks of unrelated interfaces (not declared in `*_interface.go`) remain allowed.
- `CheckNoProductionSatisfactionAssertions`: walks all non-`_test.go` `.go` files under `<root>/spec/` and `<root>/cmd/sdd/`; flags package-level `var _ <Identifier> = <expr>` declarations where the identifier resolves to an interface type. Returns `CheckError{Path: file:line, Field: "var declaration", Message: "satisfaction assertion belongs in _test.go"}`.

**(in scope, dev-harness authors)**

### `spec/checks_registry.go` (add 3 entries to `AllChecks`)

```go
{"validator.interface_file_purity", v.CheckInterfaceFilePurity, "methodology.validator.interface_file_purity"},
{"validator.no_test_scaffolding_types", v.CheckNoTestScaffoldingTypes, "methodology.validator.no_test_scaffolding_types"},
{"validator.no_production_satisfaction_assertions", v.CheckNoProductionSatisfactionAssertions, "methodology.validator.no_production_satisfaction_assertions"},
```

**(in scope, dev-harness authors)**

### `spec/checks_validator_test.go` (append 3 new tests)

Each follows the established `TestCheckTestShapeUnitOnly` shape: `t.TempDir()` corpus, table-driven cases, assert on `EntryID` + `Field` + `Path`.

**(in scope, invariant-compiler authors)**

### `spec/registry.yaml` (append 3 new entries)

Per the Invariant Delta below. No predecessors flipped.

**(in scope, invariant-compiler authors)**

## Data Model

No new types. Uses existing `CheckError` (defined in `spec/checks.go`) and `Validator` interface (declared in `spec/checks_interface.go`).

## Error Handling

- **File not found / permission denied**: validator returns `CheckError{Path: file, Message: "<reason>"}` and continues. Doesn't crash on transient FS errors.
- **AST parse failure**: validator returns `CheckError{Path: file, Message: "parse error: <reason>"}` and skips the file. Other files continue.
- **Empty project root**: if `adrDir` is empty or doesn't resolve to a project, each new validator returns no errors (zero files to scan). Same as `CheckTestShapeUnitOnly`'s behavior.

## Security

No new security surface. AST walking is local-file-only.

## Impact

Touches:
- `spec/checks_interface.go` (add 3 method signatures to `Validator`).
- `spec/checks.go` (add 3 method implementations).
- `spec/checks_registry.go` (register 3 in `AllChecks`).
- `spec/checks_validator_test.go` (add 3 unit tests).
- `spec/registry.yaml` (add 3 entries).

Subsumes nothing. Pure addition.

## Scope

**In v1:**
- 3 new static AST-walking validators registered as methodology invariants.
- Each enforced by `./bin/sdd verify` against the methodology's own source.

**Deferred:**
- Behavioral / agent-output role-boundary contracts (gate-on-binary, skill-text-matches-claim, etc.) — wait for ADR-0080's eval mechanism.
- Cross-language extensions (these AST walkers are Go-only). Per ADR-0078's "Language-binding scope (Day-1): Go-only" decision, that's correct.

## Invariant Delta

### Added

```yaml
- id: methodology.validator.interface_file_purity
  definition: The validator `CheckInterfaceFilePurity` returns a `CheckError` for every file matching `*_interface.go` (under `<project>/spec/` or `<project>/cmd/sdd/`) that contains a `type X struct { ... }` declaration; returns no error when interface files contain only interface declarations and type aliases.
  verifier: spec/checks_validator_test.go::TestCheckInterfaceFilePurity
  requires:
    - methodology.validator.test_shape_unit_only
  glossary_terms: []
  status: active

- id: methodology.validator.no_test_scaffolding_types
  definition: The validator `CheckNoTestScaffoldingTypes` returns a `CheckError` for every struct type declared in a `*_test.go` file (under `<project>/spec/` or `<project>/cmd/sdd/`) whose method set in the same file is a superset of any interface declared in a `*_interface.go` file in the same module; returns no error when no test file defines a concrete methodology-interface-satisfying type. Detects `noopValidator`, `stubValidator`, `fakeValidator`, and any naming variant by structural method-set matching. Generic test mocks of unrelated interfaces (e.g. external libraries, HTTP clients) remain allowed because those interfaces aren't declared in `*_interface.go` files.
  verifier: spec/checks_validator_test.go::TestCheckNoTestScaffoldingTypes
  requires:
    - methodology.validator.test_shape_unit_only
    - methodology.validator.interface_file_purity
  glossary_terms: []
  status: active

- id: methodology.validator.no_production_satisfaction_assertions
  definition: The validator `CheckNoProductionSatisfactionAssertions` returns a `CheckError` for every package-level `var _ <Identifier> = <expr>` declaration in a non-`_test.go` `.go` file (under `<project>/spec/` or `<project>/cmd/sdd/`) where the identifier resolves to an interface type in the package; returns no error when all interface-satisfaction assertions live in test code only.
  verifier: spec/checks_validator_test.go::TestCheckNoProductionSatisfactionAssertions
  requires:
    - methodology.validator.test_shape_unit_only
  glossary_terms: []
  status: active
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why these three specifically, and why now.** Five role-boundary failures occurred during ADR-0081's authoring (stub validators in production, noop in tests, struct defs in interface file, compile-time assertion in production, scaffolding in test files). Three are statically checkable on Go source: interface-file purity, no-Validator-types-in-tests, no-production-satisfaction-assertions. The remaining two (behavioral patterns about agent dispatch and gate selection) require eval-as-verifier and wait for ADR-0080. Capturing the three static ones now means future role-boundary leaks of these specific shapes are caught mechanically, not by the user. The cost is ~3 hours of dev-harness work (3 AST walkers × ~80 LOC). The benefit is permanent protection against this session's most-frequent failure mode.

**Why method-set matching, not name pattern, for `no_test_scaffolding_types`.** Considered: regex on type names like `noop*` / `stub*` / `fake*`. Rejected: name-based matching is fragile. A future scaffolding type named `MockValidator` or `InMemoryValidator` would bypass the check. Method-set matching is robust because it captures the *structural* violation: "test code defines a thing that satisfies a methodology interface." Implementation cost is moderate — walk the AST, collect method declarations per receiver type, compare against the canonical interface method sets (introspected from `*_interface.go` files). The trade-off is worth it.

**Why "any interface from `*_interface.go` files" rather than hardcoding `spec.Validator`.** User pushback during ADR-0082 authoring: the initial draft would have forbidden ALL Validator-satisfying types in test files, including legitimate mocks of unrelated interfaces. Tightened to: only flag fakes of interfaces declared in the methodology's own `*_interface.go` files. Generic test mocks (e.g., `mockHTTPClient` satisfying an external `http.Client` interface) remain allowed — they're standard Go testing practice and don't trigger the failure mode (dev-harness can't "win" by satisfying an unrelated interface). Future-proofs the rule against new methodology interfaces (e.g., a hypothetical `LoaderInterface` introduced later): the validator dynamically enumerates interface declarations in `*_interface.go` at runtime; no rule update needed when a new interface is added. The scoping rule "interfaces declared in `*_interface.go` ARE the methodology's contract surface" composes with `methodology.validator.interface_file_purity` (only interfaces live in those files) to give a clean "you can't mock methodology surface in tests" contract.

**Why this ADR doesn't introduce a `var _ <expr>` rule with exceptions.** Considered: allow `var _ = expr` (the common unused-variable workaround) but flag `var _ <Identifier> = expr`. Picked the narrower rule (only flag when LHS is an interface). Reason: `var _ = expr` has legitimate uses; only the interface-satisfaction case is a contract leak. The detection is precise (AST node has a TypeIdent we can resolve), so the narrower rule doesn't sacrifice coverage.

**Why these are validators on the existing `Validator` interface, not a new interface family.** Considered: introduce a `MetaValidator` interface for "checks about the methodology itself." Rejected: it's not operationally distinct. Each new check takes the same input bundle and returns the same `[]CheckError`. Splitting interfaces would mean two dispatch paths in `cmd/sdd/verify.go` for no semantic benefit. Reusing `Validator` keeps the architecture flat.

**Why no new test file (`checks_static_role_boundary_test.go` or similar), just append to `checks_validator_test.go`.** Considered: split into its own file by area. Rejected: the existing `checks_validator_test.go` already holds `TestCheckTestShapeUnitOnly` (the AST-walker meta-check) plus `TestValidatorInterfaceSatisfaction` (the satisfaction-assertion test). The three new tests are siblings — all AST-walking meta-checks. Grouping them together mirrors the existing structure. If `checks_validator_test.go` exceeds ~600 LOC after this addition, a follow-up can split; today it's still manageable.

**Why these are Class B, not corrective edits to ADR-0081.** Considered: amend ADR-0081 to include these three invariants instead of authoring a new ADR. Rejected: ADR-0081 is `implemented`, which under ADR-0078's lifecycle rules makes it immutable for substantive changes. The "ADR-vs-amendment" distinction is exactly what supersession is for. But these three invariants aren't superseding anything in ADR-0081 — they're additive contracts that didn't exist before. New ADR is the correct shape.

## Open questions

(No items still open. All three invariants are concretely scoped; AST-walker implementation is mechanical from the existing `CheckTestShapeUnitOnly` pattern.)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| `interface_file_purity` flags struct in interface file | TempDir corpus: one `foo_interface.go` with a struct declaration → must flag; one with only interface declarations → must accept | t.TempDir; os.WriteFile | CheckInterfaceFilePurity, go/ast, go/parser |
| `no_test_scaffolding_types` flags noop pattern | TempDir corpus: one `_test.go` defining `noopValidator` with all 36 Validator methods → must flag; one with only test functions → must accept | t.TempDir; os.WriteFile; introspect Validator method set | CheckNoTestScaffoldingTypes, AST method-set matching |
| `no_test_scaffolding_types` doesn't flag partial implementations | TempDir corpus: `_test.go` defining a type with 3 methods (not a full Validator) → must accept; the rule fires only on full satisfaction | t.TempDir | CheckNoTestScaffoldingTypes |
| `no_production_satisfaction_assertions` flags assertion in checks.go | TempDir corpus: one production file with `var _ Validator = (*validator)(nil)` → must flag; one with only struct + method definitions → must accept | t.TempDir; resolve Validator identifier | CheckNoProductionSatisfactionAssertions |
| End-to-end: real registry passes all three | After dev-harness lands the implementation, `./bin/sdd verify` against this very project's source passes all three new structural checks (zero in-scope failures on `methodology.validator.{interface_file_purity, no_test_scaffolding_types, no_production_satisfaction_assertions}`) | Just run the binary | All three new validators against real source |

## Implementation Plan

| Component | Lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------|---------------------------|-------|
| `spec/checks_interface.go` (extend interface with 3 method signatures) | ~3 | 5k | Invariant-compiler authors. |
| `spec/checks_validator_test.go` (append 3 new test functions) | ~150-200 | 50k | Invariant-compiler authors. Table-driven, t.TempDir corpus per test. |
| `spec/registry.yaml` (append 3 new entries) | ~25 | 10k | Invariant-compiler authors. |
| `spec/checks.go` (3 method bodies on `validator`) | ~200-280 | 80k | Dev-harness authors. AST walking via `go/ast` + `go/parser`. The method-set matcher for `CheckNoTestScaffoldingTypes` is the most complex piece (~80-100 LOC). |
| `spec/checks_registry.go` (append 3 `NamedCheck` entries) | ~3 | 5k | Dev-harness authors. |

**Total estimated tokens**: ~150k
**Estimated wall-clock**: ~1 day of dev-harness work. Pure AST walking; no new architectural concepts.
