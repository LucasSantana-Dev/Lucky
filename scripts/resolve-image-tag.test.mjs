import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const script = fileURLToPath(new URL('./deploy/resolve-image-tag.sh', import.meta.url))
const toPosix = (p) => p.split(String.fromCharCode(92)).join('/')

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

// Build a repo from [message, files] steps; returns short SHAs in order.
function makeRepo(steps) {
  const dir = mkdtempSync(join(tmpdir(), 'lucky-resolve-tag-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@example.com')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')
  const shas = steps.map(([msg, files]) => {
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), body)
    }
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', msg)
    return git(dir, 'rev-parse', 'HEAD')
  })
  return { dir, shas }
}

// IMAGE_TAG_EXISTS_CMD stub: succeeds when "<tag>" is listed in $HAVE.
function resolve(dir, sha, have, extraEnv = {}) {
  const stub = join(dir, '..', `exists-${process.pid}-${Math.random().toString(36).slice(2)}.sh`)
  writeFileSync(stub, '#!/bin/bash\ncase " $HAVE " in *" $2 "*) exit 0;; esac\nexit 1\n')
  chmodSync(stub, 0o755)
  try {
    const r = spawnSync(
      'bash',
      ['-c', `source "${toPosix(script)}"; resolve_image_tag "${toPosix(dir)}" "${sha}"`],
      {
        encoding: 'utf8',
        env: { ...process.env, IMAGE_TAG_EXISTS_CMD: toPosix(stub), HAVE: have.join(' '), ...extraEnv },
      },
    )
    return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
  } finally {
    rmSync(stub, { force: true })
  }
}

test('uses the commit tag when its images exist', () => {
  const { dir, shas } = makeRepo([
    ['a', { 'packages/x.ts': '1' }],
    ['b', { 'packages/x.ts': '2' }],
  ])
  try {
    const r = resolve(dir, shas[1], [shas[1].slice(0, 7)])
    assert.equal(r.status, 0)
    assert.equal(r.out, shas[1].slice(0, 7))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('falls back to the newest ancestor tag for an infra-only commit', () => {
  const { dir, shas } = makeRepo([
    ['image change', { 'packages/x.ts': '1' }],
    ['docs only', { 'docs/a.md': '1' }],
    ['compose only', { 'docker-compose.yml': '1' }],
  ])
  try {
    const r = resolve(dir, shas[2], [shas[0].slice(0, 7)])
    assert.equal(r.status, 0, r.err)
    assert.equal(r.out, shas[0].slice(0, 7))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fails when an image input changed since the newest tagged ancestor', () => {
  const { dir, shas } = makeRepo([
    ['tagged', { 'packages/x.ts': '1' }],
    ['untagged image change', { 'packages/x.ts': '2' }],
    ['docs only', { 'docs/a.md': '1' }],
  ])
  try {
    const r = resolve(dir, shas[2], [shas[0].slice(0, 7)])
    assert.equal(r.status, 1)
    assert.equal(r.out, '')
    assert.match(r.err, /image inputs changed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fails when no ancestor within the walk limit has images', () => {
  const { dir, shas } = makeRepo([
    ['a', { 'docs/a.md': '1' }],
    ['b', { 'docs/a.md': '2' }],
    ['c', { 'docs/a.md': '3' }],
  ])
  try {
    const r = resolve(dir, shas[2], [], { IMAGE_TAG_MAX_WALK: '2' })
    assert.equal(r.status, 1)
    assert.match(r.err, /no images/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fails for a commit missing from the checkout when it has no images', () => {
  const { dir } = makeRepo([['a', { 'docs/a.md': '1' }]])
  try {
    const r = resolve(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', [])
    assert.equal(r.status, 1)
    assert.match(r.err, /not in the checkout/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
