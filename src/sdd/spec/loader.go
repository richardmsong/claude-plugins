package spec

import (
	_ "embed"
	"fmt"

	"gopkg.in/yaml.v3"
)

// Day-1 registry and glossary live as YAML files alongside the package.
// The Go-side Invariant / GlossaryEntry types are the parsed shape;
// the YAML files are the source of truth.

//go:embed registry.yaml
var registryYAML []byte

//go:embed glossary.yaml
var glossaryYAML []byte

// Registry is the parsed methodology invariant registry.
// Loaded at package init from registry.yaml.
var Registry []Invariant

// Glossary is the parsed methodology glossary.
// Loaded at package init from glossary.yaml.
var Glossary []GlossaryEntry

func init() {
	if err := yaml.Unmarshal(registryYAML, &Registry); err != nil {
		panic(fmt.Sprintf("spec: parse registry.yaml: %v", err))
	}
	if err := yaml.Unmarshal(glossaryYAML, &Glossary); err != nil {
		panic(fmt.Sprintf("spec: parse glossary.yaml: %v", err))
	}
}

// CitationCount returns the number of registry entries that list `id` in their Requires field.
//
// This is the operational metric that drives the computed Stability for the invariant.
func CitationCount(id string) int {
	count := 0
	for _, inv := range Registry {
		for _, req := range inv.Requires {
			if req == id {
				count++
				break
			}
		}
	}
	return count
}

// StabilityOf returns the computed stability of the invariant with the given ID.
//
//   - manual override (when set) wins
//   - else: 0 → uncited, 1-2 → stable, ≥3 → core
func StabilityOf(id string) Stability {
	for _, inv := range Registry {
		if inv.ID != id {
			continue
		}
		if inv.ManualStability != "" {
			return inv.ManualStability
		}
		break
	}
	switch n := CitationCount(id); {
	case n == 0:
		return StabilityUncited
	case n <= 2:
		return StabilityStable
	default:
		return StabilityCore
	}
}

// SupersededBy returns the ID of the registry entry that supersedes the given ID,
// computed by reverse lookup over the Supersedes field. Returns empty string if
// the given ID is not superseded by anything.
func SupersededBy(id string) string {
	for _, inv := range Registry {
		if inv.Supersedes == id {
			return inv.ID
		}
	}
	return ""
}

// ValidManualStability returns true iff the value is a legal manual override
// (subset of Stability that excludes "uncited" — uncited is the default
// computed state, never a manual declaration).
func ValidManualStability(s Stability) bool {
	if s == "" {
		return true // unset is fine
	}
	return s == StabilityStable || s == StabilityCore
}
