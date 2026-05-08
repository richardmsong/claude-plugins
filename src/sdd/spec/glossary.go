package spec

// Glossary holds the methodology's own glossary entries. Day-1 contents
// are the terms used by Day-1 invariant definitions.
var Glossary = []GlossaryEntry{
	{
		Term:       "registry entry",
		Definition: "A single record in the methodology's invariant registry, of type spec.Invariant.",
		ResolvesTo: "spec.Invariant",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "id",
		Definition: "The unique stable string identifier of a registry entry; the value of the spec.Invariant.ID field.",
		ResolvesTo: "spec.Invariant.ID",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "definition",
		Definition: "The one-line contract statement of a registry entry; the value of the spec.Invariant.Definition field.",
		ResolvesTo: "spec.Invariant.Definition",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "mechanism",
		Definition: "The verification mechanism category; the value of the spec.Invariant.Mechanism field; in the closed taxonomy declared by spec.Mechanism.",
		ResolvesTo: "spec.Invariant.Mechanism",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "verifier",
		Definition: "The reference to verifier code; the value of the spec.Invariant.Verifier field; format `path` or `path::FuncName`.",
		ResolvesTo: "spec.Invariant.Verifier",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "tier",
		Definition: "The change-ceremony tier; the value of the spec.Invariant.Tier field; in {draft, active}.",
		ResolvesTo: "spec.Invariant.Tier",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "status",
		Definition: "The lifecycle status; the value of the spec.Invariant.Status field; in {active, deprecated, superseded, withdrawn}.",
		ResolvesTo: "spec.Invariant.Status",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "ADR identifier",
		Definition: "A reference to an ADR file, of the form `adr-NNNN` or `adr-NNNN-<slug>`.",
		ResolvesTo: "string matching `^adr-[0-9]{4}(-[a-z0-9-]+)?$`",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "glossary entry",
		Definition: "A single record in the methodology's glossary, of type spec.GlossaryEntry.",
		ResolvesTo: "spec.GlossaryEntry",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "typed binding",
		Definition: "A reference to a real Go type or method by qualified name; resolvesTo target for glossary entries that anchor on the type system.",
		ResolvesTo: "string of form `package.Type` or `package.Type.Method`",
		Scope:      ScopeMethodology,
	},
	{
		Term:       "ADR delta block",
		Definition: "The `## Invariant Delta` section of an ADR markdown file, containing structured sub-sections (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On).",
		ResolvesTo: "spec.adr_parser.DeltaBlock",
		Scope:      ScopeMethodology,
	},
}
