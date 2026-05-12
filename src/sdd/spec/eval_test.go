package spec

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// sddModuleRoot returns the absolute path of the src/sdd module root by walking
// up from the test binary's working directory until it finds a go.mod file, or
// by resolving relative to the file-system layout: the test binary for
// package spec runs inside src/sdd/spec/, so the module root is one level up.
func sddModuleRoot(t *testing.T) string {
	t.Helper()
	// The test binary runs with its cwd set to the package directory (src/sdd/spec).
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// Walk up until we find go.mod.
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not find go.mod walking up from %q", cwd)
		}
		dir = parent
	}
}

// TestEvalTaskNamingMatchesInvariantID bounds project.eval.task_naming_matches_invariant_id.
//
// Every Python module under <project>/spec/evals/ matching *_eval.py must:
//   - export a @task-decorated function whose name matches the full suffix of an
//     active registry invariant_id (with `.` replaced by `_`), where the suffix
//     is derived from all segments after the first dot-separated prefix;
//   - have a file basename following the convention <task_function>_eval.py.
//
// This test asserts on the full set of ADR-0080 invariant-to-eval mappings using
// synthetic registry inputs (unit-only, no embedded registry read).  The task
// function names must use the full post-prefix form: e.g.
// `methodology.compile_invariants.file_scope` → `compile_invariants_file_scope`
// (not the bare `file_scope` short form).
func TestEvalTaskNamingMatchesInvariantID(t *testing.T) {
	errs := newValidator().CheckEvalTaskNamingMatchesInvariantID(
		[]Invariant{
			{ID: "methodology.plan_feature.user_flow_walkthrough", Verifier: "src/sdd/spec/evals/plan_feature_user_flow_walkthrough_eval.py::plan_feature_user_flow_walkthrough", Status: StatusActive},
			{ID: "methodology.plan_feature.audit_until_clean", Verifier: "src/sdd/spec/evals/plan_feature_audit_until_clean_eval.py::plan_feature_audit_until_clean", Status: StatusActive},
			{ID: "methodology.invariant_testing_evaluator.flags_under_constraining_verifiers", Verifier: "src/sdd/spec/evals/invariant_testing_evaluator_flags_under_constraining_verifiers_eval.py::invariant_testing_evaluator_flags_under_constraining_verifiers", Status: StatusActive},
			{ID: "methodology.compile_invariants.file_scope", Verifier: "src/sdd/spec/evals/compile_invariants_file_scope_eval.py::compile_invariants_file_scope", Status: StatusActive},
			{ID: "methodology.compile_invariants.no_test_scaffolding", Verifier: "src/sdd/spec/evals/compile_invariants_no_test_scaffolding_eval.py::compile_invariants_no_test_scaffolding", Status: StatusActive},
			{ID: "methodology.compile_invariants.references_undefined_symbols", Verifier: "src/sdd/spec/evals/compile_invariants_references_undefined_symbols_eval.py::compile_invariants_references_undefined_symbols", Status: StatusActive},
			{ID: "methodology.dev_harness.test_files_not_edited", Verifier: "src/sdd/spec/evals/dev_harness_test_files_not_edited_eval.py::dev_harness_test_files_not_edited", Status: StatusActive},
			{ID: "methodology.master_session.edits_only_contract_surface", Verifier: "src/sdd/spec/evals/master_session_edits_only_contract_surface_eval.py::master_session_edits_only_contract_surface", Status: StatusActive},
			{ID: "methodology.master_session.delegates_implementation", Verifier: "src/sdd/spec/evals/master_session_delegates_implementation_eval.py::master_session_delegates_implementation", Status: StatusActive},
			{ID: "methodology.master_session.runs_at_opus_tier", Verifier: "src/sdd/spec/evals/master_session_runs_at_opus_tier_eval.py::master_session_runs_at_opus_tier", Status: StatusActive},
			{ID: "methodology.subagent.runs_at_sonnet_tier", Verifier: "src/sdd/spec/evals/subagent_runs_at_sonnet_tier_eval.py::subagent_runs_at_sonnet_tier", Status: StatusActive},
			{ID: "methodology.master_session.unbiased_subagent_prompts", Verifier: "src/sdd/spec/evals/master_session_unbiased_subagent_prompts_eval.py::master_session_unbiased_subagent_prompts", Status: StatusActive},
		},
		nil, nil, "",
	)
	if len(errs) != 0 {
		t.Errorf("expected 0 errors for well-formed eval invariants, got %d: %v", len(errs), errs)
	}
}

// TestEvalTaskNamingMatchesInvariantID_Mismatches checks that mismatched names
// are flagged by CheckEvalTaskNamingMatchesInvariantID.
func TestEvalTaskNamingMatchesInvariantID_Mismatches(t *testing.T) {
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name: "task function name matches full post-prefix suffix",
			input: []Invariant{
				{
					ID:       "methodology.compile_invariants.file_scope",
					Verifier: "src/sdd/spec/evals/compile_invariants_file_scope_eval.py::compile_invariants_file_scope",
					Status:   StatusActive,
				},
			},
			wantCount: 0,
		},
		{
			name: "task function name mismatches invariant id suffix flagged",
			input: []Invariant{
				{
					ID:       "methodology.compile_invariants.file_scope",
					Verifier: "src/sdd/spec/evals/compile_invariants_file_scope_eval.py::wrong_name",
					Status:   StatusActive,
				},
			},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name: "short-suffix form (bare leaf) flagged — full post-prefix suffix required",
			input: []Invariant{
				{
					ID:       "methodology.compile_invariants.file_scope",
					Verifier: "src/sdd/spec/evals/compile_invariants_file_scope_eval.py::file_scope",
					Status:   StatusActive,
				},
			},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name: "file basename does not match task function name flagged",
			input: []Invariant{
				{
					ID:       "methodology.compile_invariants.file_scope",
					Verifier: "src/sdd/spec/evals/bad_name_eval.py::compile_invariants_file_scope",
					Status:   StatusActive,
				},
			},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name: "non-eval verifier path not checked",
			input: []Invariant{
				{
					ID:       "methodology.config.verify_array_well_formed",
					Verifier: "src/sdd/spec/checks_config_test.go::TestCheckConfigVerifyArray",
					Status:   StatusActive,
				},
			},
			wantCount: 0,
		},
		{
			name: "withdrawn eval entry not checked",
			input: []Invariant{
				{
					ID:       "methodology.compile_invariants.file_scope",
					Verifier: "src/sdd/spec/evals/bad_name_eval.py::wrong_function",
					Status:   StatusWithdrawn,
				},
			},
			wantCount: 0,
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := newValidator().CheckEvalTaskNamingMatchesInvariantID(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestProjectInspectGateAggregatesFailureModes bounds project.inspect_gate.aggregates_failure_modes.
//
// scripts/inspect-gate.py must exit non-zero in three labeled cases:
//  1. Empty log directory — Inspect didn't run.
//  2. A task log with status != "success" (Inspect-side failure).
//  3. A task log with aggregate INCORRECT (score failure).
//
// The test synthesizes minimal Inspect-compatible .eval log files for each case
// and asserts that the gate helper exits non-zero with a message naming the
// failure mode. It also asserts that a directory with a valid success+CORRECT
// log produces exit code 0.
//
// Note: this test runs scripts/inspect-gate.py via os/exec. If the Python
// interpreter or the gate script is not present, the test is skipped (not failed),
// matching the methodology's "missing interpreter → shell exit surfaced at verify
// time, not at test time" convention.
func TestProjectInspectGateAggregatesFailureModes(t *testing.T) {
	moduleRoot := sddModuleRoot(t)
	gateScript := filepath.Join(moduleRoot, "scripts", "inspect-gate.py")

	// Skip if scripts/inspect-gate.py is not present yet — dev-harness authors it.
	if _, err := os.Stat(gateScript); os.IsNotExist(err) {
		t.Skipf("scripts/inspect-gate.py not found at %q; skipping gate-behavior tests (dev-harness will author the script)", gateScript)
	}

	// Skip if python3 is not on PATH.
	pythonBin, err := exec.LookPath("python3")
	if err != nil {
		pythonBin, err = exec.LookPath("python")
		if err != nil {
			t.Skip("python interpreter not found on PATH; skipping gate-behavior tests")
		}
	}

	// Minimal JSON shape expected by inspect-gate.py for a completed eval log.
	// The gate reads status and the reducer aggregate per task.
	makeLog := func(taskName, status, aggregate string) string {
		return `{
  "version": "0.3.0",
  "status": "` + status + `",
  "eval": {
    "task": "` + taskName + `",
    "task_id": "` + taskName + `"
  },
  "results": {
    "scores": [
      {
        "name": "` + taskName + `",
        "reducer": "` + aggregate + `",
        "metrics": {
          "accuracy": { "value": ` + map[string]string{"CORRECT": "1.0", "INCORRECT": "0.33"}[aggregate] + ` }
        }
      }
    ]
  }
}
`
	}

	cases := []struct {
		name          string
		setupDir      func(t *testing.T) string // returns log dir path
		wantExitZero  bool
		wantMsgSubstr string // substring expected in gate output on failure
	}{
		{
			name: "empty log directory exits non-zero",
			setupDir: func(t *testing.T) string {
				return t.TempDir() // empty — no .eval files
			},
			wantExitZero:  false,
			wantMsgSubstr: "no eval logs",
		},
		{
			name: "task with status error exits non-zero",
			setupDir: func(t *testing.T) string {
				dir := t.TempDir()
				content := makeLog("my_task", "error", "CORRECT")
				if err := os.WriteFile(filepath.Join(dir, "run.eval"), []byte(content), 0644); err != nil {
					t.Fatalf("write log: %v", err)
				}
				return dir
			},
			wantExitZero:  false,
			wantMsgSubstr: "status",
		},
		{
			name: "task with aggregate INCORRECT exits non-zero",
			setupDir: func(t *testing.T) string {
				dir := t.TempDir()
				content := makeLog("my_task", "success", "INCORRECT")
				if err := os.WriteFile(filepath.Join(dir, "run.eval"), []byte(content), 0644); err != nil {
					t.Fatalf("write log: %v", err)
				}
				return dir
			},
			wantExitZero:  false,
			wantMsgSubstr: "INCORRECT",
		},
		{
			name: "task with status success and aggregate CORRECT exits zero",
			setupDir: func(t *testing.T) string {
				dir := t.TempDir()
				content := makeLog("my_task", "success", "CORRECT")
				if err := os.WriteFile(filepath.Join(dir, "run.eval"), []byte(content), 0644); err != nil {
					t.Fatalf("write log: %v", err)
				}
				return dir
			},
			wantExitZero: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logDir := tc.setupDir(t)
			cmd := exec.Command(pythonBin, gateScript, logDir)
			out, err := cmd.CombinedOutput()
			exitedZero := err == nil

			if tc.wantExitZero && !exitedZero {
				t.Errorf("expected exit 0 but got error: %v\noutput:\n%s", err, out)
			}
			if !tc.wantExitZero && exitedZero {
				t.Errorf("expected non-zero exit but exited 0\noutput:\n%s", out)
			}
			if tc.wantMsgSubstr != "" && !strings.Contains(strings.ToLower(string(out)), strings.ToLower(tc.wantMsgSubstr)) {
				t.Errorf("expected output to contain %q but got:\n%s", tc.wantMsgSubstr, out)
			}
		})
	}
}
