package spec

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// CheckError represents a single contract violation detected by a validator.
type CheckError struct {
	EntryID string // offending registry/glossary/ADR id, if applicable
	Field   string // e.g., "id", "definition", "verifier"
	Path    string // optional file:line for code-grounded errors
	Message string // human-readable prose
}

func (e CheckError) String() string {
	if e.EntryID != "" {
		return fmt.Sprintf("[%s] %s: %s", e.EntryID, e.Field, e.Message)
	}
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Config is the parsed shape of spec-driven-config.json. Mirrors sddConfig
// in cmd/sdd/verify.go; the spec package exposes it so validators can accept
// a *Config without importing cmd/sdd.
type Config struct {
	Spec struct {
		Registry     string `json:"registry"`
		Glossary     string `json:"glossary"`
		ADRDir       string `json:"adr_dir"`
		ReactionsDir string `json:"reactions_dir"`
	} `json:"spec"`
	Verify   []string          `json:"verify"`
	Dispatch map[string]string `json:"dispatch"`
}

// validator is the concrete implementation of Validator. Unexported; consumers
// receive it via newValidator() typed as Validator.
type validator struct{}

// newValidator returns a Validator instance.
func newValidator() Validator { return &validator{} }

// IMPORTANT: do NOT add `var _ Validator = (*validator)(nil)` here.
// That assertion lives in spec/checks_validator_test.go::TestValidatorInterfaceSatisfaction
// per the methodology's "enforcement lives on the test side" rule.

// ---- Registry schema checks ----

// idRE is the required pattern for invariant IDs.
var idRE = regexp.MustCompile(`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`)

// CheckRegistryIDField returns a CheckError for every registry entry whose id
// field does not match ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$.
// Note: the test expects ALL entries (including withdrawn) to be flagged for bad IDs.
func (v *validator) CheckRegistryIDField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if !idRE.MatchString(inv.ID) {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "id",
				Message: fmt.Sprintf("id %q does not match required dotted-path regex", inv.ID),
			})
		}
	}
	return errs
}

// CheckRegistryDefinitionField returns a CheckError for every registry entry
// whose definition is empty or contains newlines.
// Note: the test expects ALL entries (including withdrawn) to be flagged.
func (v *validator) CheckRegistryDefinitionField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if inv.Definition == "" {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "definition",
				Message: "definition is empty",
			})
		} else if strings.Contains(inv.Definition, "\n") {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "definition",
				Message: "definition contains newlines (must be single-line)",
			})
		}
	}
	return errs
}

// CheckRegistryVerifierField returns a CheckError for every active registry
// entry whose verifier field is empty, has an empty path segment, or has an
// empty ::FuncName suffix.
// Only active entries are checked (withdrawn entries' verifier paths may be stale).
func (v *validator) CheckRegistryVerifierField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		if inv.Verifier == "" {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "verifier",
				Message: "verifier is empty",
			})
			continue
		}
		parts := strings.SplitN(inv.Verifier, "::", 2)
		if parts[0] == "" {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "verifier",
				Message: "verifier path segment is empty",
			})
		}
		if len(parts) == 2 && parts[1] == "" {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "verifier",
				Message: "verifier ::FuncName suffix is empty",
			})
		}
	}
	return errs
}

// CheckRegistryStatusField returns a CheckError for every registry entry
// whose status is not "active" or "withdrawn".
func (v *validator) CheckRegistryStatusField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if !ValidStatus(inv.Status) {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "status",
				Message: fmt.Sprintf("status %q is not one of {active, withdrawn}", inv.Status),
			})
		}
	}
	return errs
}

// CheckRegistryGlossaryTermsField returns a CheckError for every active registry
// entry whose glossary_terms field contains an empty or whitespace-only element.
func (v *validator) CheckRegistryGlossaryTermsField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		for j, term := range inv.GlossaryTerms {
			if strings.TrimSpace(term) == "" {
				errs = append(errs, CheckError{
					EntryID: inv.ID,
					Field:   "glossary_terms",
					Message: fmt.Sprintf("glossary_terms[%d] is empty or whitespace-only", j),
				})
			}
		}
	}
	return errs
}

// andRE matches the word "and" (case-insensitive, whole word).
var andRE = regexp.MustCompile(`(?i)\band\b`)

// CheckRegistryNoAndInDefinition returns a CheckError for every active registry
// entry whose definition matches \band\b (case-insensitive).
func (v *validator) CheckRegistryNoAndInDefinition(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		if andRE.MatchString(inv.Definition) {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "definition",
				Message: fmt.Sprintf("definition contains 'and': %q", inv.Definition),
			})
		}
	}
	return errs
}

// ---- Glossary schema checks ----

// CheckGlossaryTermField returns a CheckError for every glossary entry whose
// term is empty or whitespace-only.
func (v *validator) CheckGlossaryTermField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for i, g := range glos {
		if strings.TrimSpace(g.Term) == "" {
			errs = append(errs, CheckError{
				EntryID: fmt.Sprintf("glossary[%d]", i),
				Field:   "term",
				Message: "term is empty or whitespace-only",
			})
		}
	}
	return errs
}

// CheckGlossaryDefinitionField returns a CheckError for every glossary entry
// whose definition is empty or whitespace-only.
func (v *validator) CheckGlossaryDefinitionField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, g := range glos {
		if strings.TrimSpace(g.Definition) == "" {
			errs = append(errs, CheckError{
				EntryID: g.Term,
				Field:   "definition",
				Message: "definition is empty or whitespace-only",
			})
		}
	}
	return errs
}

// qualifiedGoNameRE matches "package.Type" or "package.Type.Field" style.
var qualifiedGoNameRE = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$`)

// CheckGlossaryResolvesToField returns a CheckError for every glossary entry
// whose resolves_to field is empty or does not resolve to a valid binding.
// Valid forms: qualified Go name (pkg.Type), string descriptor ("string ..."),
// another glossary term, or an invariant ID in the registry.
func (v *validator) CheckGlossaryResolvesToField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	// Build lookup sets.
	termSet := make(map[string]bool, len(glos))
	for _, g := range glos {
		termSet[g.Term] = true
	}
	idSet := make(map[string]bool, len(reg))
	for _, inv := range reg {
		idSet[inv.ID] = true
	}

	for _, g := range glos {
		rt := strings.TrimSpace(g.ResolvesTo)
		if rt == "" {
			errs = append(errs, CheckError{
				EntryID: g.Term,
				Field:   "resolves_to",
				Message: "resolves_to is empty",
			})
			continue
		}
		// Accept: qualified Go name
		if qualifiedGoNameRE.MatchString(rt) {
			continue
		}
		// Accept: string descriptor form (starts with "string ")
		if strings.HasPrefix(rt, "string ") {
			continue
		}
		// Accept: another glossary term
		if termSet[rt] {
			continue
		}
		// Accept: invariant ID
		if idSet[rt] {
			continue
		}
		errs = append(errs, CheckError{
			EntryID: g.Term,
			Field:   "resolves_to",
			Message: fmt.Sprintf("resolves_to %q does not resolve to a qualified Go name, string descriptor, glossary term, or invariant ID", rt),
		})
	}
	return errs
}

// CheckGlossaryScopeField returns a CheckError for every glossary entry whose
// scope is not one of the valid GlossaryScope values.
func (v *validator) CheckGlossaryScopeField(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	for _, g := range glos {
		if !ValidScope(g.Scope) {
			errs = append(errs, CheckError{
				EntryID: g.Term,
				Field:   "scope",
				Message: fmt.Sprintf("scope %q is not one of {methodology, project-cross-cutting, component-local}", g.Scope),
			})
		}
	}
	return errs
}

// ---- ADR delta schema checks ----

// globADRs returns all adr-*.md files in the given directory (root only).
func globADRs(adrDir string) ([]string, error) {
	if adrDir == "" {
		return nil, nil
	}
	return filepath.Glob(filepath.Join(adrDir, "adr-*.md"))
}

// extractDeltaSubsections scans an ADR file line-by-line and extracts the
// raw text of the ### Added and ### Withdrawn sub-blocks within the first
// ## Invariant Delta section found. Code-fence content IS included (because
// some ADRs wrap entries in ```yaml blocks). Template ### headings inside
// code-fence blocks are excluded because the scanner tracks whether it's
// inside the real ## Invariant Delta heading context.
func extractDeltaSubsections(adrPath string) (added string, withdrawn string, err error) {
	content, err := os.ReadFile(adrPath)
	if err != nil {
		return "", "", err
	}
	lines := strings.Split(string(content), "\n")

	inDelta := false
	inFence := false
	currentSubblock := "" // "Added" or "Withdrawn"
	var addedLines, withdrawnLines []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Track code fences ONLY when not in delta section yet (to skip template blocks).
		// Once we're inside the real ## Invariant Delta, include all content including fences.
		if !inDelta {
			if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
				inFence = !inFence
				continue
			}
			if inFence {
				continue // skip code-fence content before the real delta section
			}
		}

		// Detect heading transitions (only when not inside a code fence before delta).
		if strings.HasPrefix(line, "## ") {
			if inDelta {
				// Leaving the delta section.
				break
			}
			heading := strings.TrimSpace(strings.TrimPrefix(line, "## "))
			if heading == "Invariant Delta" {
				inDelta = true
				currentSubblock = ""
			}
			continue
		}

		if inDelta && strings.HasPrefix(line, "### ") {
			currentSubblock = strings.TrimSpace(strings.TrimPrefix(line, "### "))
			continue
		}

		if inDelta {
			switch currentSubblock {
			case "Added":
				addedLines = append(addedLines, line)
			case "Withdrawn":
				withdrawnLines = append(withdrawnLines, line)
			}
		}
	}

	return strings.TrimSpace(strings.Join(addedLines, "\n")),
		strings.TrimSpace(strings.Join(withdrawnLines, "\n")),
		nil
}

// extractAddedSection returns the raw text of the ### Added subsection from
// the ADR's ## Invariant Delta block.
func extractAddedSection(adrPath string) (string, error) {
	added, _, err := extractDeltaSubsections(adrPath)
	return added, err
}

// extractWithdrawnSectionText returns the raw text of the ### Withdrawn subsection.
func extractWithdrawnSectionText(adrPath string) (string, error) {
	_, withdrawn, err := extractDeltaSubsections(adrPath)
	return withdrawn, err
}

// parseAddedYAMLEntries parses YAML-format Added entries (the new format).
// Each entry is a YAML block starting with `- ` at column 0 (no leading
// whitespace) containing id, definition, verifier fields. Indented `- ` lines
// (e.g. list items inside a `requires:` field) are NOT treated as entry starts.
// Returns a slice of maps with the raw field values.
func parseAddedYAMLEntries(section string) []map[string]string {
	var entries []map[string]string
	if section == "" {
		return entries
	}

	lines := strings.Split(section, "\n")
	var cur []string
	for _, line := range lines {
		// New entry: must start with "- " at column 0 (unindented).
		if strings.HasPrefix(line, "- ") {
			if cur != nil {
				entries = append(entries, parseYAMLEntry(cur))
			}
			cur = []string{line}
		} else if cur != nil {
			cur = append(cur, line)
		}
	}
	if cur != nil {
		entries = append(entries, parseYAMLEntry(cur))
	}
	return entries
}

// parseYAMLEntry parses a single YAML entry from its lines.
func parseYAMLEntry(lines []string) map[string]string {
	m := make(map[string]string)
	for _, line := range lines {
		// Strip leading "- " from first line or leading whitespace from rest
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- ") {
			trimmed = strings.TrimPrefix(trimmed, "- ")
		}
		// Parse key: value
		if idx := strings.Index(trimmed, ": "); idx > 0 {
			key := strings.TrimSpace(trimmed[:idx])
			val := strings.TrimSpace(trimmed[idx+2:])
			m[key] = val
		} else if trimmed == "-" || trimmed == "" {
			continue
		}
	}
	return m
}

// CheckADRDeltaAddedBlock returns a CheckError for every ADR whose ### Added
// block has entries missing required fields (id, definition, verifier, status).
func (v *validator) CheckADRDeltaAddedBlock(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	paths, err := globADRs(adrDir)
	if err != nil || len(paths) == 0 {
		return errs
	}
	for _, p := range paths {
		section, err := extractAddedSection(p)
		if err != nil || section == "" {
			continue
		}
		entries := parseAddedYAMLEntries(section)
		for _, entry := range entries {
			var missing []string
			if entry["id"] == "" {
				missing = append(missing, "id")
			}
			if entry["definition"] == "" {
				missing = append(missing, "definition")
			}
			if entry["verifier"] == "" {
				missing = append(missing, "verifier")
			}
			if len(missing) > 0 {
				errs = append(errs, CheckError{
					EntryID: filepath.Base(p),
					Field:   "Added",
					Message: fmt.Sprintf("entry %q missing required fields: %s", entry["id"], strings.Join(missing, ", ")),
				})
			}
		}
	}
	return errs
}

// CheckADRDeltaWithdrawnBlock returns a CheckError for every ADR whose
// ### Withdrawn block has entries missing id or reason.
func (v *validator) CheckADRDeltaWithdrawnBlock(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	paths, err := globADRs(adrDir)
	if err != nil || len(paths) == 0 {
		return errs
	}
	for _, p := range paths {
		block, err := ParseADRDeltaBlock(p)
		if err != nil || block == nil {
			continue
		}
		for _, entry := range block.Withdrawn {
			if entry.ID == "" || entry.Reason == "" {
				errs = append(errs, CheckError{
					EntryID: filepath.Base(p),
					Field:   "Withdrawn",
					Message: fmt.Sprintf("entry %q missing id or reason", entry.ID),
				})
			}
		}
	}
	return errs
}

// ---- Cross-cutting checks ----

// CheckVerifierResolves returns a CheckError for every ACTIVE registry entry
// whose verifier path does not resolve to an existing file.
// Withdrawn entries are skipped to avoid false positives from predecessor paths.
//
// Path resolution (Fix A): verifier paths in registry.yaml are relative to
// the module root — the directory that contains the Go module (e.g. src/sdd/).
// adrDir is already an absolute path resolved from cfgDir (the directory of
// spec-driven-config.json). The module root is filepath.Dir(adrDir) because
// the canonical config places adr_dir one level below the module root
// (e.g. src/sdd/docs/ → module root src/sdd/). Absolute verifier paths are
// used as-is. This makes verifier paths portable regardless of where
// ./bin/sdd is invoked from.
func (v *validator) CheckVerifierResolves(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	// Compute the module root from adrDir (absolute, resolved by caller).
	// Verifier paths like "spec/checks_registry_test.go" are relative to this root.
	moduleRoot := ""
	if adrDir != "" {
		moduleRoot = filepath.Dir(adrDir)
	}

	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		if inv.Verifier == "" {
			continue
		}
		// Extract file path (before ::)
		filePath := strings.SplitN(inv.Verifier, "::", 2)[0]
		if filePath == "" {
			continue
		}
		// Resolve relative paths against the module root.
		if !filepath.IsAbs(filePath) && moduleRoot != "" {
			filePath = filepath.Join(moduleRoot, filePath)
		}
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "verifier",
				Message: fmt.Sprintf("verifier file %q does not exist", strings.SplitN(inv.Verifier, "::", 2)[0]),
			})
		}
	}
	return errs
}

// CheckVerifierUnique returns a CheckError for every pair of active registry
// entries that share the same verifier path.
func (v *validator) CheckVerifierUnique(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError
	seen := make(map[string]string) // verifier path -> first entry ID
	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		if inv.Verifier == "" {
			continue
		}
		if first, ok := seen[inv.Verifier]; ok {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "verifier",
				Message: fmt.Sprintf("verifier %q also used by %q", inv.Verifier, first),
			})
		} else {
			seen[inv.Verifier] = inv.ID
		}
	}
	return errs
}

// extractIDsFromAddedSection parses the YAML-format ### Added section and returns
// all entry IDs and their supersedes targets.
func extractIDsFromAddedSection(adrPath string) (added []string, supersedes []string, err error) {
	section, err := extractAddedSection(adrPath)
	if err != nil || section == "" {
		return nil, nil, err
	}
	entries := parseAddedYAMLEntries(section)
	for _, e := range entries {
		if id := e["id"]; id != "" {
			added = append(added, id)
		}
		if sup := e["supersedes"]; sup != "" {
			supersedes = append(supersedes, sup)
		}
	}
	return added, supersedes, nil
}


// extractWithdrawnIDs parses the ### Withdrawn section and returns withdrawn IDs.
// Handles both "- id\n  Reason: ..." and plain "- id reason" formats.
func extractWithdrawnIDs(adrPath string) ([]string, error) {
	section, err := extractWithdrawnSectionText(adrPath)
	if err != nil || section == "" {
		return nil, err
	}
	var ids []string
	for _, line := range strings.Split(section, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "- ") {
			continue
		}
		rest := strings.TrimPrefix(trimmed, "- ")
		// rest might be "id" or "id  Reason: ..." or "id: foo"
		// Just extract the first token which should be the ID
		parts := strings.Fields(rest)
		if len(parts) > 0 {
			id := strings.TrimRight(parts[0], ":")
			if id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids, nil
}

// CheckDeltaReconciles returns a CheckError when the set of currently-active
// registry IDs differs from Σ(Added IDs) − Σ(Withdrawn IDs) across all ADR
// delta blocks in adrDir.
func (v *validator) CheckDeltaReconciles(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	paths, _ := globADRs(adrDir)

	// Compute expected active set from ADR deltas.
	deltaAdded := make(map[string]bool)
	deltaWithdrawn := make(map[string]bool)

	for _, p := range paths {
		added, supersedes, _ := extractIDsFromAddedSection(p)
		for _, id := range added {
			deltaAdded[id] = true
		}
		for _, id := range supersedes {
			deltaWithdrawn[id] = true
		}
		withdrawn, _ := extractWithdrawnIDs(p)
		for _, id := range withdrawn {
			deltaWithdrawn[id] = true
			delete(deltaAdded, id)
		}
	}

	// Compute expected active set: added minus withdrawn.
	expectedActive := make(map[string]bool)
	for id := range deltaAdded {
		if !deltaWithdrawn[id] {
			expectedActive[id] = true
		}
	}

	// Compute actual active set from registry.
	actualActive := make(map[string]bool)
	for _, inv := range reg {
		if inv.Status == StatusActive {
			actualActive[inv.ID] = true
		}
	}

	// Check for entries in actual but not expected.
	for id := range actualActive {
		if !expectedActive[id] {
			errs = append(errs, CheckError{
				EntryID: id,
				Field:   "status",
				Message: fmt.Sprintf("active entry %q not found in any ADR delta Added block", id),
			})
		}
	}

	// Check for entries expected but not in actual.
	for id := range expectedActive {
		if !actualActive[id] {
			errs = append(errs, CheckError{
				EntryID: id,
				Field:   "status",
				Message: fmt.Sprintf("ADR delta adds %q but registry does not have it as active", id),
			})
		}
	}

	if len(errs) > 0 {
		// Collapse into a single error for the reconciliation check.
		return errs[:1]
	}
	return errs
}

// CheckGlossaryComplete returns a CheckError for every term appearing in an
// active registry entry's glossary_terms field that does not resolve to a
// glossary entry.
func (v *validator) CheckGlossaryComplete(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	termSet := make(map[string]bool, len(glos))
	for _, g := range glos {
		termSet[g.Term] = true
	}

	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		for _, term := range inv.GlossaryTerms {
			if !termSet[term] {
				errs = append(errs, CheckError{
					EntryID: inv.ID,
					Field:   "glossary_terms",
					Message: fmt.Sprintf("term %q does not resolve to any glossary entry", term),
				})
			}
		}
	}
	return errs
}

// CheckRequiresTargetsExist returns a CheckError for every requires reference
// in a registry entry that does not resolve to another existing entry.
func (v *validator) CheckRequiresTargetsExist(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	idSet := make(map[string]bool, len(reg))
	for _, inv := range reg {
		idSet[inv.ID] = true
	}

	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		for _, req := range inv.Requires {
			if !idSet[req] {
				errs = append(errs, CheckError{
					EntryID: inv.ID,
					Field:   "requires",
					Message: fmt.Sprintf("requires %q which does not exist in registry", req),
				})
			}
		}
	}
	return errs
}

// CheckRequiresDAGAcyclic returns a CheckError when the directed graph formed
// by active registry entries' requires edges contains a cycle.
func (v *validator) CheckRequiresDAGAcyclic(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	const (
		white = 0
		gray  = 1
		black = 2
	)

	color := make(map[string]int, len(reg))
	requires := make(map[string][]string, len(reg))
	for _, inv := range reg {
		color[inv.ID] = white
		requires[inv.ID] = inv.Requires
	}

	var cycleFound bool
	var cycleDesc string
	var stack []string

	var visit func(id string)
	visit = func(id string) {
		if cycleFound {
			return
		}
		if color[id] == gray {
			// Found cycle
			cycleStart := 0
			for i, s := range stack {
				if s == id {
					cycleStart = i
					break
				}
			}
			cycleFound = true
			cycleDesc = strings.Join(stack[cycleStart:], " -> ") + " -> " + id
			return
		}
		if color[id] == black {
			return
		}
		color[id] = gray
		stack = append(stack, id)
		for _, dep := range requires[id] {
			visit(dep)
		}
		if len(stack) > 0 {
			stack = stack[:len(stack)-1]
		}
		color[id] = black
	}

	for _, inv := range reg {
		if color[inv.ID] == white {
			visit(inv.ID)
		}
	}

	if cycleFound {
		return []CheckError{{
			Field:   "requires",
			Message: fmt.Sprintf("requires DAG has cycle: %s", cycleDesc),
		}}
	}
	return nil
}

// CheckSupersedesTargetsExist returns a CheckError for every active registry
// entry whose supersedes field references a non-existent entry or an entry
// whose status is not withdrawn.
func (v *validator) CheckSupersedesTargetsExist(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	byID := make(map[string]Invariant, len(reg))
	for _, inv := range reg {
		byID[inv.ID] = inv
	}

	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		if inv.Supersedes == "" {
			continue
		}
		predecessor, ok := byID[inv.Supersedes]
		if !ok {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "supersedes",
				Message: fmt.Sprintf("supersedes %q which does not exist in registry", inv.Supersedes),
			})
			continue
		}
		if predecessor.Status != StatusWithdrawn {
			errs = append(errs, CheckError{
				EntryID: inv.ID,
				Field:   "supersedes",
				Message: fmt.Sprintf("supersedes %q whose status is %q (expected withdrawn)", inv.Supersedes, predecessor.Status),
			})
		}
	}
	return errs
}

// testFuncRE matches a Go test function declaration line.
var testFuncRE = regexp.MustCompile(`(?m)^func (Test[A-Za-z0-9_]+)\s*\(`)

// CheckTestsBoundToRegistry returns a CheckError for every Test* function
// in *_test.go files under adrDir that does not correspond to an active
// registry entry's verifier field. Uses regex-based scanning so it handles
// test files that may not be individually valid Go (e.g. concatenated content
// in synthetic test fixtures).
func (v *validator) CheckTestsBoundToRegistry(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	if adrDir == "" {
		return errs
	}

	// Build set of verifier function names from active entries.
	verifierFuncs := make(map[string]bool)
	for _, inv := range reg {
		if inv.Status != StatusActive {
			continue
		}
		parts := strings.SplitN(inv.Verifier, "::", 2)
		if len(parts) == 2 && parts[1] != "" {
			verifierFuncs[parts[1]] = true
		}
	}

	// Glob test files in adrDir (used as the spec dir in tests).
	testFiles, err := filepath.Glob(filepath.Join(adrDir, "*_test.go"))
	if err != nil || len(testFiles) == 0 {
		return errs
	}

	for _, tf := range testFiles {
		content, err := os.ReadFile(tf)
		if err != nil {
			continue
		}
		matches := testFuncRE.FindAllSubmatch(content, -1)
		for _, m := range matches {
			name := string(m[1])
			if !verifierFuncs[name] {
				errs = append(errs, CheckError{
					EntryID: name,
					Field:   "verifier",
					Message: fmt.Sprintf("test function %q is not bound to any active registry entry's verifier field", name),
				})
			}
		}
	}
	return errs
}

// ---- ADR structural checks ----

// CheckADRRequiresDelta returns a CheckError for every adr-*.md file that
// lacks a ## Invariant Delta section or whose section has no Added or Withdrawn
// entries.
func (v *validator) CheckADRRequiresDelta(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	paths, err := globADRs(adrDir)
	if err != nil || len(paths) == 0 {
		return errs
	}

	for _, p := range paths {
		block, err := ParseADRDeltaBlock(p)
		if err != nil {
			errs = append(errs, CheckError{
				EntryID: filepath.Base(p),
				Field:   "Invariant Delta",
				Message: fmt.Sprintf("parse error: %v", err),
			})
			continue
		}
		if block == nil || (len(block.Added) == 0 && len(block.Withdrawn) == 0) {
			errs = append(errs, CheckError{
				EntryID: filepath.Base(p),
				Field:   "Invariant Delta",
				Message: "missing ## Invariant Delta section or section has no Added/Withdrawn entries",
			})
		}
	}
	return errs
}

// CheckADRRequiresDecisionHistory returns a CheckError for every adr-*.md
// file that lacks a ## Decision history (rationale notes) section.
func (v *validator) CheckADRRequiresDecisionHistory(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	paths, err := globADRs(adrDir)
	if err != nil || len(paths) == 0 {
		return errs
	}

	for _, p := range paths {
		content, err := os.ReadFile(p)
		if err != nil {
			errs = append(errs, CheckError{
				EntryID: filepath.Base(p),
				Field:   "Decision history",
				Message: fmt.Sprintf("read error: %v", err),
			})
			continue
		}
		if !strings.Contains(string(content), "## Decision history (rationale notes)") {
			errs = append(errs, CheckError{
				EntryID: filepath.Base(p),
				Field:   "Decision history",
				Message: "missing ## Decision history (rationale notes) section",
			})
		}
	}
	return errs
}

// ---- Config schema checks ----

// CheckConfigSpecRegistry returns a CheckError when the loaded config's
// spec.registry field is empty or cfg is nil.
func (v *validator) CheckConfigSpecRegistry(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	if cfg == nil || cfg.Spec.Registry == "" {
		return []CheckError{{
			Field:   "spec.registry",
			Message: "spec.registry is empty or config is nil",
		}}
	}
	return nil
}

// CheckConfigSpecGlossary returns a CheckError when the loaded config's
// spec.glossary field is empty or cfg is nil.
func (v *validator) CheckConfigSpecGlossary(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	if cfg == nil || cfg.Spec.Glossary == "" {
		return []CheckError{{
			Field:   "spec.glossary",
			Message: "spec.glossary is empty or config is nil",
		}}
	}
	return nil
}

// CheckConfigSpecADRDir returns a CheckError when the loaded config's
// spec.adr_dir field is empty, nil, or does not point to an existing directory.
func (v *validator) CheckConfigSpecADRDir(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	if cfg == nil || cfg.Spec.ADRDir == "" {
		return []CheckError{{
			Field:   "spec.adr_dir",
			Message: "spec.adr_dir is empty or config is nil",
		}}
	}
	if info, err := os.Stat(cfg.Spec.ADRDir); err != nil || !info.IsDir() {
		return []CheckError{{
			Field:   "spec.adr_dir",
			Message: fmt.Sprintf("spec.adr_dir %q does not point to an existing directory", cfg.Spec.ADRDir),
		}}
	}
	return nil
}

// CheckConfigSpecReactionsDir returns a CheckError when the loaded config's
// spec.reactions_dir field is empty or cfg is nil.
func (v *validator) CheckConfigSpecReactionsDir(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	if cfg == nil || cfg.Spec.ReactionsDir == "" {
		return []CheckError{{
			Field:   "spec.reactions_dir",
			Message: "spec.reactions_dir is empty or config is nil",
		}}
	}
	return nil
}

// CheckConfigVerifyArray returns a CheckError when the loaded config's verify
// field is nil or contains empty/whitespace-only string elements.
func (v *validator) CheckConfigVerifyArray(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	if cfg == nil {
		return []CheckError{{
			Field:   "verify",
			Message: "config is nil",
		}}
	}
	var errs []CheckError
	for i, cmd := range cfg.Verify {
		if strings.TrimSpace(cmd) == "" {
			errs = append(errs, CheckError{
				Field:   "verify",
				Message: fmt.Sprintf("verify[%d] is empty or whitespace-only", i),
			})
		}
	}
	return errs
}

// ---- Meta-check: test shape ----

// CheckTestShapeUnitOnly returns a CheckError for every *_test.go file under
// adrDir that contains an AST reference to spec.Registry or spec.Glossary
// (the methodology's embedded package-level vars). Uses adrDir as the directory
// to scan (the test passes a temp dir containing synthetic test files).
func (v *validator) CheckTestShapeUnitOnly(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError {
	var errs []CheckError

	if adrDir == "" {
		return errs
	}

	testFiles, err := filepath.Glob(filepath.Join(adrDir, "*_test.go"))
	if err != nil || len(testFiles) == 0 {
		return errs
	}

	fset := token.NewFileSet()
	for _, tf := range testFiles {
		f, err := parser.ParseFile(fset, tf, nil, 0)
		if err != nil {
			continue
		}

		var fileHasViolation bool
		ast.Inspect(f, func(n ast.Node) bool {
			if fileHasViolation {
				return false
			}
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			ident, ok := sel.X.(*ast.Ident)
			if !ok {
				return true
			}
			if ident.Name == "spec" && (sel.Sel.Name == "Registry" || sel.Sel.Name == "Glossary") {
				fileHasViolation = true
			}
			return true
		})

		if fileHasViolation {
			errs = append(errs, CheckError{
				Path:    tf,
				Field:   "test_shape",
				Message: fmt.Sprintf("test file %q contains direct reference to spec.Registry or spec.Glossary (violates unit-only shape)", filepath.Base(tf)),
			})
		}
	}
	return errs
}

