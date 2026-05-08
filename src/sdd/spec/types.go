// Package spec defines the methodology's own invariant registry types,
// the registry contents, the glossary, and parsers used by verifiers.
package spec

import "regexp"

// Mechanism is the closed taxonomy of verification mechanisms.
type Mechanism string

const (
	MechUnit         Mechanism = "unit"
	MechTable        Mechanism = "table"
	MechProperty     Mechanism = "property"
	MechArch         Mechanism = "arch"
	MechAST          Mechanism = "ast"
	MechType         Mechanism = "type"
	MechSchema       Mechanism = "schema"
	MechCompleteness Mechanism = "completeness"
	MechIntegration  Mechanism = "integration"
	MechJourney      Mechanism = "journey"
)

func ValidMechanism(m Mechanism) bool {
	switch m {
	case MechUnit, MechTable, MechProperty, MechArch, MechAST,
		MechType, MechSchema, MechCompleteness, MechIntegration, MechJourney:
		return true
	}
	return false
}

// Status is the two-state lifecycle: invariant is either active or withdrawn.
// Supersession is encoded via the Supersedes field (forward) or computed via
// reverse lookup (i.e., another invariant naming this one as its predecessor).
type Status string

const (
	StatusActive    Status = "active"
	StatusWithdrawn Status = "withdrawn"
)

func ValidStatus(s Status) bool { return s == StatusActive || s == StatusWithdrawn }

// Stability is the computed governance level, derived from citation count.
// It's not stored on the invariant; it's a query result.
type Stability string

const (
	StabilityUncited Stability = "uncited" // citation_count == 0
	StabilityStable  Stability = "stable"  // citation_count 1–2
	StabilityCore    Stability = "core"    // citation_count ≥ 3 OR manual_stability override
)

// Invariant is a single registry entry.
type Invariant struct {
	ID              string    `yaml:"id"`
	Definition      string    `yaml:"definition"`
	Comments        string    `yaml:"comments,omitempty"`
	Mechanism       Mechanism `yaml:"mechanism"`
	Verifier        string    `yaml:"verifier"`
	Requires        []string  `yaml:"requires,omitempty"`
	Supersedes      string    `yaml:"supersedes,omitempty"`
	GlossaryTerms   []string  `yaml:"glossary_terms,omitempty"`
	Status          Status    `yaml:"status"`
	ManualStability Stability `yaml:"manual_stability,omitempty"`
}

// GlossaryScope is the closed enum for glossary entry scope.
type GlossaryScope string

const (
	ScopeMethodology       GlossaryScope = "methodology"
	ScopeProjectCrossCut   GlossaryScope = "project-cross-cutting"
	ScopeComponentLocal    GlossaryScope = "component-local"
)

func ValidScope(s GlossaryScope) bool {
	switch s {
	case ScopeMethodology, ScopeProjectCrossCut, ScopeComponentLocal:
		return true
	}
	return false
}

// GlossaryEntry is a single glossary entry.
type GlossaryEntry struct {
	Term       string        `yaml:"term"`
	Definition string        `yaml:"definition"`
	ResolvesTo string        `yaml:"resolves_to"`
	Scope      GlossaryScope `yaml:"scope"`
}

// IDPattern is the required regex for invariant IDs.
var IDPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`)
