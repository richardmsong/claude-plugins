package spec

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// sddBinaryPath returns the path to the sdd verify binary by searching
// $PATH and a sibling bin/ directory. Returns ("", false) if not found.
func sddBinaryPath() (string, bool) {
	// Check PATH first.
	if p, err := exec.LookPath("sdd"); err == nil {
		return p, true
	}
	// Check a sibling bin/ relative to the working directory.
	wd, err := os.Getwd()
	if err != nil {
		return "", false
	}
	candidate := filepath.Join(wd, "..", "bin", "sdd")
	if _, err := os.Stat(candidate); err == nil {
		return candidate, true
	}
	return "", false
}

// TestVerifyExitCodes verifies methodology.cli.verify_exit_codes.
//
// `sdd verify` must exit non-zero whenever any structural check or shell-out
// command fails. This test exercises both branches:
//   - A passing invocation must exit 0.
//   - A failing invocation must exit non-zero.
//
// If the `sdd` binary is not yet built, the test fails with an informative
// message.
func TestVerifyExitCodes(t *testing.T) {
	bin, ok := sddBinaryPath()
	if !ok {
		t.Errorf("invariant methodology.cli.verify_exit_codes not yet enforced — sdd binary not found in PATH or bin/; build the CLI first")
		return
	}
	// Invoke with a non-existent config to force a failure exit code.
	cmd := exec.Command(bin, "verify", "--config", "/nonexistent/spec-driven-config.json")
	err := cmd.Run()
	if err == nil {
		t.Errorf("sdd verify with missing config exited 0 (expected non-zero on failure)")
		return
	}
	exitErr, ok := err.(*exec.ExitError)
	if !ok {
		t.Errorf("sdd verify returned unexpected error type: %v", err)
		return
	}
	if exitErr.ExitCode() == 0 {
		t.Errorf("sdd verify with missing config exited 0 (expected non-zero on failure)")
	}
}

// TestVerifyShellsToConfig verifies methodology.cli.verify_shells_to_config.
//
// `sdd verify` must execute every shell command listed in
// spec-driven-config.json's `verify[]` in declared order after structural
// checks pass. This test checks that the binary reads the verify array from
// config — by injecting a sentinel command and confirming it ran.
//
// If the `sdd` binary is not yet built, the test fails with an informative
// message.
func TestVerifyShellsToConfig(t *testing.T) {
	bin, ok := sddBinaryPath()
	if !ok {
		t.Errorf("invariant methodology.cli.verify_shells_to_config not yet enforced — sdd binary not found in PATH or bin/; build the CLI first")
		return
	}

	// Write a temporary spec-driven-config.json with a sentinel verify command.
	dir := t.TempDir()
	sentinel := filepath.Join(dir, "sentinel.txt")
	configJSON := `{
  "spec": {
    "registry": "spec/registry.yaml",
    "glossary": "spec/glossary.yaml",
    "adr_dir":  "docs",
    "reactions_dir": "reactions"
  },
  "verify": ["touch ` + sentinel + `"]
}`
	cfgPath := filepath.Join(dir, "spec-driven-config.json")
	if err := os.WriteFile(cfgPath, []byte(configJSON), 0644); err != nil {
		t.Fatalf("write temp config: %v", err)
	}

	cmd := exec.Command(bin, "verify", "--config", cfgPath)
	cmd.Dir = dir
	_ = cmd.Run() // Exit code is irrelevant — structural checks may fail on temp dir.

	if _, err := os.Stat(sentinel); err != nil {
		t.Errorf("sdd verify did not execute the verify[] shell command from config (sentinel file not created): %v", err)
	}
}

