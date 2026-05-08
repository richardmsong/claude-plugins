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
	ID              string
	Definition      string    // Contract; one-line; substantive changes route through Supersession.
	Comments        string    // Free-form annotations; advisory; freely editable.
	Mechanism       Mechanism
	Verifier        string    // Format: "path/to/file.go::TestName" or "path/to/rule.yaml".
	Requires        []string  // IDs of invariants this verifier presupposes (operational DAG).
	Supersedes      string    // ID of predecessor invariant this one replaces (optional).
	GlossaryTerms   []string  // Terms in Definition that need resolution.
	Status          Status    // active | withdrawn.
	ManualStability Stability // Optional upfront override; usually empty (computed).
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
	Term       string
	Definition string
	ResolvesTo string // typed binding (e.g. "spec.Invariant.ID"), invariant ID, or another glossary term.
	Scope      GlossaryScope
}

// IDPattern is the required regex for invariant IDs.
var IDPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`)
