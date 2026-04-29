## Audit: 2026-04-29T00:00:00Z

**Document:** src/sdd/docs/adr-0071-dist-as-installable-artifact.md

### Round 1

**Gaps found: 7**

1. **YAML parsing requires a Go module** — ADR says "no module needed" for `build.go`, but parsing YAML frontmatter requires `gopkg.in/yaml.v3` or similar. Standard library has no YAML parser. `go run` with external deps needs a `go.mod`.
2. **Stale reference to `build_templates.go`** — Decisions table "Stub → src body mapping" still references `build_templates.go` (old name). Should be `build.go`.
3. **Hooks are platform-divergent — no shared src body** — Claude has `blocked-commands-hook.sh`, `source-guard-hook.sh`, `workflow-reminder-hook.sh` + `hooks.json` with content; Factory has only `workflow-reminder-hook.sh` + empty `hooks.json`. The ADR says hooks are Go template stubs but doesn't address that Factory and Claude have different hook sets. Factory's stub tree would need different hooks than Claude's — there's no common src body to `{{ include }}` for hooks like `blocked-commands-hook.sh` that only exist for Claude.
4. **`local-setup` skill fate undocumented** — `src/sdd/skills/local-setup/` exists but has no corresponding stub in `claude/sdd/skills/` (Claude has `setup/` instead). `factory/sdd/skills/` has `local-setup/` but `claude/sdd/skills/` doesn't. The linter would flag this as an orphaned src file. ADR doesn't mention it.
5. **`setup` skill has no src body** — `claude/sdd/skills/setup/` and `factory/sdd/skills/setup/` exist, but there's no `src/sdd/skills/setup/`. The ADR scope section says setup follows the same pattern with `{{ include }}` from src, but the src file doesn't exist yet. Implementer needs to know: create it by extracting common content from the current platform-specific setup skills, or is it platform-only (no include)?
6. **Compiled artifacts contradict uniform stub rule** — ADR says "every file in dist/ has exactly one stub" but also says "compiled artifacts (docs-mcp.js, docs-dashboard.js, UI assets) are not stub-driven". This is a direct contradiction. Which rule wins?
7. **Impact section references `build_templates.go`** — Two component changes sections still reference `build_templates.go` instead of `build.go`: "Rendered into dist/ by build_templates.go" appears twice.

#### Fixes applied

| # | Gap | Cause | Resolution | Type |
|---|-----|-------|-----------|------|
| 1 | YAML parsing requires a Go module | ADR claimed "no module needed" but Go stdlib has no YAML parser; parsing frontmatter requires `gopkg.in/yaml.v3` which needs a `go.mod` | Changed decision to "requires `go.mod` for YAML dependency"; added `go.mod` and `go.sum` to directory layout; updated invocation to `cd src/sdd && go run build.go` | factual |
| 2 | Stale reference to `build_templates.go` in Decisions table | Left over from the rename to `build.go`; the "Stub → src body mapping" row still said `build_templates.go` | Updated to `build.go` | factual |
| 3 | Hooks are platform-divergent | ADR didn't address that Claude has 3 hook wrapper scripts + populated hooks.json while Factory has 1 wrapper + empty hooks.json; wrapper scripts use Claude-specific I/O protocol | User decided: hook wrappers ARE stubs (platform-specific Go template stubs); `hooks.json` is a stub; guards in `src/sdd/hooks/guards/` are the shared src content pulled in via `{{ include }}`; no need to eliminate wrappers — they're already the right shape | decision |
| 4 | `local-setup` skill fate undocumented | `src/sdd/skills/local-setup/` exists but has no stub in claude/sdd/; linter would flag it | User decided: delete `src/sdd/skills/local-setup/` — it's development-only and doesn't belong in dist/ | decision |
| 5 | `setup` skill has no src body | ADR says setup uses `{{ include }}` from `src/sdd/skills/setup/SKILL.md` but that file doesn't exist yet | Added explicit migration step: create `src/sdd/skills/setup/SKILL.md` by extracting common content from the two existing platform-specific setup skills | factual |
| 6 | Compiled artifacts contradict uniform stub rule | ADR said "every file has a stub" but also "compiled artifacts are not stub-driven" — direct contradiction | User decided: compiled artifacts also have stubs; build.go compiles them first, then stub templates them into dist/; updated the Compiled artifacts decision row and overview to remove the exception | decision |
| 7 | Stale `build_templates.go` in Component Changes | Two subsections still referenced old name after the rename to `build.go` | Updated both to `build.go` | factual |
