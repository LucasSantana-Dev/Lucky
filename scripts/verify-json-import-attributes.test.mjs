import test from 'node:test'
import assert from 'node:assert/strict'
import { findBareJsonImports } from './verify-json-import-attributes.mjs'

// Every case here is a bug this gate actually had. It shipped rejecting valid
// ESM twice in a row, which is worse than not having the gate: a check that
// fails correct code teaches people to ignore it.

const bare = (src) => findBareJsonImports(src).map((f) => f.specifier)

test('flags an import with no attribute', () => {
    assert.deepEqual(bare("import a from './x.json'\n"), ['./x.json'])
})

test('accepts the attribute on the same line', () => {
    assert.deepEqual(bare("import a from './x.json' with { type: 'json' }\n"), [])
})

test('accepts the attribute wrapped onto the next line', () => {
    // prettier is free to produce this shape.
    assert.deepEqual(bare("import a from './x.json'\n    with { type: 'json' }\n"), [])
})

test('accepts a multiline with-object, type on its own line', () => {
    // Regression: `type` was in the statement-end list for TS aliases, so the
    // window closed BEFORE the token it was looking for.
    assert.deepEqual(
        bare("import a from './x.json' with {\n    type: 'json',\n}\n"),
        [],
    )
    assert.deepEqual(
        bare("import a from './x.json' with {\n    type: 'json'\n}\n"),
        [],
    )
})

test('accepts an attribute object carrying other keys', () => {
    assert.deepEqual(
        bare("import a from './x.json' with { type: 'json', other: 1 }\n"),
        [],
    )
})

test('a later import’s attribute never satisfies an earlier bare one', () => {
    // The whole point of the gate. Without a statement boundary the window
    // leaks forward and reports zero violations here.
    assert.deepEqual(
        bare("import a from './x.json'\nimport b from './y.json' with { type: 'json' }\n"),
        ['./x.json'],
    )
})

test('a following type alias still ends the window', () => {
    assert.deepEqual(
        bare("import a from './x.json'\ntype Foo = string\n"),
        ['./x.json'],
    )
})

test('reports the line of the offending import', () => {
    const found = findBareJsonImports("const x = 1\n\nimport a from './x.json'\n")
    assert.equal(found.length, 1)
    assert.equal(found[0].line, 3)
})

test('ignores non-json imports', () => {
    assert.deepEqual(bare("import a from './x.ts'\nimport b from 'pkg'\n"), [])
})

test('attribute-shaped text in a later string does not satisfy a bare import', () => {
    // False NEGATIVE, the expensive direction: an earlier version scanned
    // forward to a "statement end", so an ordinary expression mentioning the
    // attribute could vouch for an import that Node would reject at boot.
    assert.deepEqual(
        bare(
            "import a from './x.json'\nlogger.debug(\"with { type: 'json' }\")\n",
        ),
        ['./x.json'],
    )
})

test('the attribute must follow the specifier, not appear later', () => {
    assert.deepEqual(
        bare("import a from './x.json'\nconst opts = with_ = { type: 'json' }\n"),
        ['./x.json'],
    )
})

test('flags a bare side-effect import', () => {
    // No `from` clause. Node rejects it exactly the same way.
    assert.deepEqual(bare("import './seed.json'\n"), ['./seed.json'])
})

test('accepts an attributed side-effect import', () => {
    assert.deepEqual(bare("import './seed.json' with { type: 'json' }\n"), [])
})

test('accepts a block comment between the specifier and the attribute', () => {
    assert.deepEqual(
        bare("import a from './x.json' /* keep */ with { type: 'json' }\n"),
        [],
    )
})

test('accepts a line comment between the specifier and the attribute', () => {
    // There is no `[no LineTerminator here]` before `with`, so this is valid
    // ESM. Rejecting it would fail correct code, the failure mode this gate
    // has already shipped twice.
    assert.deepEqual(
        bare("import a from './x.json' // keep\nwith { type: 'json' }\n"),
        [],
    )
})

test('accepts comments between `with` and its object', () => {
    assert.deepEqual(
        bare("import a from './x.json' with /* keep */ { type: 'json' }\n"),
        [],
    )
})

test('a comment-only gap never invents an attribute', () => {
    assert.deepEqual(bare("import a from './x.json' /* with */\n"), ['./x.json'])
})

test('pathological comment input still terminates', () => {
    // Regression: the old `\/\*[\s\S]*?\*\/` alternative backtracked
    // exponentially here. Completing at all is the assertion; a hang blows the
    // test timeout instead of failing an equality check.
    const evil = "import a from './x.json'" + '/*' + '*//*'.repeat(48)
    assert.deepEqual(bare(evil), ['./x.json'])
})

test('a `with` written inside a line comment never vouches for a bare import', () => {
    // False NEGATIVE, the expensive direction, and one the line-comment trivia
    // introduced: `[^\r\n]*` is greedy but backtracks, so it could give back
    // the comment body and expose the `with` written inside it.
    assert.deepEqual(
        bare("import a from './x.json' // with { type: 'json' }\n"),
        ['./x.json'],
    )
    assert.deepEqual(
        bare("import a from './x.json'\n// with { type: 'json' }\n"),
        ['./x.json'],
    )
})

test('a `with` inside a block comment never vouches either', () => {
    assert.deepEqual(
        bare("import a from './x.json' /* with { type: 'json' } */\n"),
        ['./x.json'],
    )
})
