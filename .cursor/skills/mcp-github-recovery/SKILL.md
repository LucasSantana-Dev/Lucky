---
name: mcp-github-recovery
description: Use when user-GitHub MCP tools fail with transport/auth errors and Lucky needs MCP-first GitHub operations restored.
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

4. Detect legacy/deprecated GitHub MCP server behavior (line-delimited JSON only):

```bash
node - <<'NODE'
const {spawn}=require('child_process')
const cp=spawn('npx',['-y','@modelcontextprotocol/server-github'],{stdio:['pipe','pipe','pipe']})
cp.stderr.on('data',d=>process.stderr.write(d))
cp.stdout.on('data',d=>process.stdout.write(d))
const framed={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'probe',version:'1'}}}
const bytes=Buffer.from(JSON.stringify(framed))
cp.stdin.write(Buffer.from(`Content-Length: ${bytes.length}\\r\\n\\r\\n`))
cp.stdin.write(bytes)
setTimeout(()=>cp.kill('SIGTERM'),3000)
NODE
```

If framed initialize returns no payload but newline JSON initialize does, treat it as protocol incompatibility and use `gh` fallback evidence while you switch to a compatible GitHub MCP server/runtime.

5. Align Codex GitHub MCP with wrapper-based runtime auth (same model used by OpenCode):

```bash
mkdir -p "$HOME/.codex/scripts"
cat > "$HOME/.codex/scripts/run-mcp-github.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

token="$(gh auth token)"
if [[ -z "$token" ]]; then
  echo "GitHub CLI is not authenticated" >&2
  exit 1
fi

exec env \
  GITHUB_TOKEN="$token" \
  GITHUB_PERSONAL_ACCESS_TOKEN="$token" \
  npx -y @modelcontextprotocol/server-github
EOF
chmod +x "$HOME/.codex/scripts/run-mcp-github.sh"

python3 - <<'PY'
from pathlib import Path
import re
p = Path.home()/'.codex'/'config.toml'
text = p.read_text()
text, n = re.subn(
    r'(?ms)^\[mcp_servers\.github\]\ncommand = "[^"]+"\nargs = \[[^\]]*\]\n(?:\n\[mcp_servers\.github\.env\]\n(?:[^\n]*\n)+?)?(?=\n\[|\Z)',
    '[mcp_servers.github]\ncommand = "/Users/lucassantana/.codex/scripts/run-mcp-github.sh"\n',
    text,
    count=1,
)
if n != 1:
    raise SystemExit(f'Expected 1 github block, replaced {n}')
p.write_text(text)
print('updated', p)
PY
```

6. Verify Codex sees the repaired server and can execute a GitHub MCP call:

```bash
codex mcp get github
codex exec --json --skip-git-repo-check -C /path/to/Lucky \
  "Using only the configured github MCP server, list one open issue in repository LucasSantana-Dev/Lucky and return only its number."
```

7. Re-run MCP GitHub calls:

- list PRs
- list issues
- read issue details

8. If still failing, document as environment/server instability and use `gh` as operational fallback until fixed.

## Close criteria (`#224`)

- MCP GitHub list PRs works
- MCP GitHub list issues works
- MCP GitHub issue-read works
- Issue comment includes root cause and evidence
