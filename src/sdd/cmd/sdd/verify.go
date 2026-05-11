package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"sdd-build/spec"
)

// sddConfig is the parsed shape of spec-driven-config.json.
type sddConfig struct {
	Spec struct {
		Registry     string `json:"registry"`
		Glossary     string `json:"glossary"`
		ADRDir       string `json:"adr_dir"`
		ReactionsDir string `json:"reactions_dir"`
	} `json:"spec"`
	Verify   []string               `json:"verify"`
	Dispatch map[string]any `json:"dispatch"`
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

	// --- Step 1: Run built-in structural checks against the embedded registry. ---
	structuralResults := runStructuralChecks()
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
	adrResults := runADRWalk(cfg, cfgDir)
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

// runStructuralChecks runs every active built-in structural check from the
// methodology's registry (using the embedded spec package).
func runStructuralChecks() []checkResult {
	var results []checkResult

	// Count active invariants — the count itself is reported.
	activeCount := 0
	for _, inv := range spec.Registry {
		if inv.Status == spec.StatusActive {
			activeCount++
		}
	}
	results = append(results, checkResult{
		Name:   "structural.registry_loaded",
		Passed: activeCount > 0,
		Errors: func() []string {
			if activeCount == 0 {
				return []string{"registry has no active entries"}
			}
			return nil
		}(),
	})

	// Check 1: registry.id_field — all IDs match dotted-path regex.
	results = append(results, checkRegistryIDField())

	// Check 2: registry.definition_field — all definitions non-empty, single-line.
	results = append(results, checkRegistryDefinitionField())

	// Check 3: registry.verifier_field — verifier field non-empty, valid format.
	results = append(results, checkRegistryVerifierField())

	// Check 4: registry.status_field — all statuses valid.
	results = append(results, checkRegistryStatusField())

	// Check 5: registry.glossary_terms_field — no empty terms.
	results = append(results, checkRegistryGlossaryTermsField())

	// Check 6: registry.requires_targets_exist — all requires IDs exist.
	results = append(results, checkRegistryRequiresTargetsExist())

	// Check 7: registry.requires_dag_acyclic — no cycles.
	results = append(results, checkRegistryRequiresDagAcyclic())

	// Check 8: registry.supersedes_targets_exist — supersedes points at withdrawn.
	results = append(results, checkRegistrySupersedesTargetsExist())

	// Check 9: registry.no_and_in_definition — no "and" in active definitions.
	results = append(results, checkRegistryNoAndInDefinition())

	// Check 10: glossary — term, definition, resolves_to, scope fields.
	results = append(results, checkGlossaryFields()...)

	return results
}

func checkRegistryIDField() checkResult {
	r := checkResult{Name: "structural.registry.id_field", Passed: true}
	seen := make(map[string]bool)
	for i, inv := range spec.Registry {
		if inv.ID == "" {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("Registry[%d]: id is empty", i))
			continue
		}
		if !spec.IDPattern.MatchString(inv.ID) {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("Registry[%d] id=%q: doesn't match dotted-path regex", i, inv.ID))
		}
		if seen[inv.ID] {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("Registry[%d] id=%q: duplicate id", i, inv.ID))
		}
		seen[inv.ID] = true
	}
	return r
}

func checkRegistryDefinitionField() checkResult {
	r := checkResult{Name: "structural.registry.definition_field", Passed: true}
	for _, inv := range spec.Registry {
		if inv.Definition == "" {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: definition is empty", inv.ID))
		}
		if strings.Contains(inv.Definition, "\n") {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: definition is multi-line", inv.ID))
		}
	}
	return r
}

func checkRegistryVerifierField() checkResult {
	r := checkResult{Name: "structural.registry.verifier_field", Passed: true}
	for _, inv := range spec.Registry {
		if inv.Verifier == "" {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: verifier is empty", inv.ID))
			continue
		}
		parts := strings.SplitN(inv.Verifier, "::", 2)
		if parts[0] == "" {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: verifier path is empty", inv.ID))
		}
		if len(parts) == 2 && parts[1] == "" {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: verifier ::FuncName suffix is empty", inv.ID))
		}
	}
	return r
}

func checkRegistryStatusField() checkResult {
	r := checkResult{Name: "structural.registry.status_field", Passed: true}
	for _, inv := range spec.Registry {
		if !spec.ValidStatus(inv.Status) {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: status %q not in {active, withdrawn}", inv.ID, inv.Status))
		}
	}
	return r
}

func checkRegistryGlossaryTermsField() checkResult {
	r := checkResult{Name: "structural.registry.glossary_terms_field", Passed: true}
	for _, inv := range spec.Registry {
		for j, term := range inv.GlossaryTerms {
			if strings.TrimSpace(term) == "" {
				r.Passed = false
				r.Errors = append(r.Errors, fmt.Sprintf("%s: glossary_terms[%d] is empty/whitespace", inv.ID, j))
			}
		}
	}
	return r
}

func checkRegistryRequiresTargetsExist() checkResult {
	r := checkResult{Name: "structural.registry.requires_targets_exist", Passed: true}
	ids := make(map[string]bool, len(spec.Registry))
	for _, inv := range spec.Registry {
		ids[inv.ID] = true
	}
	for _, inv := range spec.Registry {
		for _, req := range inv.Requires {
			if !ids[req] {
				r.Passed = false
				r.Errors = append(r.Errors, fmt.Sprintf("%s: requires references non-existent invariant %q", inv.ID, req))
			}
		}
	}
	return r
}

func checkRegistryRequiresDagAcyclic() checkResult {
	r := checkResult{Name: "structural.registry.requires_dag_acyclic", Passed: true}
	const (
		white = 0
		gray  = 1
		black = 2
	)
	color := make(map[string]int, len(spec.Registry))
	requires := make(map[string][]string, len(spec.Registry))
	for _, inv := range spec.Registry {
		color[inv.ID] = white
		requires[inv.ID] = inv.Requires
	}
	var stack []string
	var visit func(id string) bool
	visit = func(id string) bool {
		if color[id] == gray {
			cycleStart := 0
			for i, s := range stack {
				if s == id {
					cycleStart = i
					break
				}
			}
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("requires DAG has cycle: %s -> %s",
				strings.Join(stack[cycleStart:], " -> "), id))
			return false
		}
		if color[id] == black {
			return true
		}
		color[id] = gray
		stack = append(stack, id)
		for _, dep := range requires[id] {
			if !visit(dep) {
				return false
			}
		}
		stack = stack[:len(stack)-1]
		color[id] = black
		return true
	}
	for _, inv := range spec.Registry {
		if color[inv.ID] == white {
			visit(inv.ID)
		}
	}
	return r
}

func checkRegistrySupersedesTargetsExist() checkResult {
	r := checkResult{Name: "structural.registry.supersedes_targets_exist", Passed: true}
	byID := make(map[string]spec.Invariant, len(spec.Registry))
	for _, inv := range spec.Registry {
		byID[inv.ID] = inv
	}
	for _, inv := range spec.Registry {
		if inv.Supersedes == "" {
			continue
		}
		predecessor, ok := byID[inv.Supersedes]
		if !ok {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: supersedes references non-existent invariant %q", inv.ID, inv.Supersedes))
			continue
		}
		if predecessor.Status != spec.StatusWithdrawn {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: supersedes %q whose status is %q (expected withdrawn)",
				inv.ID, inv.Supersedes, predecessor.Status))
		}
	}
	return r
}

func checkRegistryNoAndInDefinition() checkResult {
	r := checkResult{Name: "structural.registry.no_and_in_definition", Passed: true}
	for _, inv := range spec.Registry {
		if inv.Status != spec.StatusActive {
			continue
		}
		if strings.Contains(strings.ToLower(" "+inv.Definition+" "), " and ") {
			r.Passed = false
			r.Errors = append(r.Errors, fmt.Sprintf("%s: definition contains 'and': %q", inv.ID, inv.Definition))
		}
	}
	return r
}

func checkGlossaryFields() []checkResult {
	var results []checkResult

	r1 := checkResult{Name: "structural.glossary.term_field", Passed: true}
	seen := make(map[string]bool)
	for i, g := range spec.Glossary {
		if strings.TrimSpace(g.Term) == "" {
			r1.Passed = false
			r1.Errors = append(r1.Errors, fmt.Sprintf("Glossary[%d]: term is empty", i))
			continue
		}
		if seen[g.Term] {
			r1.Passed = false
			r1.Errors = append(r1.Errors, fmt.Sprintf("Glossary[%d] term=%q: duplicate term", i, g.Term))
		}
		seen[g.Term] = true
	}
	results = append(results, r1)

	r2 := checkResult{Name: "structural.glossary.definition_field", Passed: true}
	for _, g := range spec.Glossary {
		if strings.TrimSpace(g.Definition) == "" {
			r2.Passed = false
			r2.Errors = append(r2.Errors, fmt.Sprintf("%s: definition is empty", g.Term))
		}
	}
	results = append(results, r2)

	r3 := checkResult{Name: "structural.glossary.resolves_to_field", Passed: true}
	for _, g := range spec.Glossary {
		if strings.TrimSpace(g.ResolvesTo) == "" {
			r3.Passed = false
			r3.Errors = append(r3.Errors, fmt.Sprintf("%s: resolves_to is empty", g.Term))
		}
	}
	results = append(results, r3)

	r4 := checkResult{Name: "structural.glossary.scope_field", Passed: true}
	for _, g := range spec.Glossary {
		if !spec.ValidScope(g.Scope) {
			r4.Passed = false
			r4.Errors = append(r4.Errors, fmt.Sprintf("%s: scope %q not in {methodology, project-cross-cutting, component-local}", g.Term, g.Scope))
		}
	}
	results = append(results, r4)

	return results
}

// runADRWalk walks cfg.Spec.ADRDir for adr-*.md files and parses each one's
// ## Invariant Delta section. Returns a checkResult per ADR file.
func runADRWalk(cfg *sddConfig, cfgDir string) []checkResult {
	adrDir := cfg.Spec.ADRDir
	if adrDir == "" {
		adrDir = "docs"
	}
	// Resolve relative to cfgDir.
	if !filepath.IsAbs(adrDir) {
		adrDir = filepath.Join(cfgDir, adrDir)
	}

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
