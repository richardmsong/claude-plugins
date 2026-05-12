package spec

// Validator is the contract surface for methodology structural checks.
// Implementations live in spec/checks.go (authored by dev-harness, not by
// /compile-invariants). The compile-time assertion in checks.go ensures
// the concrete implementation satisfies this interface.
//
// All methods take the same input bundle. Methods that don't need all
// inputs ignore the irrelevant ones.
type Validator interface {
	// Registry schema checks
	CheckRegistryIDField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRegistryDefinitionField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRegistryVerifierField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRegistryStatusField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRegistryGlossaryTermsField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRegistryNoAndInDefinition(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Glossary schema checks
	CheckGlossaryTermField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckGlossaryDefinitionField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckGlossaryResolvesToField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckGlossaryScopeField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// ADR delta schema checks
	CheckADRDeltaAddedBlock(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckADRDeltaWithdrawnBlock(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckADRGlossaryDeltaBlock walks each ADR's ## Invariant Delta section and
	// validates that any explicit sub-section blocks (### Added (invariants), etc.)
	// contain well-formed YAML (a list starting with "- ") or are empty / "(none)".
	// ADRs using legacy bare ### Added / ### Withdrawn headers are accepted without
	// inspection (they contribute empty glossary deltas by definition).
	CheckADRGlossaryDeltaBlock(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Cross-cutting checks
	CheckVerifierResolves(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckVerifierUnique(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckDeltaReconciles(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckGlossaryComplete(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRequiresTargetsExist(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckRequiresDAGAcyclic(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckSupersedesTargetsExist(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckTestsBoundToRegistry(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// ADR structural checks
	CheckADRRequiresDelta(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckADRRequiresDecisionHistory(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Config schema checks
	CheckConfigSpecRegistry(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckConfigSpecGlossary(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckConfigSpecADRDir(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckConfigSpecReactionsDir(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	CheckConfigVerifyArray(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Meta-check (net-new): AST-walking validator that enforces test shape.
	// Returns a CheckError for every *_test.go file that directly references
	// spec.Registry or spec.Glossary (the methodology's embedded data).
	CheckTestShapeUnitOnly(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Meta-checks (static role-boundary; net-new in ADR-0082):

	// CheckInterfaceFilePurity returns a CheckError for every *_interface.go file
	// that contains a struct type declaration (only interface declarations and type
	// aliases are permitted in interface files per ADR-0082).
	CheckInterfaceFilePurity(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckNoTestScaffoldingTypes returns a CheckError for every struct declared
	// in a *_test.go file whose method set is a superset of any interface declared
	// in a *_interface.go file — catching noopValidator/stubValidator patterns
	// regardless of name, per ADR-0082.
	CheckNoTestScaffoldingTypes(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckNoProductionSatisfactionAssertions returns a CheckError for every
	// package-level `var _ <Interface> = <expr>` declaration in a non-_test.go file
	// where the identifier resolves to an interface type — assertions must live only
	// in _test.go files, per ADR-0082.
	CheckNoProductionSatisfactionAssertions(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Cross-cutting checks added by ADR-0080

	// CheckRegistryIDPrefixAllowed returns a CheckError for every active entry
	// in this repo's registry whose id field does not begin with "methodology."
	// or "project.". Withdrawn entries are not checked.
	CheckRegistryIDPrefixAllowed(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckMethodologySelfContained returns a CheckError for every active entry
	// whose id begins with "methodology." and whose requires list contains an id
	// that does NOT begin with "methodology.". The check is framed as a
	// self-referential property of the methodology prefix: methodology entries
	// depend only on other methodology entries; dependencies on other prefixes
	// (project.*, external.*) are forbidden.
	CheckMethodologySelfContained(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckGlossaryDeltaReconciles returns a CheckError when the running glossary
	// at spec.glossary does not equal the integral of Added (glossary) minus
	// Withdrawn (glossary) across all ADR delta blocks. ADRs with legacy bare
	// ### Added / ### Withdrawn headers contribute zero glossary deltas.
	CheckGlossaryDeltaReconciles(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// Eval dispatch checks (ADR-0080, project-scoped)

	// CheckProjectVerifyIncludesInspect returns a CheckError when this repo's
	// verify[] array does not contain an entry that invokes `inspect eval-set`
	// followed by `python scripts/inspect-gate.py`, or when the --log-dir path
	// passed to `inspect eval-set` and the path argument to `inspect-gate.py`
	// differ (diverging log-dir paths are rejected because the gate reads the
	// logs that Inspect wrote).
	CheckProjectVerifyIncludesInspect(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckEvalTaskNamingMatchesInvariantID returns a CheckError for every Python
	// module under <project>/spec/evals/ matching *_eval.py whose @task-decorated
	// function name does not match the full post-prefix suffix of an active
	// registry invariant_id (with `.` replaced by `_`), or whose file basename
	// does not follow the convention <task_function>_eval.py.
	// "Full post-prefix suffix" means all segments after the first dot-separated
	// component: e.g. methodology.compile_invariants.file_scope →
	// compile_invariants_file_scope (not the bare leaf `file_scope`).
	CheckEvalTaskNamingMatchesInvariantID(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError

	// CheckVerifyArrayIncludesUITests returns a CheckError when the config's verify[]
	// array does not contain an entry that runs the UI Bun test suite
	// (`cd src/sdd/docs-dashboard/ui && bun test src/__tests__/`), per ADR-0085.
	CheckVerifyArrayIncludesUITests(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
}
