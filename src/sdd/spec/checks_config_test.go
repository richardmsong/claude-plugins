package spec

import (
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
