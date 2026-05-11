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
}
