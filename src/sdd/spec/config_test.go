package spec

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// readConfigRaw reads spec-driven-config.json from the repo root.
func readConfigRaw(repoRoot string) ([]byte, error) {
	return os.ReadFile(filepath.Join(repoRoot, "spec-driven-config.json"))
}

// extractVerifyArray extracts string elements from the top-level "verify" JSON
// array in spec-driven-config.json. Returns (nil, false) if the key is absent,
// or (items, true) where items may be empty if the array is empty.
//
// Only handles the simple case where each element is a JSON string on its own
// line — sufficient for the config format this project uses.
func extractVerifyArray(data []byte) (items []string, present bool) {
	verifyRE := regexp.MustCompile(`"verify"\s*:\s*\[`)
	loc := verifyRE.FindIndex(data)
	if loc == nil {
		return nil, false
	}
	// Extract the array body (everything between the brackets).
	body := data[loc[1]:]
	depth := 1
	end := 0
	for i, b := range body {
		switch b {
		case '[':
			depth++
		case ']':
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
	arrayText := string(body[:end])
	// Extract string elements.
	strRE := regexp.MustCompile(`"((?:[^"\\]|\\.)*)"`)
	for _, m := range strRE.FindAllStringSubmatch(arrayText, -1) {
		items = append(items, strings.TrimSpace(m[1]))
	}
	return items, true
}

// TestConfigSpecRegistry verifies methodology.config.spec_registry.
//
// spec-driven-config.json must declare spec.registry as a non-empty string path.
func TestConfigSpecRegistry(t *testing.T) {
	_, cfg := loadSddConfig(t)
	v, ok := cfg["registry"]
	if !ok || v == "" {
		t.Errorf("spec-driven-config.json: spec.registry is missing or empty")
	}
}

// TestConfigSpecGlossary verifies methodology.config.spec_glossary.
//
// spec-driven-config.json must declare spec.glossary as a non-empty string path.
func TestConfigSpecGlossary(t *testing.T) {
	_, cfg := loadSddConfig(t)
	v, ok := cfg["glossary"]
	if !ok || v == "" {
		t.Errorf("spec-driven-config.json: spec.glossary is missing or empty")
	}
}

// TestConfigSpecADRDir verifies methodology.config.spec_adr_dir.
//
// spec-driven-config.json must declare spec.adr_dir as a non-empty string path.
func TestConfigSpecADRDir(t *testing.T) {
	_, cfg := loadSddConfig(t)
	v, ok := cfg["adr_dir"]
	if !ok || v == "" {
		t.Errorf("spec-driven-config.json: spec.adr_dir is missing or empty")
	}
}

// TestConfigSpecReactionsDir verifies methodology.config.spec_reactions_dir.
//
// spec-driven-config.json must declare spec.reactions_dir as a non-empty string path.
func TestConfigSpecReactionsDir(t *testing.T) {
	_, cfg := loadSddConfig(t)
	v, ok := cfg["reactions_dir"]
	if !ok || v == "" {
		t.Errorf("spec-driven-config.json: spec.reactions_dir is missing or empty")
	}
}

// TestConfigVerifyArray verifies methodology.config.verify_array_well_formed.
//
// spec-driven-config.json's verify field must be a list whose elements are
// non-empty shell command strings. This test parses the top-level verify array
// and checks each element is a non-empty string. An absent verify field is
// treated as an empty list (valid — no extra checks configured).
func TestConfigVerifyArray(t *testing.T) {
	root, _ := loadSddConfig(t)
	data, err := readConfigRaw(root)
	if err != nil {
		t.Fatalf("read spec-driven-config.json: %v", err)
	}
	// Extract the verify array items using a simple line scan.
	// We look for the "verify" key at the top level and collect string elements.
	// If verify is absent, the invariant is trivially satisfied.
	items, present := extractVerifyArray(data)
	if !present {
		// Absent verify field is permitted — empty list is well-formed.
		return
	}
	for i, item := range items {
		if item == "" {
			t.Errorf("spec-driven-config.json: verify[%d] is empty (must be a non-empty shell command)", i)
		}
	}
}
