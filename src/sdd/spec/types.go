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

// Tier governs change ceremony.
type Tier string

const (
	TierDraft  Tier = "draft"
	TierActive Tier = "active"
)

func ValidTier(t Tier) bool { return t == TierDraft || t == TierActive }

// Status governs whether the verifier runs and how the registry handles the entry.
type Status string

const (
	StatusActive     Status = "active"
	StatusDeprecated Status = "deprecated"
	StatusSuperseded Status = "superseded"
	StatusWithdrawn  Status = "withdrawn"
)

func ValidStatus(s Status) bool {
	switch s {
	case StatusActive, StatusDeprecated, StatusSuperseded, StatusWithdrawn:
		return true
	}
	return false
}

// Invariant is a single registry entry.
type Invariant struct {
	ID            string
	Definition    string   // Contract; one-line; changes trigger Modified deltas.
	Comments      string   // Free-form annotations; advisory; freely editable.
	Mechanism     Mechanism
	Verifier      string   // Format: "path/to/file.go::TestName" or "path/to/rule.yaml".
	Requires      []string // IDs of invariants this verifier presupposes.
	GlossaryTerms []string // Terms in Definition that need resolution.
	Tier          Tier
	Status        Status
	IntroducedBy  string // ADR reference, e.g. "adr-0075".
	PromotedBy    string // Set when tier flips draft → active.
	SupersededBy  string // Set when status == superseded.
	Core          bool   // Computed; true if ≥3 ADRs rely on this.
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
