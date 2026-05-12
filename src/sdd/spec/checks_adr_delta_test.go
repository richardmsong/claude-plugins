package spec

import (
	"os"
	"path/filepath"
	"testing"
)

// TestGlossaryDeltaBlock bounds methodology.adr.glossary_delta_block.
//
// An ADR's ## Invariant Delta section may use either:
//   - Legacy bare headers: ### Added / ### Withdrawn (treated as invariants-only
//     with empty glossary deltas; used by ADRs prior to ADR-0080).
//   - Explicit sub-section headers: ### Added (invariants), ### Added (glossary),
//     ### Withdrawn (invariants), ### Withdrawn (glossary).
//
// When explicit headers are present, each block must be either empty / "(none)"
// or contain well-formed YAML (a list starting with "- ").  A block with a
// non-list YAML body is a CheckError.
//
// The test walks synthetic ADR files in a temp directory using the validator's
// CheckADRGlossaryDeltaBlock method.
func TestGlossaryDeltaBlock(t *testing.T) {
	// wellFormedExplicit uses all four explicit headers with valid YAML content.
	wellFormedExplicit := `# ADR

## Invariant Delta

### Added (invariants)

` + "```yaml" + `
- id: example.foo.bar
  definition: An example invariant.
  verifier: spec/checks_foo_test.go::TestFooBar
  status: active
` + "```" + `

### Added (glossary)

` + "```yaml" + `
- term: methodology (prefix)
  definition: SDD tooling behavior contracts.
- term: project (prefix)
  definition: Repo-local development contracts.
` + "```" + `

### Withdrawn (invariants)

(none)

### Withdrawn (glossary)

(none)

## Decision history (rationale notes)

Well-formed explicit headers test.
`

	// wellFormedExplicitAllEmpty has explicit headers but all bodies are "(none)".
	wellFormedExplicitAllEmpty := `# ADR

## Invariant Delta

### Added (invariants)

(none)

### Added (glossary)

(none)

### Withdrawn (invariants)

(none)

### Withdrawn (glossary)

(none)

## Decision history (rationale notes)

All empty explicit headers test.
`

	// legacyBareHeaders uses the old format — accepted as invariants-only.
	legacyBareHeaders := `# ADR

## Invariant Delta

### Added

- id: a.b
  definition: First invariant.
  verifier: spec/checks_test.go::TestFoo
  status: active

### Withdrawn

(none)

## Decision history (rationale notes)

Legacy bare headers test.
`

	// mixedLegacyAndExplicit has both bare and explicit headers in separate ADRs —
	// each file is independently valid.
	mixedLegacyAndExplicit := legacyBareHeaders

	// malformedExplicitGlossary has an explicit ### Added (glossary) block whose
	// body is not a YAML list (it's a bare key-value map without "- " prefix).
	malformedExplicitGlossary := `# ADR

## Invariant Delta

### Added (invariants)

(none)

### Added (glossary)

` + "```yaml" + `
term: orphan-entry
definition: Not a list item — missing the leading dash.
` + "```" + `

### Withdrawn (invariants)

(none)

### Withdrawn (glossary)

(none)

## Decision history (rationale notes)

Malformed glossary block test.
`

	// malformedExplicitWithdrawnInvariants has a withdrawn-invariants block whose
	// body is not a list.
	malformedExplicitWithdrawnInvariants := `# ADR

## Invariant Delta

### Added (invariants)

(none)

### Added (glossary)

(none)

### Withdrawn (invariants)

` + "```yaml" + `
id: example.foo.bar
reason: not a list item
` + "```" + `

### Withdrawn (glossary)

(none)

## Decision history (rationale notes)

Malformed withdrawn invariants block test.
`

	cases := []struct {
		name      string
		adrFiles  map[string]string
		wantCount int // expected number of CheckErrors
	}{
		{
			name: "well-formed explicit headers accepted",
			adrFiles: map[string]string{
				"adr-0080-explicit.md": wellFormedExplicit,
			},
			wantCount: 0,
		},
		{
			name: "all-empty explicit headers accepted",
			adrFiles: map[string]string{
				"adr-0001-empty.md": wellFormedExplicitAllEmpty,
			},
			wantCount: 0,
		},
		{
			name: "legacy bare headers accepted",
			adrFiles: map[string]string{
				"adr-0001-legacy.md": legacyBareHeaders,
			},
			wantCount: 0,
		},
		{
			name: "mixed legacy and explicit across multiple files accepted",
			adrFiles: map[string]string{
				"adr-0001-legacy.md":   mixedLegacyAndExplicit,
				"adr-0080-explicit.md": wellFormedExplicit,
			},
			wantCount: 0,
		},
		{
			name: "malformed explicit glossary block flagged",
			adrFiles: map[string]string{
				"adr-0099-bad.md": malformedExplicitGlossary,
			},
			wantCount: 1,
		},
		{
			name: "malformed explicit withdrawn-invariants block flagged",
			adrFiles: map[string]string{
				"adr-0099-bad-withdrawn.md": malformedExplicitWithdrawnInvariants,
			},
			wantCount: 1,
		},
		{
			name: "one good ADR and one malformed: only malformed flagged",
			adrFiles: map[string]string{
				"adr-0001-ok.md":  wellFormedExplicit,
				"adr-0099-bad.md": malformedExplicitGlossary,
			},
			wantCount: 1,
		},
		{
			name:      "no ADR files accepted",
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write ADR %s: %v", name, err)
				}
			}
			errs := newValidator().CheckADRGlossaryDeltaBlock(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}
