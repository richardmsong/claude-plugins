# Conventions: Repo Structure for Spec-Driven Development

This document describes the expected repository layout for projects using the `spec-driven-dev` plugin. The plugin's skills, agents, and docs MCP server rely on these conventions to discover and index project documentation.

## ADR Naming

Architecture Decision Records live at the root of `docs/`:

```
docs/adr-NNNN-slug.md
```

- **Location**: Always `docs/` root. Never nested in subdirectories.
- **Counter**: Zero-padded 4-digit number (e.g. `adr-0001`, `adr-0026`).
- **Slug**: Lowercase kebab-case summary (e.g. `portable-dev-workflow-plugin`).
- **Example**: `docs/adr-0026-portable-dev-workflow-plugin.md`

ADRs follow a lifecycle tracked by a `**Status**` line near the top of the file:

```markdown
# ADR: Title Here

**Status**: accepted
**Status history**:
- 2026-04-20: draft
- 2026-04-21: accepted
```

Valid statuses: `draft`, `accepted`, `implemented`, `superseded`, `withdrawn`.

## Spec Naming

Spec files describe the current design of a component or cross-cutting concern:

```
docs/spec-<topic>.md              # cross-cutting (at docs/ root)
docs/<component>/spec-<topic>.md  # component-local (in a subdirectory)
```

- **Cross-cutting specs** live at `docs/` root: `docs/spec-state-schema.md`
- **Component-local specs** live in a subdirectory named after the component: `docs/mclaude-web/spec-ui.md`
- **Prefix**: Always `spec-`.
- The docs MCP classifies any file with a `spec-` basename prefix as category `spec`.

## `.agent/` Directory

The `.agent/` directory at the repo root holds runtime state for the plugin and its workflows:

```
.agent/
  .docs-index.db       # SQLite FTS5 index (runtime, gitignored)
  blocked-commands.json # hook config — committed
  master-config.json   # master/agent separation config — committed
  audits/              # design-audit, spec-evaluator, and implementation-evaluator output
  bugs/                # bug reports filed by /file-bug
```

- `.docs-index.db` is created automatically by the docs MCP server. Add it to `.gitignore`.
- `blocked-commands.json` and `master-config.json` are created by `/spec-driven-dev:setup` and should be committed.
- `audits/` and `bugs/` contain markdown files produced by skills. Commit or gitignore per preference.

## CLAUDE.md

The project's `CLAUDE.md` file (at the repo root) provides project-specific context that the plugin's skills use at runtime.

### SDD-managed section

The setup skill injects a marker-delimited block containing the core SDD workflow rules:

```markdown
<!-- sdd:begin -->
# Project Rules
...workflow rules injected by /setup...
<!-- sdd:end -->
```

- **On first run**: setup creates CLAUDE.md with the SDD section.
- **On re-run**: setup replaces everything between `<!-- sdd:begin -->` and `<!-- sdd:end -->` with the latest version of the workflow rules. Content outside the markers is preserved.
- The markers are HTML comments — invisible in rendered markdown.

### Project-specific content

Content outside the SDD markers is user-owned. Useful additions include:

- **Component list**: A list of components in the project, so skills like `/feature-change` and `/implementation-evaluator` can discover what to audit.
- **Project-specific rules**: CI constraints, deployment targets, DNS conventions, etc.
- **Workflow overrides**: Any project-specific deviations from the default spec-driven workflow.

Place project-specific content **after** the `<!-- sdd:end -->` marker.
