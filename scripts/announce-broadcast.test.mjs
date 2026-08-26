import test from 'node:test'
import assert from 'node:assert/strict'
import {
    classifyLedger,
    acquireSendLock,
    releaseSendLock,
    safeName,
} from './announce-broadcast.mjs'
import { rm } from 'node:fs/promises'

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

test('the send lock refuses a second concurrent run', async () => {
    // Two CONFIRM_SEND=yes processes would otherwise replay the same ledger and
    // post to the same channels.
    await rm('announce-broadcast.lock', { force: true })
    await acquireSendLock()
    await assert.rejects(
        () => acquireSendLock(),
        /another send appears to be running/,
    )
    await releaseSendLock()
    await acquireSendLock() // free again once released
    await releaseSendLock()
})

test('releasing a lock that is already gone does not throw', async () => {
    await rm('announce-broadcast.lock', { force: true })
    await assert.doesNotReject(() => releaseSendLock())
})

test('safeName strips ANSI escapes that would rewrite the reader terminal', () => {
    // A guild owner controls this string; the ledger is read with `cat`.
    const evil = 'Evil\u001b[2J\u001b[HGuild'
    const out = safeName(evil)
    assert.equal(out, 'Evil[2J[HGuild')
    assert.ok(!out.includes('\u001b'))
})

test('safeName removes newlines so one row cannot forge another', () => {
    const out = safeName('a\nb\rc')
    assert.equal(out, 'abc')
})

test('safeName bounds length past the Discord 100-char cap', () => {
    assert.equal(safeName('x'.repeat(500)).length, 100)
})

test('safeName tolerates a non-string', () => {
    assert.equal(safeName(undefined), '')
    assert.equal(safeName(null), '')
    assert.equal(safeName(42), '')
})

test('safeName leaves ordinary names untouched', () => {
    assert.equal(safeName('Servidor do Luk 🎵'), 'Servidor do Luk 🎵')
})

test('safeName strips bidi overrides that reorder the rest of the line', () => {
    // U+202E makes everything after it render right-to-left, so a guild owner
    // can make their name display as a different one in the audit files.
    const out = safeName('evil\u202Etxt.exe')

    assert.equal(out, 'eviltxt.exe')
    assert.ok(!out.includes('\u202E'))
})

test('safeName strips every invisible and format character it claims to', () => {
    // Each of these either reorders the rest of the rendered line or takes no
    // space at all, so a name carrying one can be made to look like another.
    const invisible = [
        '\u034F', // combining grapheme joiner
        '\u061C', // Arabic letter mark
        '\u200B', // zero width space
        '\u200D', // zero width joiner
        '\u200F', // right-to-left mark
        '\u202A', // left-to-right embedding
        '\u2060', // word joiner
        '\u2062', // invisible times
        '\u2066', // left-to-right isolate
        '\uFEFF', // zero width no-break space
    ]

    for (const char of invisible) {
        assert.equal(
            safeName(`a${char}b`),
            'ab',
            `failed to strip U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        )
    }
})

test('safeName leaves an ordinary name untouched', () => {
    assert.equal(safeName('Servidor Legal'), 'Servidor Legal')
})
