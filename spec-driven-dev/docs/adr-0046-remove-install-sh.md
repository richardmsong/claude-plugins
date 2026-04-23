# ADR: Remove install.sh

**Status**: implemented
**Status history**:
- 2026-04-23: accepted
- 2026-04-23: implemented — install.sh deleted, references removed

## Overview

Delete `install.sh` from the repository. The plugin system handles installation; the setup skill (`/setup`) handles in-session configuration. A standalone installer that assumes users have the repo cloned locally and `bun` installed adds confusion without covering a real use case.

## Motivation

ADR-0043 introduced `install.sh` as a standalone installation path for non-plugin users. In practice, this creates friction: users need the plugin repo checked out locally and `bun` installed just to run setup. The plugin system already handles installation without these prerequisites. The `/setup` skill provides the same configuration steps within an active session. `install.sh` is redundant.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Remove install.sh | Delete entirely | Plugin system + /setup skill cover both installation paths. No user should need to run a shell script from a cloned repo. |
| ADR-0043 | Leave as-is (historical) | ADR content is immutable. This ADR supersedes the install.sh decisions in ADR-0043. |
| Setup SKILL.md | Remove install.sh reference | The "Or via the standalone installer" usage line is no longer valid. |

> Supersedes install.sh decisions in ADR-0043.

## Impact

- `install.sh` — deleted
- `skills/setup/SKILL.md` — remove install.sh reference from Usage section

## Scope

**In scope:** Delete install.sh, clean up references in setup SKILL.md.
**Out of scope:** No changes to the setup skill's actual behavior — it still does everything install.sh did, just within a Claude session.
