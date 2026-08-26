import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLedger } from './announce-broadcast.mjs'

const row = (id, status) => JSON.stringify({ id, status })

test('a sent guild is never retried', () => {
    const { sent, ambiguous } = classifyLedger([row('A', 'sent')])
    assert.deepEqual([...sent], ['A'])
    assert.equal(ambiguous.size, 0)
})

test('a failed guild is retried, so it is neither sent nor ambiguous', () => {
    const { sent, ambiguous } = classifyLedger([row('B', 'failed')])
    assert.equal(sent.size, 0)
    assert.equal(ambiguous.size, 0)
})

test('attempting with no terminal row is ambiguous, not retried', () => {
    // The crash window cubic flagged: Discord may have accepted the message.
    const { sent, ambiguous } = classifyLedger([row('C', 'attempting')])
    assert.equal(sent.size, 0)
    assert.deepEqual([...ambiguous], ['C'])
})

test('attempting followed by sent resolves to sent', () => {
    const { sent, ambiguous } = classifyLedger([
        row('D', 'attempting'),
        row('D', 'sent'),
    ])
    assert.deepEqual([...sent], ['D'])
    assert.equal(ambiguous.size, 0)
})

test('attempting followed by failed is retryable, not ambiguous', () => {
    const { sent, ambiguous } = classifyLedger([
        row('E', 'attempting'),
        row('E', 'failed'),
    ])
    assert.equal(sent.size, 0)
    assert.equal(ambiguous.size, 0)
})

test('a stale failed row cannot mask a later attempting (retry crash)', () => {
    // The bug cubic caught. Run 1 fails, run 2 retries and the POST lands but
    // the process dies before the terminal row. With terminal-wins the stale
    // `failed` won and the guild looked safe to retry, double-posting into a
    // server that had already received the announcement.
    const { sent, ambiguous } = classifyLedger([
        row('F', 'attempting'),
        row('F', 'failed'),
        row('F', 'attempting'),
    ])
    assert.equal(sent.size, 0)
    assert.deepEqual([...ambiguous], ['F'], 'must be ambiguous, never retried')
})

test('last row wins, so a re-send recorded after a failure counts as sent', () => {
    const { sent, ambiguous } = classifyLedger([
        row('G', 'attempting'),
        row('G', 'failed'),
        row('G', 'attempting'),
        row('G', 'sent'),
    ])
    assert.deepEqual([...sent], ['G'])
    assert.equal(ambiguous.size, 0)
})

test('a torn final line from a hard kill does not abort the parse', () => {
    const { sent } = classifyLedger([row('G', 'sent'), '{"id":"H","stat'])
    assert.deepEqual([...sent], ['G'])
})

test('an empty ledger means a first run', () => {
    const { sent, ambiguous } = classifyLedger([])
    assert.equal(sent.size, 0)
    assert.equal(ambiguous.size, 0)
})

test('mixed run: only untouched and failed guilds stay eligible', () => {
    const { sent, ambiguous } = classifyLedger([
        row('A', 'sent'),
        row('B', 'sent'),
        row('C', 'failed'),
        row('D', 'attempting'),
    ])
    const targets = ['A', 'B', 'C', 'D', 'E']
    const pending = targets.filter((id) => !sent.has(id) && !ambiguous.has(id))
    assert.deepEqual(pending, ['C', 'E'])
})
