import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const repoRoot = new URL('..', import.meta.url)
const probeScript = new URL('./http-probe.sh', import.meta.url)

test('falls back to wget when curl is unavailable', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'lucky-http-probe-'))
  const binDir = join(tempDir, 'bin')

  try {
    mkdirSync(binDir)
    symlinkSync('/usr/bin/awk', join(binDir, 'awk'))
    symlinkSync('/bin/cat', join(binDir, 'cat'))
    symlinkSync('/usr/bin/mktemp', join(binDir, 'mktemp'))
    symlinkSync('/bin/rm', join(binDir, 'rm'))
    writeFileSync(
      join(binDir, 'wget'),
      `#!/bin/sh
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-O" ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
printf '{"status":"ok"}' > "$out"
printf '  HTTP/1.1 200 OK\\n' >&2
`,
      { mode: 0o755 },
    )

    const result = spawnSync('/bin/bash', [probeScript.pathname, 'http://example.test/health'], {
      cwd: repoRoot.pathname,
      env: {
        ...process.env,
        PATH: binDir,
      },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const [statusCode, ...bodyLines] = result.stdout.trim().split('\n')
    assert.equal(statusCode, '200')
    assert.equal(bodyLines.join('\n'), '{"status":"ok"}')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
