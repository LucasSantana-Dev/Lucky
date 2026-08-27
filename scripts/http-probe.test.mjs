import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

// `fileURLToPath`, not the URL's percent-encoded path property: a repo
// checked out under a directory containing a space yields
// `/Volumes/External%20HD/...`. That directory does not exist, spawn fails
// with ENOENT, and `status` comes back `null` instead of a non-zero exit,
// which reads as an assertion bug rather than a path bug. CI runners have
// no space in their checkout path, so CI would never have caught this.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const probeScript = fileURLToPath(new URL('./http-probe.sh', import.meta.url))

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

    const result = spawnSync('/bin/bash', [probeScript, 'http://example.test/health'], {
      cwd: repoRoot,
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
