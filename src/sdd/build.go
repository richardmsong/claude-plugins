package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"text/template"

	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VersionInfo struct {
	Version     string `json:"version"`
	Description string `json:"description"`
	BuildHash   string `json:"_buildHash"`
}

type PlatformDir struct {
	Name string // "factory" or "claude"
	Path string // absolute path to <platform>/sdd/
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	lint := flag.Bool("lint", false, "validation mode: check all stubs")
	flag.Parse()

	// src/sdd/ is the working directory (invoked via: cd src/sdd && go run build.go)
	srcDir, err := os.Getwd()
	mustNil(err)
	repoRoot := filepath.Clean(filepath.Join(srcDir, "..", ".."))

	fmt.Println("=== SDD Plugin Build ===")
	fmt.Printf("  repo:  %s\n", repoRoot)
	fmt.Printf("  src:   %s\n", srcDir)

	// Read version.json
	vi := readVersionJSON(srcDir)

	// Discover platform directories
	platforms := discoverPlatforms(repoRoot, srcDir)
	fmt.Printf("  platforms: ")
	for i, p := range platforms {
		if i > 0 {
			fmt.Print(", ")
		}
		fmt.Print(p.Name)
	}
	fmt.Println()

	// Compute content hash (all src + platform stubs)
	hash := computeContentHash(repoRoot, srcDir, platforms)
	fmt.Printf("  content hash: %s\n", hash[:12])

	if *lint {
		fmt.Println("\n--- Lint mode ---")
		errors := 0
		for _, p := range platforms {
			errors += lintPlatform(p, srcDir)
		}
		errors += checkOrphanedSrcFiles(srcDir, platforms)
		if errors > 0 {
			fmt.Printf("\nLint FAILED: %d error(s)\n", errors)
			os.Exit(1)
		}
		fmt.Println("\nLint PASSED")
		return
	}

	// Auto-bump patch if hash changed
	if hash != vi.BuildHash {
		bumpPatch(&vi)
		vi.BuildHash = hash
		writeVersionJSON(srcDir, vi)
		fmt.Printf("  bumped to %s (hash: %s)\n", vi.Version, hash[:12])
	} else {
		fmt.Printf("  version: %s (no change)\n", vi.Version)
	}

	// Compile TypeScript artifacts via bun
	compiled := compileArtifacts(srcDir, repoRoot)

	// Render each platform
	for _, p := range platforms {
		fmt.Printf("\n--- Rendering %s ---\n", p.Name)
		renderPlatform(p, srcDir, vi, compiled)
	}

	// Validate critical output files
	fmt.Println("\n--- Validating ---")
	validateBuild(platforms)

	fmt.Println("\nBuild complete")
}

// ---------------------------------------------------------------------------
// Version JSON
// ---------------------------------------------------------------------------

func readVersionJSON(srcDir string) VersionInfo {
	data, err := os.ReadFile(filepath.Join(srcDir, "version.json"))
	mustNil(err)
	var vi VersionInfo
	mustNil(json.Unmarshal(data, &vi))
	return vi
}

func writeVersionJSON(srcDir string, vi VersionInfo) {
	data, err := json.MarshalIndent(vi, "", "  ")
	mustNil(err)
	data = append(data, '\n')
	mustNil(os.WriteFile(filepath.Join(srcDir, "version.json"), data, 0644))
}

func bumpPatch(vi *VersionInfo) {
	parts := strings.Split(vi.Version, ".")
	if len(parts) == 3 {
		patch := 0
		fmt.Sscanf(parts[2], "%d", &patch)
		parts[2] = fmt.Sprintf("%d", patch+1)
		vi.Version = strings.Join(parts, ".")
	}
}

// ---------------------------------------------------------------------------
// Platform discovery
// ---------------------------------------------------------------------------

func discoverPlatforms(repoRoot, srcDir string) []PlatformDir {
	entries, err := os.ReadDir(repoRoot)
	mustNil(err)
	var platforms []PlatformDir
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		sddDir := filepath.Join(repoRoot, e.Name(), "sdd")
		if sddDir == srcDir {
			continue // skip src/sdd itself
		}
		if _, err := os.Stat(sddDir); err != nil {
			continue
		}
		// Check for .factory-plugin/ or .claude-plugin/
		hasFactory := dirExists(filepath.Join(sddDir, ".factory-plugin"))
		hasClaude := dirExists(filepath.Join(sddDir, ".claude-plugin"))
		if hasFactory || hasClaude {
			platforms = append(platforms, PlatformDir{
				Name: e.Name(),
				Path: sddDir,
			})
		}
	}
	sort.Slice(platforms, func(i, j int) bool {
		return platforms[i].Name < platforms[j].Name
	})
	return platforms
}

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

func computeContentHash(repoRoot, srcDir string, platforms []PlatformDir) string {
	h := sha256.New()

	// Hash all files in src/sdd/ (excluding node_modules, .git, docs/)
	hashDir(h, srcDir, srcDir, true)

	// Hash all stub files in each platform dir (outside dist/)
	for _, p := range platforms {
		hashDir(h, p.Path, p.Path, false)
	}

	return hex.EncodeToString(h.Sum(nil))
}

func hashDir(h io.Writer, root, base string, isSrc bool) {
	filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(base, path)
		name := d.Name()

		if d.IsDir() {
			if shouldSkipDir(name, rel, isSrc) {
				return filepath.SkipDir
			}
			return nil
		}

		// Write relative path then content
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		io.WriteString(h, rel+"\n")
		h.Write(data)
		return nil
	})
}

// ---------------------------------------------------------------------------
// Compile artifacts
// ---------------------------------------------------------------------------

func compileArtifacts(srcDir, repoRoot string) map[string][]byte {
	compiled := make(map[string][]byte)

	// Install workspace dependencies
	fmt.Println("  Installing workspace dependencies...")
	runCmd(srcDir, "bun", "install")

	// Bundle docs-mcp
	fmt.Println("  Bundling docs-mcp...")
	mcpOut := filepath.Join(srcDir, "_compiled_docs-mcp.js")
	runCmd(srcDir, "bun", "build", "--target=bun",
		filepath.Join(srcDir, "docs-mcp/src/index.ts"),
		"--outfile", mcpOut)
	compiled["docs-mcp.js"] = mustReadFile(mcpOut)
	os.Remove(mcpOut)

	// Bundle docs-dashboard server
	fmt.Println("  Bundling docs-dashboard...")
	dashOut := filepath.Join(srcDir, "_compiled_docs-dashboard.js")
	runCmd(srcDir, "bun", "build", "--target=bun",
		filepath.Join(srcDir, "docs-dashboard/src/server.ts"),
		"--outfile", dashOut)
	compiled["docs-dashboard.js"] = mustReadFile(dashOut)
	os.Remove(dashOut)

	return compiled
}

// ---------------------------------------------------------------------------
// Render platform
// ---------------------------------------------------------------------------

func renderPlatform(p PlatformDir, srcDir string, vi VersionInfo, compiled map[string][]byte) {
	distDir := filepath.Join(p.Path, "dist")
	// Clean dist/ and recreate
	os.RemoveAll(distDir)
	mustNil(os.MkdirAll(distDir, 0755))

	filepath.WalkDir(p.Path, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(p.Path, path)
		name := d.Name()

		if d.IsDir() {
			if shouldSkipDir(name, rel, false) {
				return filepath.SkipDir
			}
			return nil
		}

		// Build template data context
		pluginRoot := "${DROID_PLUGIN_ROOT}"
		if p.Name == "claude" {
			pluginRoot = "${CLAUDE_PLUGIN_ROOT}"
		}
		data := map[string]interface{}{
			"Version":     vi.Version,
			"Description": vi.Description,
			"BuildHash":   vi.BuildHash,
			"Platform":    p.Name,
			"PluginRoot":  pluginRoot,
		}

		outPath := filepath.Join(distDir, rel)
		mustNil(os.MkdirAll(filepath.Dir(outPath), 0755))

		content := string(mustReadFile(path))

		if strings.HasSuffix(path, ".md") {
			renderMDStub(content, data, outPath, srcDir, compiled)
		} else {
			renderStub(content, data, outPath, rel, srcDir, compiled)
		}

		// Preserve executable bit
		if info, err := os.Stat(path); err == nil {
			if info.Mode()&0111 != 0 {
				os.Chmod(outPath, 0755)
			}
		}

		fmt.Printf("    %s\n", rel)
		return nil
	})
}

// renderMDStub processes a markdown stub: preserves frontmatter, renders body as template.
func renderMDStub(content string, data map[string]interface{}, outPath, srcDir string, compiled map[string][]byte) {
	fm, body := splitFrontmatter(content)

	// Parse frontmatter and merge into data
	if fm != "" {
		var fmData map[string]interface{}
		if err := yaml.Unmarshal([]byte(fm), &fmData); err == nil {
			for k, v := range fmData {
				data[k] = v
			}
		}
	}

	// Render body as Go template
	rendered := renderTemplate(body, data, srcDir, compiled)

	// Write frontmatter + rendered body
	var out strings.Builder
	if fm != "" {
		out.WriteString("---\n")
		out.WriteString(fm)
		if !strings.HasSuffix(fm, "\n") {
			out.WriteString("\n")
		}
		out.WriteString("---\n")
	}
	out.WriteString(rendered)

	mustNil(os.WriteFile(outPath, []byte(out.String()), 0644))
}

// renderStub processes a non-markdown stub: renders entire file as template.
func renderStub(content string, data map[string]interface{}, outPath, rel, srcDir string, compiled map[string][]byte) {
	rendered := renderTemplate(content, data, srcDir, compiled)
	mustNil(os.WriteFile(outPath, []byte(rendered), 0644))
}

// renderTemplate renders a string as a Go text/template with include support.
func renderTemplate(content string, data map[string]interface{}, srcDir string, compiled map[string][]byte) string {
	funcMap := template.FuncMap{
		"include": makeIncludeFunc(srcDir, data, compiled),
	}

	tmpl, err := template.New("stub").Funcs(funcMap).Parse(content)
	if err != nil {
		// If the stub itself fails to parse, return raw content
		// (shouldn't happen for valid stubs, but be defensive)
		return content
	}

	var buf strings.Builder
	if err := tmpl.Execute(&buf, data); err != nil {
		fmt.Fprintf(os.Stderr, "WARNING: template execution error: %v\n", err)
		return content
	}

	return buf.String()
}

// makeIncludeFunc returns a template function that reads src/sdd/<path> and renders it.
func makeIncludeFunc(srcDir string, data map[string]interface{}, compiled map[string][]byte) func(string) (string, error) {
	return func(path string) (string, error) {
		// Check compiled artifacts first
		if content, ok := compiled[path]; ok {
			return string(content), nil
		}

		// Read from src/sdd/<path>
		fullPath := filepath.Join(srcDir, path)
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return "", fmt.Errorf("include %q: %w", path, err)
		}

		raw := string(content)

		// Try to render as Go template; fall back to raw if it contains
		// non-Go-template {{ }} (e.g. JSX inline styles).
		funcMap := template.FuncMap{
			"include": makeIncludeFunc(srcDir, data, compiled),
		}
		tmpl, err := template.New(path).Funcs(funcMap).Parse(raw)
		if err != nil {
			return raw, nil
		}

		var buf strings.Builder
		if err := tmpl.Execute(&buf, data); err != nil {
			return raw, nil
		}

		return buf.String(), nil
	}
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

var fmRegex = regexp.MustCompile(`(?s)\A---\n(.*?)\n---\n(.*)`)

func splitFrontmatter(content string) (frontmatter string, body string) {
	m := fmRegex.FindStringSubmatch(content)
	if m == nil {
		return "", content
	}
	return m[1], m[2]
}

// ---------------------------------------------------------------------------
// Lint mode
// ---------------------------------------------------------------------------

var templateExprRegex = regexp.MustCompile(`\{\{`)

func lintPlatform(p PlatformDir, srcDir string) int {
	errors := 0

	filepath.WalkDir(p.Path, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			if d != nil && d.IsDir() {
				rel, _ := filepath.Rel(p.Path, path)
				if shouldSkipDir(d.Name(), rel, false) {
					return filepath.SkipDir
				}
			}
			return nil
		}

		rel, _ := filepath.Rel(p.Path, path)
		content := string(mustReadFile(path))

		// For .md files, lint only the body (after frontmatter)
		lintContent := content
		if strings.HasSuffix(path, ".md") {
			_, body := splitFrontmatter(content)
			lintContent = body
		}

		// Check 1: Must parse as a valid Go template
		funcMap := template.FuncMap{
			"include": func(s string) (string, error) { return "", nil },
		}
		_, parseErr := template.New(rel).Funcs(funcMap).Parse(lintContent)
		if parseErr != nil {
			fmt.Printf("  LINT ERROR [%s/%s]: invalid Go template: %v\n", p.Name, rel, parseErr)
			errors++
			return nil
		}

		// Check 2: Must contain at least one {{ }} expression
		if !templateExprRegex.MatchString(lintContent) {
			fmt.Printf("  LINT ERROR [%s/%s]: no {{ }} expression found\n", p.Name, rel)
			errors++
		}

		return nil
	})

	return errors
}

func checkOrphanedSrcFiles(srcDir string, platforms []PlatformDir) int {
	// Collect all include paths referenced in platform stubs
	includePaths := make(map[string]bool)
	includeRegex := regexp.MustCompile(`\{\{\s*include\s+"([^"]+)"\s*\}\}`)

	for _, p := range platforms {
		filepath.WalkDir(p.Path, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				if d != nil && d.IsDir() {
					rel, _ := filepath.Rel(p.Path, path)
					if shouldSkipDir(d.Name(), rel, false) {
						return filepath.SkipDir
					}
				}
				return nil
			}
			content := string(mustReadFile(path))
			for _, m := range includeRegex.FindAllStringSubmatch(content, -1) {
				includePaths[m[1]] = true
			}
			return nil
		})
	}

	// Walk src files and check for orphans
	errors := 0
	filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			if d != nil && d.IsDir() {
				name := d.Name()
				rel, _ := filepath.Rel(srcDir, path)
				if shouldSkipSrcForOrphan(name, rel) {
					return filepath.SkipDir
				}
			}
			return nil
		}

		rel, _ := filepath.Rel(srcDir, path)
		name := d.Name()

		// Skip excluded files
		if isExcludedSrcFile(name, rel) {
			return nil
		}

		if !includePaths[rel] {
			fmt.Printf("  LINT ERROR [orphan]: src/sdd/%s has no platform stub\n", rel)
			errors++
		}

		return nil
	})

	return errors
}

// ---------------------------------------------------------------------------
// Skip / exclude helpers
// ---------------------------------------------------------------------------

func shouldSkipDir(name, rel string, isSrc bool) bool {
	if name == "dist" || name == "node_modules" || name == ".git" {
		return true
	}
	// In src dir, also skip docs/ (ADRs, audits, etc.)
	if isSrc && (name == "docs" || name == "_compiled") {
		return true
	}
	return false
}

func shouldSkipSrcForOrphan(name, rel string) bool {
	if name == "node_modules" || name == ".git" || name == "docs" || name == "_compiled" {
		return true
	}
	if name == "tests" || name == "__tests__" {
		return true
	}
	// docs-mcp/ is compiled into docs-mcp.js — individual source files don't have stubs
	if name == "docs-mcp" {
		return true
	}
	return false
}

func isExcludedSrcFile(name, rel string) bool {
	excluded := map[string]bool{
		"build.go":     true,
		"go.mod":       true,
		"go.sum":       true,
		"version.json": true,
		"bun.lock":     true,
	}
	if excluded[name] {
		return true
	}
	if name == "package.json" {
		return true
	}
	if strings.HasPrefix(name, "tsconfig") && strings.HasSuffix(name, ".json") {
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func validateBuild(platforms []PlatformDir) {
	for _, p := range platforms {
		distDir := filepath.Join(p.Path, "dist")
		// Check that dist/ exists and has files
		entries, err := os.ReadDir(distDir)
		if err != nil {
			fmt.Printf("  FAIL: %s/dist/ does not exist\n", p.Name)
			continue
		}
		if len(entries) == 0 {
			fmt.Printf("  FAIL: %s/dist/ is empty\n", p.Name)
			continue
		}

		// Check critical files based on platform
		var criticals []string
		if p.Name == "factory" {
			criticals = []string{
				".factory-plugin/plugin.json",
				"mcp.json",
				"context.md",
				"droids/dev-harness.md",
				"docs-mcp.js",
				"docs-dashboard.js",
				"docs-dashboard/dashboard.sh",
				"hooks/guards/blocked-commands.sh",
			}
		} else if p.Name == "claude" {
			criticals = []string{
				".claude-plugin/plugin.json",
				".mcp.json",
				"context.md",
				"agents/dev-harness.md",
				"docs-mcp.js",
				"docs-dashboard.js",
				"docs-dashboard/dashboard.sh",
				"hooks/guards/blocked-commands.sh",
			}
		}

		for _, c := range criticals {
			path := filepath.Join(distDir, c)
			if _, err := os.Stat(path); err != nil {
				fmt.Printf("  FAIL: missing %s/dist/%s\n", p.Name, c)
			} else {
				fmt.Printf("  OK:   %s/dist/%s\n", p.Name, c)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func mustNil(err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}
}

func mustReadFile(path string) []byte {
	data, err := os.ReadFile(path)
	mustNil(err)
	return data
}

func runCmd(dir string, name string, args ...string) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %s %v failed: %v\n", name, args, err)
		os.Exit(1)
	}
}
