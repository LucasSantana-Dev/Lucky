---
name: mcp-github-recovery
description: Use when GitHub MCP calls fail with transport or auth errors while gh still works, and Lucky needs Codex or OpenCode GitHub automation restored.
---

# MCP GitHub Recovery (Lucky)

## When to use

- `github/*` MCP tools return `Transport closed`
- MCP GitHub requests fail while `gh` CLI still works
- Lucky workflow requires MCP-first issue/PR automation (`#224`)

## Recovery sequence

1. Verify failure signature:

```bash
gh issue list --limit 1 >/dev/null
```

Then run MCP GitHub list calls. If MCP fails but `gh` succeeds, continue.

2. Validate local Codex GitHub MCP config:

```bash
python3 - <<'PY'
import pathlib, tomllib
p = pathlib.Path.home()/'.codex'/'config.toml'
cfg = tomllib.loads(p.read_text())
s = cfg.get('mcp_servers', {}).get('github', {})
print('command=', s.get('command'))
print('args=', s.get('args'))
print('env_keys=', list((s.get('env') or {}).keys()))
PY
```

Expected steady state:

- `command=/Users/<user>/.codex/scripts/run-mcp-github.sh`
- no static `env_keys` for GitHub tokens

3. Verify config integrity for related MCP entries (`filesystem`, `fetch`, `playwright`):

```bash
python3 - <<'PY'
import pathlib, tomllib
p = pathlib.Path.home()/'.codex'/'config.toml'
cfg = tomllib.loads(p.read_text())
servers = cfg.get('mcp_servers', {})
for key in ('filesystem', 'fetch', 'playwright', 'github'):
    s = servers.get(key, {})
    print(f'[{key}] command=', s.get('command'))
    print(f'[{key}] args=', s.get('args'))
PY
```

Run focused checks for known break signatures:

```bash
python3 - <<'PY'
import pathlib, tomllib
p = pathlib.Path.home()/'.codex'/'config.toml'
cfg = tomllib.loads(p.read_text())
s = cfg.get('mcp_servers', {})
filesystem_args = s.get('filesystem', {}).get('args') or []
playwright_args = s.get('playwright', {}).get('args') or []
for arg in filesystem_args:
    if arg.startswith('/'):
        print('filesystem_path_exists', arg, pathlib.Path(arg).exists())
for arg in playwright_args:
    if arg.startswith('/'):
        print('playwright_path_exists', arg, pathlib.Path(arg).exists())
PY
```

If a configured path/package is invalid, fix or disable that entry before retrying GitHub MCP to avoid startup churn.

4. Detect legacy/deprecated GitHub MCP runtime:

```bash
~/.codex/scripts/run-mcp-github.sh --help 2>&1 | head
```

If the wrapper still launches `@modelcontextprotocol/server-github` or reports
server `version 0.6.2`, treat it as deprecated runtime drift.

5. Install the official GitHub MCP server binary:

```bash
mkdir -p "$HOME/.local/bin" "$HOME/.cache/github-mcp-server"
cd "$HOME/.cache/github-mcp-server"

asset="github-mcp-server_$(uname -s)_$(uname -m).tar.gz"
case "$(uname -sm)" in
  "Darwin arm64") asset="github-mcp-server_Darwin_arm64.tar.gz" ;;
  "Darwin x86_64") asset="github-mcp-server_Darwin_x86_64.tar.gz" ;;
  "Linux x86_64") asset="github-mcp-server_Linux_x86_64.tar.gz" ;;
  "Linux aarch64"|"Linux arm64") asset="github-mcp-server_Linux_arm64.tar.gz" ;;
esac

curl -fsSLO "https://github.com/github/github-mcp-server/releases/latest/download/$asset"
tar -xzf "$asset"
install -m 0755 github-mcp-server "$HOME/.local/bin/github-mcp-server"
```

6. Align Codex/OpenCode/Cursor wrappers to the official binary with `gh` token fallback:

```bash
mkdir -p "$HOME/.codex/scripts"
cat > "$HOME/.codex/scripts/run-mcp-github.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

binary="$HOME/.local/bin/github-mcp-server"
token=""
if command -v gh >/dev/null 2>&1; then
  token="$(gh auth token 2>/dev/null || true)"
fi
if [[ -z "$token" ]]; then
  token="${GITHUB_PERSONAL_ACCESS_TOKEN:-${GITHUB_TOKEN:-}}"
fi
if [[ -z "$token" ]]; then
  echo "GitHub auth is not available via gh or environment" >&2
  exit 1
fi

exec env \
  GITHUB_TOKEN="$token" \
  GITHUB_PERSONAL_ACCESS_TOKEN="$token" \
  "$binary" stdio --toolsets=default,actions,git "$@"
EOF
chmod +x "$HOME/.codex/scripts/run-mcp-github.sh"
```

Mirror the same wrapper logic into:

- `~/.config/opencode/scripts/run-mcp-github.sh`
- `~/.cursor/scripts/run-mcp-github.sh`

Create each parent `scripts/` directory before writing the mirrored wrapper.

7. Verify Codex sees the repaired server and can execute a GitHub MCP call:

```bash
codex mcp get github
codex exec --json --skip-git-repo-check -C /path/to/Lucky \
  "Using only the configured github MCP server, list one open issue in repository LucasSantana-Dev/Lucky and return only its number."
```

8. Verify OpenCode sees the repaired server and can execute a GitHub MCP call:

```bash
opencode mcp list
opencode run --format json \
  "Using only the configured github MCP server, list one open issue in repository LucasSantana-Dev/Lucky and return only its number."
```

9. Re-run MCP GitHub calls:

- list PRs
- list issues
- read issue details

10. If still failing, document as environment/server instability and use `gh` as operational fallback until fixed.

## Close criteria (`#224`)

- MCP GitHub list PRs works
- MCP GitHub list issues works
- MCP GitHub issue-read works
- Codex and OpenCode both pass a live GitHub MCP smoke call
- Issue comment includes root cause and evidence
