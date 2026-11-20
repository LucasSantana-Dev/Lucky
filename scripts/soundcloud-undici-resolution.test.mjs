import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

// soundcloud.ts passes `maxRedirections` to undici, which undici 7 rejects, so
// a root `undici` override that reaches it kills every SoundCloud API v2 call
// (#3248). The lockfile is the source of truth for what ships.
const lock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
)

test('soundcloud.ts resolves an undici major inside its declared range', () => {
  const pkg = lock.packages['node_modules/soundcloud.ts']
  assert.ok(pkg, 'soundcloud.ts is not in the lockfile, update or drop this test')
  const declared = pkg.dependencies?.undici
  assert.ok(
    declared,
    'soundcloud.ts no longer depends on undici: drop the nested override in package.json and this test',
  )
  const resolved = (
    lock.packages['node_modules/soundcloud.ts/node_modules/undici'] ??
    lock.packages['node_modules/undici']
  ).version
  const major = (v) => v.match(/\d+/)[0]
  assert.equal(
    major(resolved),
    major(declared),
    `soundcloud.ts declares undici ${declared} but resolves ${resolved}`,
  )
})
