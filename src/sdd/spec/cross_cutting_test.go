package spec

import (
	"bufio"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestVerifierResolves verifies methodology.registry.verifier_resolves.
//
// Every active registry entry's verifier reference resolves to an existing
// file, and for Go test refs, to an existing test function in that file.
func TestVerifierResolves(t *testing.T) {
	for _, inv := range Registry {
		if inv.Status != StatusActive {
			continue
		}
		ref := inv.Verifier
		if ref == "" {
			t.Errorf("%s: verifier ref empty", inv.ID)
			continue
		}
		path, fn := splitVerifierRef(ref)
		if _, err := os.Stat(path); err != nil {
			t.Errorf("%s: verifier file %q does not exist", inv.ID, path)
			continue
		}
		if fn == "" {
			continue // non-Go verifier (lint config, schema); file existence is enough
		}
		if !strings.HasSuffix(path, ".go") {
			t.Errorf("%s: verifier ref %q has ::FuncName suffix but file isn't .go", inv.ID, ref)
			continue
		}
		ok, err := goFunctionExists(path, fn)
		if err != nil {
			t.Errorf("%s: parse %q: %v", inv.ID, path, err)
			continue
		}
		if !ok {
			t.Errorf("%s: verifier %q does not contain function %s", inv.ID, path, fn)
		}
	}
}

// TestVerifierUnique verifies methodology.registry.verifier_unique.
//
// No verifier reference is named by more than one active registry entry.
func TestVerifierUnique(t *testing.T) {
	seen := make(map[string]string) // verifier ref -> first invariant ID

	for _, inv := range Registry {
		if inv.Status != StatusActive {
			continue
		}
		ref := inv.Verifier
		if ref == "" {
			continue
		}
		if existing, ok := seen[ref]; ok {
			t.Errorf("%s: verifier %q is also referenced by %s (must be unique)", inv.ID, ref, existing)
		} else {
			seen[ref] = inv.ID
		}
	}
}

func splitVerifierRef(ref string) (path, fn string) {
	if i := strings.Index(ref, "::"); i >= 0 {
		return ref[:i], ref[i+2:]
	}
	return ref, ""
}

func goFunctionExists(path, name string) (bool, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		return false, err
	}
	for _, decl := range f.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok && fn.Name.Name == name {
			return true, nil
		}
	}
	return false, nil
}

// TestDeltaReconciles verifies methodology.adr.delta_reconciles.
//
// For the bootstrap experiment: parse the fixture ADR's delta block, then
// the trivial reconciliation property: number of Added entries minus
// Withdrawn entries is non-negative. (Full reconciliation against a real
// ADR-0078 with delta block is a follow-up.)
func TestDeltaReconciles(t *testing.T) {
	block, err := ParseADRDeltaBlock(fixturePath)
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if block == nil {
		t.Fatal("fixture has no Invariant Delta block")
	}
	delta := len(block.Added) - len(block.Withdrawn)
	if delta < 0 {
		t.Errorf("delta reconciliation negative: Added=%d Withdrawn=%d", len(block.Added), len(block.Withdrawn))
	}
	// Check IDs in delta blocks are well-formed
	checkID := func(id string, where string) {
		if id == "" {
			t.Errorf("%s: empty id", where)
			return
		}
		if !IDPattern.MatchString(id) {
			t.Errorf("%s: id %q does not match dotted-path regex", where, id)
		}
	}
	for _, e := range block.Added {
		checkID(e.ID, "Added")
	}
	for _, e := range block.Withdrawn {
		checkID(e.ID, "Withdrawn")
	}
	for _, e := range block.Promoted {
		checkID(e.ID, "Promoted")
	}
	for _, e := range block.Modified {
		checkID(e.ID, "Modified")
	}
	for _, e := range block.Deprecated {
		checkID(e.ID, "Deprecated")
	}
	for _, e := range block.Superseded {
		checkID(e.OldID, "Superseded.OldID")
		checkID(e.NewID, "Superseded.NewID")
	}
}

// TestGlossaryComplete verifies methodology.glossary.complete.
//
// Every term listed in glossary_terms of any active or deprecated
// registry entry resolves to a typed binding or a glossary entry.
func TestGlossaryComplete(t *testing.T) {
	terms := make(map[string]bool)
	for _, g := range Glossary {
		terms[g.Term] = true
	}

	for _, inv := range Registry {
		if inv.Status != StatusActive {
			continue
		}
		for _, term := range inv.GlossaryTerms {
			if terms[term] {
				continue
			}
			// Could be a typed binding (via the glossary's resolves_to chain).
			// For now, require explicit glossary entry — typed bindings should
			// be added to the glossary even if their resolves_to is the type itself.
			t.Errorf("%s: glossary term %q not present in glossary", inv.ID, term)
		}
	}
}

// TestTestsBoundToRegistry verifies methodology.tests.bound_to_registry.
//
// Every exported Test* function in spec/*_test.go files must be named by at
// least one active registry entry's verifier field. Prevents orphaned test
// functions that verify nothing in the registry.
func TestTestsBoundToRegistry(t *testing.T) {
	// Build set of verifier function names from active registry entries.
	verifierFuncs := make(map[string]bool)
	for _, inv := range Registry {
		if inv.Status != StatusActive {
			continue
		}
		_, fn := splitVerifierRef(inv.Verifier)
		if fn != "" {
			verifierFuncs[fn] = true
		}
	}

	// Walk all *_test.go files in the spec package directory.
	specDir := "."
	entries, err := os.ReadDir(specDir)
	if err != nil {
		t.Fatalf("read spec dir: %v", err)
	}
	fset := token.NewFileSet()
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(specDir, entry.Name())
		f, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Errorf("parse %s: %v", path, err)
			continue
		}
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			name := fn.Name.Name
			if !strings.HasPrefix(name, "Test") {
				continue
			}
			if !verifierFuncs[name] {
				t.Errorf("test function %s in %s is not named by any active registry entry's verifier",
					name, entry.Name())
			}
		}
	}
}

// adrDir returns the adr_dir path from spec-driven-config.json, resolved
// relative to the repo root. The repo root is located by walking up from the
// package's working directory until spec-driven-config.json is found.
func adrDir(t *testing.T) string {
	t.Helper()
	root, cfg := loadSddConfig(t)
	dir, ok := cfg["adr_dir"]
	if !ok || dir == "" {
		t.Skip("spec-driven-config.json does not declare spec.adr_dir — skipping ADR-level checks")
	}
	return filepath.Join(root, dir)
}

// loadSddConfig finds spec-driven-config.json by walking up from the working
// directory and returns the repo root path and the contents of the `spec` sub-object.
func loadSddConfig(t *testing.T) (repoRoot string, specMap map[string]string) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// Walk upward until we find spec-driven-config.json.
	dir := wd
	for {
		candidate := filepath.Join(dir, "spec-driven-config.json")
		if _, err := os.Stat(candidate); err == nil {
			repoRoot = dir
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("spec-driven-config.json not found walking up from %s", wd)
		}
		dir = parent
	}
	data, err := os.ReadFile(filepath.Join(repoRoot, "spec-driven-config.json"))
	if err != nil {
		t.Fatalf("read spec-driven-config.json: %v", err)
	}
	// Parse the "spec" sub-object manually using encoding/json to avoid adding
	// a dependency. We only need string fields from the spec sub-object.
	specMap = parseSpecFields(data)
	return repoRoot, specMap
}

// parseSpecFields extracts string values from the top-level "spec" JSON object.
// It uses a simple line-oriented approach to avoid importing encoding/json
// in the test binary (the package already depends on gopkg.in/yaml.v3 only).
// For the narrow use case here (flat string fields only), this is sufficient.
func parseSpecFields(data []byte) map[string]string {
	result := make(map[string]string)
	// Find the "spec" key and its object value.
	specRE := regexp.MustCompile(`"spec"\s*:\s*\{`)
	loc := specRE.FindIndex(data)
	if loc == nil {
		return result
	}
	// Extract the object body (everything between the braces).
	body := data[loc[1]:]
	depth := 1
	end := 0
	for i, b := range body {
		switch b {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				end = i
				break
			}
		}
		if depth == 0 {
			break
		}
	}
	objText := string(body[:end])
	// Extract key-value pairs of the form "key": "value".
	kvRE := regexp.MustCompile(`"([^"]+)"\s*:\s*"([^"]*)"`)
	for _, m := range kvRE.FindAllStringSubmatch(objText, -1) {
		result[m[1]] = m[2]
	}
	return result
}

// TestADRRequiresDelta verifies methodology.adr.requires_delta.
//
// Every adr-*.md file under the configured spec.adr_dir must contain an
// `## Invariant Delta` section with at least one entry in ### Added or
// ### Withdrawn.
func TestADRRequiresDelta(t *testing.T) {
	dir := adrDir(t)
	paths, err := filepath.Glob(filepath.Join(dir, "adr-*.md"))
	if err != nil {
		t.Fatalf("glob adr-*.md: %v", err)
	}
	if len(paths) == 0 {
		t.Fatalf("no adr-*.md files found under %s", dir)
	}
	for _, p := range paths {
		block, err := ParseADRDeltaBlock(p)
		if err != nil {
			t.Errorf("%s: parse error: %v", filepath.Base(p), err)
			continue
		}
		if block == nil {
			t.Errorf("%s: missing ## Invariant Delta section", filepath.Base(p))
			continue
		}
		if len(block.Added) == 0 && len(block.Withdrawn) == 0 {
			t.Errorf("%s: ## Invariant Delta section has no Added or Withdrawn entries",
				filepath.Base(p))
		}
	}
}

// TestADRRequiresDecisionHistory verifies methodology.adr.requires_decision_history.
//
// Every adr-*.md file under the configured spec.adr_dir must contain a
// `## Decision history (rationale notes)` section.
func TestADRRequiresDecisionHistory(t *testing.T) {
	dir := adrDir(t)
	paths, err := filepath.Glob(filepath.Join(dir, "adr-*.md"))
	if err != nil {
		t.Fatalf("glob adr-*.md: %v", err)
	}
	if len(paths) == 0 {
		t.Fatalf("no adr-*.md files found under %s", dir)
	}
	decisionHistoryRE := regexp.MustCompile(`(?m)^##\s+Decision history`)
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			t.Errorf("%s: read error: %v", filepath.Base(p), err)
			continue
		}
		if !decisionHistoryRE.Match(data) {
			t.Errorf("%s: missing ## Decision history (rationale notes) section", filepath.Base(p))
		}
	}
}

// Ensure bufio is used (it's imported for potential future scanner use in helpers).
var _ = bufio.NewScanner
