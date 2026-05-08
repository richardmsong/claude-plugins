package spec

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// DeltaBlock is the parsed contents of an `## Invariant Delta` section.
type DeltaBlock struct {
	ADRPath    string
	Added      []AddedEntry
	Modified   []ModifiedEntry
	Promoted   []PromotedEntry
	Deprecated []DeprecatedEntry
	Superseded []SupersededEntry
	Withdrawn  []WithdrawnEntry
}

type AddedEntry struct {
	ID         string
	Definition string
	Mechanism  string
	Verifier   string
	Tier       string
	Requires   []string
	Raw        string // raw text for debugging
}

type ModifiedEntry struct {
	ID            string
	RationaleClass string // "mechanical" | "sharpening"
	Raw           string
}

type PromotedEntry struct {
	ID       string
	FromTier string
	ToTier   string
	Raw      string
}

type DeprecatedEntry struct {
	ID     string
	Reason string
	Raw    string
}

type SupersededEntry struct {
	OldID     string
	NewID     string
	Rationale string
	Raw       string
}

type WithdrawnEntry struct {
	ID     string
	Reason string
	Raw    string
}

// ParseADRDeltaBlock reads an ADR markdown file and returns the parsed
// `## Invariant Delta` block. Returns nil, nil if the section doesn't exist.
func ParseADRDeltaBlock(adrPath string) (*DeltaBlock, error) {
	f, err := os.Open(adrPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var inDelta bool
	var currentSubblock string
	var subblockLines []string
	block := &DeltaBlock{ADRPath: adrPath}

	flushSubblock := func() error {
		if currentSubblock == "" {
			return nil
		}
		text := strings.TrimSpace(strings.Join(subblockLines, "\n"))
		if text == "" {
			return nil
		}
		return parseSubblock(block, currentSubblock, text)
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "## "):
			if inDelta {
				if err := flushSubblock(); err != nil {
					return nil, err
				}
				return block, nil
			}
			if strings.TrimSpace(strings.TrimPrefix(line, "## ")) == "Invariant Delta" {
				inDelta = true
			}
		case inDelta && strings.HasPrefix(line, "### "):
			if err := flushSubblock(); err != nil {
				return nil, err
			}
			currentSubblock = strings.TrimSpace(strings.TrimPrefix(line, "### "))
			subblockLines = nil
		case inDelta:
			subblockLines = append(subblockLines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if inDelta {
		if err := flushSubblock(); err != nil {
			return nil, err
		}
		return block, nil
	}
	return nil, nil
}

// parseSubblock dispatches to the appropriate sub-block parser based on
// the heading name.
func parseSubblock(block *DeltaBlock, kind, text string) error {
	switch kind {
	case "Added":
		return parseAddedEntries(block, text)
	case "Modified":
		return parseModifiedEntries(block, text)
	case "Promoted":
		return parsePromotedEntries(block, text)
	case "Deprecated":
		return parseDeprecatedEntries(block, text)
	case "Superseded":
		return parseSupersededEntries(block, text)
	case "Withdrawn":
		return parseWithdrawnEntries(block, text)
	case "Relies On":
		// Day 1: not parsed; reserved for the reactions-process ADR.
		return nil
	default:
		return fmt.Errorf("unknown sub-block kind %q in %s", kind, block.ADRPath)
	}
}

// Sub-block format: each entry begins with a bullet `- <id>` and is
// followed by indented `key: value` lines. We split on bullet headings.
var entryHeadRE = regexp.MustCompile(`(?m)^- ([a-z][a-z0-9_.]*)\s*$`)

func splitEntries(text string) [][]string {
	// Each entry is a bullet starting with `- <id>`. Find bullet line indices.
	lines := strings.Split(text, "\n")
	var groups [][]string
	var cur []string
	for _, line := range lines {
		if entryHeadRE.MatchString(strings.TrimSpace(line)) || strings.HasPrefix(line, "- ") {
			if cur != nil {
				groups = append(groups, cur)
			}
			cur = []string{line}
		} else if cur != nil {
			cur = append(cur, line)
		}
	}
	if cur != nil {
		groups = append(groups, cur)
	}
	return groups
}

func extractID(headLine string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(headLine), "- ")
	// May be just "id" or "id (something)" or "id - reason" etc.
	for _, sep := range []string{" ", "\t"} {
		if i := strings.Index(trimmed, sep); i > 0 {
			return strings.TrimRight(trimmed[:i], ":")
		}
	}
	return strings.TrimRight(trimmed, ":")
}

// fieldRE matches indented `key: value` lines.
var fieldRE = regexp.MustCompile(`^\s+([A-Za-z_]+):\s*(.*)$`)

func parseFields(group []string) map[string]string {
	fields := make(map[string]string)
	for _, line := range group[1:] {
		m := fieldRE.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		fields[m[1]] = strings.TrimSpace(m[2])
	}
	return fields
}

func parseAddedEntries(block *DeltaBlock, text string) error {
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		id := extractID(group[0])
		if id == "" {
			continue
		}
		fields := parseFields(group)
		entry := AddedEntry{
			ID:         id,
			Definition: fields["Definition"],
			Mechanism:  fields["Mechanism"],
			Verifier:   fields["Verifier"],
			Tier:       fields["Tier"],
			Raw:        strings.Join(group, "\n"),
		}
		if reqs, ok := fields["Requires"]; ok && reqs != "" && reqs != "[]" {
			entry.Requires = parseRequires(reqs)
		}
		block.Added = append(block.Added, entry)
	}
	return nil
}

func parseModifiedEntries(block *DeltaBlock, text string) error {
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		id := extractID(group[0])
		if id == "" {
			continue
		}
		fields := parseFields(group)
		entry := ModifiedEntry{
			ID:             id,
			RationaleClass: fields["Rationale_class"],
			Raw:            strings.Join(group, "\n"),
		}
		// Try alternate field name
		if entry.RationaleClass == "" {
			entry.RationaleClass = fields["Class"]
		}
		block.Modified = append(block.Modified, entry)
	}
	return nil
}

func parsePromotedEntries(block *DeltaBlock, text string) error {
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		id := extractID(group[0])
		if id == "" {
			continue
		}
		fields := parseFields(group)
		entry := PromotedEntry{
			ID:       id,
			FromTier: fields["From_tier"],
			ToTier:   fields["To_tier"],
			Raw:      strings.Join(group, "\n"),
		}
		block.Promoted = append(block.Promoted, entry)
	}
	return nil
}

func parseDeprecatedEntries(block *DeltaBlock, text string) error {
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		id := extractID(group[0])
		if id == "" {
			continue
		}
		fields := parseFields(group)
		entry := DeprecatedEntry{
			ID:     id,
			Reason: fields["Reason"],
			Raw:    strings.Join(group, "\n"),
		}
		block.Deprecated = append(block.Deprecated, entry)
	}
	return nil
}

func parseSupersededEntries(block *DeltaBlock, text string) error {
	// "old → new" or "old -> new" format
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		head := strings.TrimPrefix(strings.TrimSpace(group[0]), "- ")
		var oldID, newID string
		for _, sep := range []string{"→", "->"} {
			if parts := strings.SplitN(head, sep, 2); len(parts) == 2 {
				oldID = strings.TrimSpace(parts[0])
				newRaw := strings.TrimSpace(parts[1])
				// new might have trailing rationale after ":"
				if i := strings.Index(newRaw, ":"); i > 0 {
					newID = strings.TrimSpace(newRaw[:i])
				} else {
					newID = newRaw
				}
				break
			}
		}
		if oldID == "" {
			continue
		}
		fields := parseFields(group)
		entry := SupersededEntry{
			OldID:     oldID,
			NewID:     newID,
			Rationale: fields["Rationale"],
			Raw:       strings.Join(group, "\n"),
		}
		block.Superseded = append(block.Superseded, entry)
	}
	return nil
}

func parseWithdrawnEntries(block *DeltaBlock, text string) error {
	for _, group := range splitEntries(text) {
		if len(group) == 0 {
			continue
		}
		id := extractID(group[0])
		if id == "" {
			continue
		}
		fields := parseFields(group)
		entry := WithdrawnEntry{
			ID:     id,
			Reason: fields["Reason"],
			Raw:    strings.Join(group, "\n"),
		}
		block.Withdrawn = append(block.Withdrawn, entry)
	}
	return nil
}

var requiresRE = regexp.MustCompile(`[a-z][a-z0-9_.]*`)

func parseRequires(s string) []string {
	// Format: "[id1, id2, ...]" or "id1, id2"
	s = strings.Trim(s, "[]")
	if s == "" {
		return nil
	}
	matches := requiresRE.FindAllString(s, -1)
	return matches
}

// FindAllADRs returns paths to all docs/adr-*.md files relative to the repo root.
func FindAllADRs(docsDir string) ([]string, error) {
	pattern := filepath.Join(docsDir, "adr-*.md")
	return filepath.Glob(pattern)
}
