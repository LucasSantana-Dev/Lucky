---
name: opencode-lucky-workflows
description: Use for Lucky OpenCode setup, plugin and command expectations, local versus host-local config split, and server-do-luk remote attach or recovery.
---

# OpenCode Lucky Workflows

Use this skill when the task involves OpenCode configuration, plugins, commands, skills, local verification, or `server-do-luk` remote attach for Lucky.

## Scope

- Repo-local OpenCode behavior in `opencode.jsonc`
- Repo-local plugins under `.opencode/plugins`
- Project skill bridge under `.opencode/skills`
- Host-local config in `~/.config/opencode/opencode.jsonc`
- Remote attach flow for `server-do-luk`

## Config Split

- Repo-local:
  - `opencode.jsonc`
  - `.opencode/plugins`
  - `.opencode/skills`
  - helper scripts under `scripts/opencode-*`
- Host-local:
  - `~/.config/opencode/opencode.jsonc`
  - provider auth and MCP credentials
  - host-only scripts and package cache
- Remote host-local:
  - `/home/luk-server/.config/opencode/opencode.jsonc`
  - `/home/luk-server/.local/bin/opencode-lucky-serve`

Do not commit host-local auth, tokens, or MCP credentials.

## Expected Plugin and Command Behavior

- Repo-local plugins enforce Lucky policy, context bootstrap, and doc reminders.
- Dangerous shell/file actions must be blocked, not merely documented.
- OpenCode commands must mirror `.cursor/COMMANDS.md`:
  - `verify`
  - `e2e`
  - `db`

## Skill and MCP Expectations

- Prefer `.opencode/skills` as the project bridge for OpenCode.
- Keep host-local MCP/auth state out of git.
- Remote `server-do-luk` stays on the portable core MCP set:
  - `serena`
  - `context7`

## Validation Flow

Run this sequence after OpenCode changes:

```bash
./scripts/opencode-sync-project-skills.sh
./scripts/opencode-verify.sh
./scripts/opencode-verify.sh --remote server-do-luk
```

Useful direct checks:

```bash
opencode debug config
opencode debug skill
opencode mcp list
opencode run --format json "Say only OK"
```

## `server-do-luk` Attach

- Sync global skills before attach when host-local skills changed:

```bash
./scripts/opencode-sync-server-do-luk-skills.sh
```

- Attach through SSH tunnel:

```bash
./scripts/opencode-attach-server-do-luk.sh
```

- Override the remote working directory when validating a remote worktree:

```bash
OPENCODE_REMOTE_DIR=/home/luk-server/Lucky/.worktrees/<branch> \
  ./scripts/opencode-attach-server-do-luk.sh
```

## Auth Recovery

If the remote model auth is stale:

```bash
ssh server-do-luk 'cd /home/luk-server/Lucky && ~/.opencode/bin/opencode providers login -p openai'
```

## Guardrails

- Prefer isolated worktrees for repo changes.
- Keep README and CHANGELOG aligned with shipped tooling behavior.
- Use exact failing commands and signatures when verification breaks.
