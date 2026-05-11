package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"sdd-build/spec"
)

// AllChecks aliases spec.AllChecks for test access from the main package.
var AllChecks = spec.AllChecks

// sddConfig is the parsed shape of spec-driven-config.json.
type sddConfig struct {
	Spec struct {
		Registry     string `json:"registry"`
		Glossary     string `json:"glossary"`
		ADRDir       string `json:"adr_dir"`
		ReactionsDir string `json:"reactions_dir"`
	} `json:"spec"`
	Verify   []string       `json:"verify"`
	Dispatch map[string]any `json:"dispatch"`
}

// toSpecConfig converts a *sddConfig into a *spec.Config for validator dispatch.
func toSpecConfig(c *sddConfig) *spec.Config {
	if c == nil {
		return nil
	}
	var sc spec.Config
	sc.Spec.Registry = c.Spec.Registry
	sc.Spec.Glossary = c.Spec.Glossary
	sc.Spec.ADRDir = c.Spec.ADRDir
	sc.Spec.ReactionsDir = c.Spec.ReactionsDir
	sc.Verify = c.Verify
	return &sc
}

// checkResult records the outcome of a single structural check.
type checkResult struct {
	Name   string
	Passed bool
	Errors []string
}

// runVerify implements the `sdd verify` subcommand.
// Returns 0 on full success, 1 on any check failure, 2 on usage/internal error.
func runVerify(args []string) int {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to spec-driven-config.json (default: search upward from cwd)")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "sdd verify: %v\n", err)
		return 2
	}

	// Load config.
	cfg, cfgDir, canonicalCfgPath, err := loadConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "sdd verify: load config: %v\n", err)
		return 1
	}

	anyFailed := false

	// Resolve adrDir for structural checks.
	adrDir := cfg.Spec.ADRDir
	if adrDir == "" {
		adrDir = "docs"
	}
	if !filepath.IsAbs(adrDir) {
		adrDir = filepath.Join(cfgDir, adrDir)
	}

	// --- Step 1: Run built-in structural checks via spec.AllChecks dispatch. ---
	structuralResults := runStructuralChecks(spec.Registry, spec.Glossary, toSpecConfig(cfg), adrDir)
	for _, r := range structuralResults {
		if r.Passed {
			fmt.Printf("PASS  %s\n", r.Name)
		} else {
			anyFailed = true
			for _, e := range r.Errors {
				fmt.Printf("FAIL  %s: %s\n", r.Name, e)
			}
		}
	}

	// --- Step 2: Walk adr_dir and parse ## Invariant Delta blocks. ---
	adrResults := runWalkADRs(adrDir)
	for _, r := range adrResults {
		if r.Passed {
			fmt.Printf("PASS  %s\n", r.Name)
		} else {
			anyFailed = true
			for _, e := range r.Errors {
				fmt.Printf("FAIL  %s: %s\n", r.Name, e)
			}
		}
	}

	// --- Step 3: Shell out to verify[] commands (always, even if checks above failed). ---
	shellFailed := runShellVerifiers(cfg, cfgDir, canonicalCfgPath)
	if shellFailed {
		anyFailed = true
	}

	if anyFailed {
		return 1
	}
	return 0
}

// loadConfig reads and parses spec-driven-config.json.
// If configPath is non-empty (via --config flag), that file is read directly and
// a missing file is a fatal error (exit 1).
// If configPath is empty, spec-driven-config.json is looked up in cwd only —
// if absent, a zero-value config is returned (no verify[] commands, no adr_dir
// override) so that structural checks still run and the binary exits 0 or 1.
// Returns the parsed config, the directory to resolve relative paths against,
// and the canonical absolute path of the config file (empty string if none was found).
func loadConfig(configPath string) (*sddConfig, string, string, error) {
	if configPath != "" {
		// Explicit --config: a missing file is an error.
		data, err := os.ReadFile(configPath)
		if err != nil {
			return nil, "", "", fmt.Errorf("read %s: %w", configPath, err)
		}
		var cfg sddConfig
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, "", "", fmt.Errorf("parse %s: %w", configPath, err)
		}
		canonical, err := filepath.Abs(configPath)
		if err != nil {
			return nil, "", "", fmt.Errorf("abs %s: %w", configPath, err)
		}
		canonical = filepath.Clean(canonical)
		return &cfg, filepath.Dir(canonical), canonical, nil
	}

	// No --config flag: look in cwd only.
	wd, err := os.Getwd()
	if err != nil {
		return nil, "", "", fmt.Errorf("getwd: %w", err)
	}
	candidate := filepath.Join(wd, "spec-driven-config.json")
	data, err := os.ReadFile(candidate)
	if err != nil {
		// Config absent: return zero value. Structural checks still run.
		// canonicalCfgPath is "" to indicate no config file was loaded.
		return &sddConfig{}, wd, "", nil
	}
	var cfg sddConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, "", "", fmt.Errorf("parse %s: %w", candidate, err)
	}
	canonical := filepath.Clean(candidate)
	return &cfg, wd, canonical, nil
}

// runStructuralChecks dispatches every entry in spec.AllChecks with the
// provided inputs and returns one checkResult per registered check.
// The checkResult.Name matches the NamedCheck.Name so callers can compare them.
func runStructuralChecks(reg []spec.Invariant, glos []spec.GlossaryEntry, cfg *spec.Config, adrDir string) []checkResult {
	var results []checkResult
	for _, c := range spec.AllChecks {
		errs := c.Method(reg, glos, cfg, adrDir)
		r := checkResult{
			Name:   c.Name,
			Passed: len(errs) == 0,
		}
		for _, e := range errs {
			r.Errors = append(r.Errors, e.Message)
		}
		results = append(results, r)
	}
	return results
}

// runWalkADRs walks adrDir for adr-*.md files and parses each one's
// ## Invariant Delta section. Returns a checkResult per ADR file.
func runWalkADRs(adrDir string) []checkResult {
	paths, err := spec.FindAllADRs(adrDir)
	if err != nil {
		return []checkResult{{
			Name:   "structural.adr_walk",
			Passed: false,
			Errors: []string{fmt.Sprintf("glob adr-*.md in %s: %v", adrDir, err)},
		}}
	}

	if len(paths) == 0 {
		// No ADRs to walk is not a failure — the repo may be bootstrapping.
		return []checkResult{{
			Name:   "structural.adr_walk",
			Passed: true,
			Errors: nil,
		}}
	}

	var results []checkResult
	for _, p := range paths {
		r := checkResult{
			Name:   fmt.Sprintf("structural.adr.%s", filepath.Base(p)),
			Passed: true,
		}
		_, err := spec.ParseADRDeltaBlock(p)
		if err != nil {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("parse %s: %v", filepath.Base(p), err))
		}
		results = append(results, r)
	}
	return results
}

// sddVerifyEnvKey is an environment variable set by sdd verify before running
// shell-out commands. Its value is the canonical absolute path of the config
// file the outer invocation is verifying (empty string if no config file was
// found). A nested sdd verify invocation compares its own config path against
// this value: equal paths mean true recursion (same config looping), so it
// skips verify[] to break the loop. Different paths mean a legitimate nested
// validation (e.g. a test injecting a synthetic temp config) and verify[] runs
// normally.
const sddVerifyEnvKey = "SDD_VERIFY_RUNNING_CONFIG"

// runShellVerifiers executes each command in cfg.Verify in order.
// Returns true if any command fails.
// Skips execution entirely when the outer sdd verify invocation is already
// verifying the same config (detected via SDD_VERIFY_RUNNING_CONFIG), to
// prevent infinite recursion when verify[] contains a command that itself
// invokes sdd verify against the same config.
func runShellVerifiers(cfg *sddConfig, cfgDir string, canonicalCfgPath string) bool {
	outerCfgPath := os.Getenv(sddVerifyEnvKey)
	// The env var is present (outer set it) and both sides agree on the same
	// config path → this is a true recursive invocation of the same config.
	// Skip verify[] to break the loop.
	//
	// Edge case: if both outer and inner have no config file, canonicalCfgPath
	// and outerCfgPath are both "" — comparison fires and verify[] is skipped.
	// That is safe because an empty config has no verify[] entries anyway.
	_, envPresent := os.LookupEnv(sddVerifyEnvKey)
	if envPresent && outerCfgPath == canonicalCfgPath {
		return false
	}
	anyFailed := false
	for i, command := range cfg.Verify {
		if command == "" {
			fmt.Fprintf(os.Stderr, "sdd verify: verify[%d] is empty — skipping\n", i)
			continue
		}
		fmt.Printf("RUN   verify[%d]: %s\n", i, command)
		if err := runShellCommand(command, cfgDir, canonicalCfgPath); err != nil {
			fmt.Fprintf(os.Stderr, "FAIL  verify[%d]: %s: %v\n", i, command, err)
			anyFailed = true
		} else {
			fmt.Printf("PASS  verify[%d]: %s\n", i, command)
		}
	}
	return anyFailed
}

// runShellCommand executes a shell command string via the system shell.
// It sets SDD_VERIFY_RUNNING_CONFIG=<canonicalCfgPath> in the child's
// environment so that any nested sdd verify invocation can detect same-config
// recursion and skip verify[] only in that case.
func runShellCommand(command, dir string, canonicalCfgPath string) error {
	var shell, flag string
	if runtime.GOOS == "windows" {
		shell = "cmd"
		flag = "/C"
	} else {
		shell = "sh"
		flag = "-c"
	}
	cmd := exec.Command(shell, flag, command)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), sddVerifyEnvKey+"="+canonicalCfgPath)
	return cmd.Run()
}

