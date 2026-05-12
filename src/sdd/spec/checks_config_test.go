package spec

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// configWithRegistry returns a *Config with a non-empty spec.registry field.
func configWithRegistry(registry string) *Config {
	var cfg Config
	cfg.Spec.Registry = registry
	return &cfg
}

// configWithGlossary returns a *Config with a non-empty spec.glossary field.
func configWithGlossary(glossary string) *Config {
	var cfg Config
	cfg.Spec.Glossary = glossary
	return &cfg
}

// configWithADRDir returns a *Config with a non-empty spec.adr_dir field.
func configWithADRDir(adrDir string) *Config {
	var cfg Config
	cfg.Spec.ADRDir = adrDir
	return &cfg
}

// configWithReactionsDir returns a *Config with a non-empty spec.reactions_dir field.
func configWithReactionsDir(reactionsDir string) *Config {
	var cfg Config
	cfg.Spec.ReactionsDir = reactionsDir
	return &cfg
}

// configWithVerify returns a *Config with a Verify slice.
func configWithVerify(verify []string) *Config {
	var cfg Config
	cfg.Verify = verify
	return &cfg
}

// TestCheckConfigSpecRegistry bounds methodology.validator.config_spec_registry.
//
// CheckConfigSpecRegistry must return a CheckError when the loaded config's
// spec.registry field is empty or missing, and no error when present and valid.
func TestCheckConfigSpecRegistry(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go
	cases := []struct {
		name      string
		cfg       *Config
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty registry path accepted",
			cfg:       configWithRegistry("spec/registry.yaml"),
			wantCount: 0,
		},
		{
			name:      "empty registry path flagged",
			cfg:       configWithRegistry(""),
			wantCount: 1,
			wantField: "spec.registry",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "spec.registry",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckConfigSpecRegistry(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckConfigSpecGlossary bounds methodology.validator.config_spec_glossary.
//
// CheckConfigSpecGlossary must return a CheckError when the loaded config's
// spec.glossary field is missing or empty, and no error otherwise.
func TestCheckConfigSpecGlossary(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		cfg       *Config
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty glossary path accepted",
			cfg:       configWithGlossary("spec/glossary.yaml"),
			wantCount: 0,
		},
		{
			name:      "empty glossary path flagged",
			cfg:       configWithGlossary(""),
			wantCount: 1,
			wantField: "spec.glossary",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "spec.glossary",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckConfigSpecGlossary(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckConfigSpecADRDir bounds methodology.validator.config_spec_adr_dir.
//
// CheckConfigSpecADRDir must return a CheckError when the loaded config's
// spec.adr_dir field is missing or does not point to an existing directory,
// and no error otherwise.
func TestCheckConfigSpecADRDir(t *testing.T) {
	v := newValidator()

	// Use a real temp dir to represent an existing directory.
	existingDir := t.TempDir()

	cases := []struct {
		name      string
		cfg       *Config
		wantCount int
		wantField string
	}{
		{
			name:      "existing directory accepted",
			cfg:       configWithADRDir(existingDir),
			wantCount: 0,
		},
		{
			name:      "empty adr_dir flagged",
			cfg:       configWithADRDir(""),
			wantCount: 1,
			wantField: "spec.adr_dir",
		},
		{
			name:      "non-existent directory flagged",
			cfg:       configWithADRDir("/nonexistent/adr/directory"),
			wantCount: 1,
			wantField: "spec.adr_dir",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "spec.adr_dir",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckConfigSpecADRDir(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckConfigSpecReactionsDir bounds methodology.validator.config_spec_reactions_dir.
//
// CheckConfigSpecReactionsDir must return a CheckError when the loaded config's
// spec.reactions_dir field is missing or invalid, and no error otherwise.
func TestCheckConfigSpecReactionsDir(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		cfg       *Config
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty reactions_dir path accepted",
			cfg:       configWithReactionsDir("reactions"),
			wantCount: 0,
		},
		{
			name:      "empty reactions_dir flagged",
			cfg:       configWithReactionsDir(""),
			wantCount: 1,
			wantField: "spec.reactions_dir",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "spec.reactions_dir",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckConfigSpecReactionsDir(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestProjectVerifyIncludesInspect bounds project.config.verify_includes_inspect.
//
// The project's verify[] array must contain an entry that invokes
// `inspect eval-set` over <project>/spec/evals/ followed by
// `python scripts/inspect-gate.py` over the eval log directory (within the
// same shell entry separated by `;`, or as two consecutive entries).
// The --log-dir path passed to `inspect eval-set` must equal the path argument
// to `python scripts/inspect-gate.py` — diverging log-dir paths are rejected.
// The positional path argument to `inspect eval-set` (before --log-dir) must
// equal the project's eval directory: `src/sdd/spec/evals`.
func TestProjectVerifyIncludesInspect(t *testing.T) {
	cases := []struct {
		name      string
		cfg       *Config
		wantCount int // number of CheckErrors expected
		wantField string
	}{
		{
			name: "single entry with inspect eval-set and gate separated by semicolon accepted",
			cfg: configWithVerify([]string{
				"cd src/sdd && go test ./spec/...",
				"inspect eval-set src/sdd/spec/evals --log-dir src/sdd/spec/eval-logs --epochs 3 ; python scripts/inspect-gate.py src/sdd/spec/eval-logs",
			}),
			wantCount: 0,
		},
		{
			name: "two consecutive entries for inspect and gate accepted",
			cfg: configWithVerify([]string{
				"inspect eval-set src/sdd/spec/evals --log-dir src/sdd/spec/eval-logs",
				"python scripts/inspect-gate.py src/sdd/spec/eval-logs",
			}),
			wantCount: 0,
		},
		{
			name: "verify array missing inspect eval-set entry flagged",
			cfg: configWithVerify([]string{
				"cd src/sdd && go test ./spec/...",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name: "inspect eval-set present but gate missing flagged",
			cfg: configWithVerify([]string{
				"inspect eval-set src/sdd/spec/evals",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name: "log-dir in inspect eval-set differs from gate path flagged",
			cfg: configWithVerify([]string{
				"inspect eval-set src/sdd/spec/evals --log-dir src/sdd/spec/eval-logs --epochs 3 ; python scripts/inspect-gate.py src/sdd/spec/OTHER-logs",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name: "log-dir in consecutive entries differs from gate path flagged",
			cfg: configWithVerify([]string{
				"inspect eval-set src/sdd/spec/evals --log-dir src/sdd/spec/eval-logs",
				"python scripts/inspect-gate.py src/sdd/spec/OTHER-logs",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			// The eval-dir argument to `inspect eval-set` must equal the project's
			// eval directory (src/sdd/spec/evals).  A wrong directory passes the
			// log-dir consistency check but fails the eval-dir check.
			name: "eval-dir argument to inspect eval-set is wrong path flagged",
			cfg: configWithVerify([]string{
				"inspect eval-set /some/wrong/dir --log-dir src/sdd/spec/eval-logs --epochs 3 ; python scripts/inspect-gate.py src/sdd/spec/eval-logs",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			// Same as above, using consecutive entries.
			name: "wrong eval-dir in consecutive entries flagged",
			cfg: configWithVerify([]string{
				"inspect eval-set other/evals --log-dir src/sdd/spec/eval-logs",
				"python scripts/inspect-gate.py src/sdd/spec/eval-logs",
			}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name:      "nil verify array flagged",
			cfg:       configWithVerify(nil),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "verify",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := newValidator().CheckProjectVerifyIncludesInspect(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckConfigVerifyArray bounds methodology.validator.config_verify_array_well_formed.
//
// CheckConfigVerifyArray must return a CheckError when the loaded config's
// verify field is present but contains non-string or empty elements, and no
// error when absent or well-formed.
func TestCheckConfigVerifyArray(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		cfg       *Config
		wantCount int
		wantField string
	}{
		{
			name:      "nil verify array (absent) accepted",
			cfg:       configWithVerify(nil),
			wantCount: 0,
		},
		{
			name:      "empty verify array accepted",
			cfg:       configWithVerify([]string{}),
			wantCount: 0,
		},
		{
			name:      "non-empty well-formed commands accepted",
			cfg:       configWithVerify([]string{"go test ./...", "go vet ./..."}),
			wantCount: 0,
		},
		{
			name:      "verify array with empty string element flagged",
			cfg:       configWithVerify([]string{"go test ./...", ""}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name:      "verify array with whitespace-only element flagged",
			cfg:       configWithVerify([]string{"   "}),
			wantCount: 1,
			wantField: "verify",
		},
		{
			name:      "nil config flagged",
			cfg:       nil,
			wantCount: 1,
			wantField: "verify",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckConfigVerifyArray(nil, nil, tc.cfg, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestVerifyArrayIncludesUITests bounds methodology.dashboard.ui_tests_in_verify_chain.
//
// The project's verify[] array must contain an entry that runs the UI Bun test
// suite by executing `cd src/sdd/docs-dashboard/ui && bun test src/__tests__/`
// so that component regressions fail the methodology gate.
//
// Free function — does NOT depend on the Validator interface. Walks up from
// cwd to locate spec-driven-config.json, parses it directly, asserts that
// at least one verify[] entry contains the UI test command. Expected to FAIL
// until the entry is added by the dev-harness pass following ADR-0085.
func TestVerifyArrayIncludesUITests(t *testing.T) {
	const needle = "cd src/sdd/docs-dashboard/ui && bun test src/__tests__/"

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	dir := cwd
	var configPath string
	for {
		candidate := filepath.Join(dir, "spec-driven-config.json")
		if _, err := os.Stat(candidate); err == nil {
			configPath = candidate
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("spec-driven-config.json not found walking up from %q", cwd)
		}
		dir = parent
	}

	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read %s: %v", configPath, err)
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse %s: %v", configPath, err)
	}

	found := false
	for _, cmd := range cfg.Verify {
		if strings.Contains(cmd, needle) {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("spec-driven-config.json verify[] does not contain a UI Bun test entry (expected substring %q); add it per ADR-0085", needle)
	}
}
