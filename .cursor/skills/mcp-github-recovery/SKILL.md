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

5. Refresh GitHub token wiring from active `gh` auth:

```bash
export GH_TOKEN_VALUE="$(gh auth token)"
python3 - <<'PY'
import os, pathlib, re
p = pathlib.Path.home()/'.codex'/'config.toml'
text = p.read_text()
token = os.environ['GH_TOKEN_VALUE']
text, n = re.subn(
    r'(?m)^(GITHUB_PERSONAL_ACCESS_TOKEN\\s*=\\s*\")[^\"]*(\"\\s*)$',
    r'\\1' + token + r'\\2',
    text,
)
if n != 1:
    raise SystemExit(f'Expected 1 token entry, found {n}')
p.write_text(text)
print('updated')
PY
```

6. Re-run MCP GitHub calls:

- list PRs
- list issues
- read issue details

7. If still failing, document as environment/server instability and use `gh` as operational fallback until fixed.

## Close criteria (`#224`)

- MCP GitHub list PRs works
- MCP GitHub list issues works
- MCP GitHub issue-read works
- Issue comment includes root cause and evidence
