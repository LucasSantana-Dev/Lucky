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

3. Refresh GitHub token wiring from active `gh` auth:

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

4. Re-run MCP GitHub calls:

- list PRs
- list issues
- read issue details

5. If still failing, document as environment/server instability and use `gh` as operational fallback until fixed.

## Close criteria (`#224`)

- MCP GitHub list PRs works
- MCP GitHub list issues works
- MCP GitHub issue-read works
- Issue comment includes root cause and evidence
