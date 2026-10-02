import test from 'node:test'
import assert from 'node:assert/strict'
import { flattenKeys, diffKeySets } from './locale-parity-keys.mjs'

test('flattens nested objects into dotted keys', () => {
    assert.deepEqual(flattenKeys({ a: { b: 'x', c: { d: 'y' } }, e: 'z' }), [
        'a.b',
        'a.c.d',
        'e',
    ])
})

test('treats arrays as leaves', () => {
    assert.deepEqual(flattenKeys({ a: ['x', 'y'] }), ['a'])
})

test('reports keys missing from the other catalogue', () => {
    const { missing, extra } = diffKeySets(
        new Set(['a', 'b.c']),
        new Set(['a']),
    )
    assert.deepEqual(missing, ['b.c'])
    assert.deepEqual(extra, [])
})

test('reports keys that only exist in the other catalogue', () => {
    const { missing, extra } = diffKeySets(new Set(['a']), new Set(['a', 'z']))
    assert.deepEqual(missing, [])
    assert.deepEqual(extra, ['z'])
})

test('reports nothing when the key sets match', () => {
    assert.deepEqual(diffKeySets(new Set(['a']), new Set(['a'])), {
        missing: [],
        extra: [],
    })
})
