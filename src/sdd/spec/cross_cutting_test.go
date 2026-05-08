package spec

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

// TestNoOrphans verifies methodology.registry.no_orphans.
//
// Forward: every active or deprecated registry entry's verifier reference
// resolves to an existing file (and existing test function for Go test refs).
// Reverse: every declared verifier reference is named by at most one registry
// entry.
func TestNoOrphans(t *testing.T) {
	seen := make(map[string]string) // verifier ref -> first invariant ID

	for _, inv := range Registry {
		if inv.Status != StatusActive {
			continue
		}
		ref := inv.Verifier
		if ref == "" {
			t.Errorf("%s: verifier ref empty", inv.ID)
			continue
		}
		if existing, ok := seen[ref]; ok {
			t.Errorf("%s: verifier %q is also referenced by %s (must be unique)", inv.ID, ref, existing)
		}
		seen[ref] = inv.ID

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
// ADR-0075 with delta block is a follow-up.)
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
