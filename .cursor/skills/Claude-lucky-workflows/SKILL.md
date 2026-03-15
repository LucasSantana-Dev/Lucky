---
name: Claude-lucky-workflows
description: Use for Lucky Claude Code setup, plugin and command expectations, local versus host-local config split, and server-do-luk remote attach or recovery.
---

# Claude Code Lucky Workflows

Use this skill when the task involves Claude Code configuration, plugins, commands, skills, local verification, or remote attach for Lucky.

## Scope

- Repo-local Claude Code behavior in `Claude.jsonc`
- Repo-local plugins under `.Claude/plugins`
- Project skill bridge under `.Claude/skills`
- Host-local config in `~/.config/Claude/`
- Remote attach flow for `server-do-luk` (`luk-server@100.95.204.103` via Tailscale)

## Config Split

- Repo-local:
  - `Claude.jsonc`
  - `.Claude/plugins`
  - `.Claude/skills`
  - helper scripts under `scripts/Claude-*`
- Host-local:
  - `~/.config/Claude/`
  - provider auth and MCP credentials
  - host-only scripts and package cache
- Remote host-local:
  - `/home/luk-server/.config/Claude/`

Do not commit host-local auth, tokens, or MCP credentials.

## Expected Plugin and Command Behavior

- Repo-local plugins enforce Lucky policy, context bootstrap, and doc reminders.
- Dangerous shell/file actions must be blocked, not merely documented.
- Claude Code commands must mirror `.cursor/COMMANDS.md` (or equivalent):
  - `verify`
  - `e2e`
  - `db`

## Skill and MCP Expectations

- Prefer `.Claude/skills` as the project bridge for Claude Code.
- Keep host-local MCP/auth state out of git.
- Remote `server-do-luk` stays on the portable core MCP set:
  - `serena`
  - `context7`

## Validation Flow

Run this sequence after Claude Code changes:

```bash
./scripts/Claude-sync-project-skills.sh
./scripts/Claude-verify.sh
```

Useful direct checks:

```bash
# Check current config is valid
cat Claude.jsonc

# List available MCP servers
# (use Claude Code /mcp command in session)

# Check skills are linked
ls .Claude/skills/
```

## `server-do-luk` Attach

Attach through SSH via Tailscale:

```bash
ssh luk-server@100.95.204.103
```

Sync project skills before remote work if skills changed:

```bash
./scripts/Claude-sync-project-skills.sh
```

Install community plugins locally or on remote:

```bash
./scripts/Claude-install-community-plugins.sh
```

`scripts/Claude-attach-server-do-luk.sh` supports `Claude_REMOTE_DIR` when the remote session should target a remote worktree instead of `/home/luk-server/Lucky`.

## Auth Recovery

If the remote model auth is stale, re-authenticate via Claude Code on the remote host:

```bash
ssh luk-server@100.95.204.103
# then run Claude Code auth flow interactively
```

## Guardrails

- Prefer isolated worktrees for repo changes.
- Keep README and CHANGELOG aligned with shipped tooling behavior.
- Use exact failing commands and signatures when verification breaks.
- `env -i` workaround needed for git mutations in worktrees (husky `LUCKY_WORKTREE_ROOT` guard).
- Use `mcp_filesystem_edit_file` for worktree file edits (avoids shell guard).
