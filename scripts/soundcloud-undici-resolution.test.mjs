import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

// soundcloud.ts passes `maxRedirections` to undici, which undici 7 rejects, so
// a root `undici` override that reaches it kills every SoundCloud API v2 call
// (#3248). The lockfile is the source of truth for what ships.
const lock = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
)

test('soundcloud.ts resolves an undici version inside its declared range', () => {
    const pkg = lock.packages['node_modules/soundcloud.ts']
    assert.ok(
        pkg,
        'soundcloud.ts is not in the lockfile, update or drop this test',
    )
    const declared = pkg.dependencies?.undici
    assert.ok(
        declared,
        'soundcloud.ts no longer depends on undici: drop the nested override in package.json and this test',
    )
    const resolved = (
        lock.packages['node_modules/soundcloud.ts/node_modules/undici'] ??
        lock.packages['node_modules/undici']
    ).version
    // Script tests are stdlib only, so the caret range is checked by hand. A
    // range in any other form fails here and needs this check updated.
    const caret = declared.match(/^\^([1-9]\d*)\.(\d+)\.(\d+)$/)
    assert.ok(caret, `unexpected undici range form: ${declared}`)
    const [major, minor, patch] = caret.slice(1).map(Number)
    const [rMajor, rMinor, rPatch] = resolved
        .match(/^(\d+)\.(\d+)\.(\d+)$/)
        .slice(1)
        .map(Number)
    assert.ok(
        rMajor === major &&
            (rMinor > minor || (rMinor === minor && rPatch >= patch)),
        `soundcloud.ts declares undici ${declared} but resolves ${resolved}`,
    )
})
