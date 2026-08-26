import { describe, expect, it } from '@jest/globals'
import { createHmac } from 'node:crypto'
import {
    parseSignatureHeader,
    verifyTopggSignature,
    SIGNATURE_TOLERANCE_SECONDS,
} from '../../../src/utils/topggSignature'

const SECRET = 'whs_test_secret_value'
const NOW = 1_800_000_000

const sign = (ts: number, body: string, secret = SECRET) =>
    createHmac('sha256', secret)
        .update(`${ts}.`)
        .update(Buffer.from(body))
        .digest('hex')

const headerFor = (ts: number, body: string, secret = SECRET) =>
    `t=${ts},v1=${sign(ts, body, secret)}`

describe('parseSignatureHeader', () => {
    it('parses the documented format', () => {
        expect(parseSignatureHeader('t=123,v1=abc123')).toEqual({
            timestamp: 123,
            signature: 'abc123',
        })
    })

    it('does not depend on part order', () => {
        expect(parseSignatureHeader('v1=abc,t=99')).toEqual({
            timestamp: 99,
            signature: 'abc',
        })
    })

    it('ignores unknown parts so top.gg can add v2 without breaking us', () => {
        expect(parseSignatureHeader('t=5,v1=ff,v2=deadbeef')).toEqual({
            timestamp: 5,
            signature: 'ff',
        })
    })

    it.each([
        ['t=abc,v1=ff'],
        ['t=5'],
        ['v1=ff'],
        [''],
        ['garbage'],
        ['t=5,v1=nothex!!'],
        ['t=-5,v1=ff'],
    ])('rejects malformed header %s', (h) => {
        expect(parseSignatureHeader(h)).toBeNull()
    })
})

describe('verifyTopggSignature', () => {
    const body = '{"type":"upvote","user":"123456789012345678"}'

    it('accepts a correctly signed request', () => {
        const r = verifyTopggSignature({
            header: headerFor(NOW, body),
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: true })
    })

    it('rejects a body altered after signing', () => {
        // The whole point: the signature covers the exact bytes.
        const r = verifyTopggSignature({
            header: headerFor(NOW, body),
            rawBody: Buffer.from(body.replace('upvote', 'test')),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('rejects a signature made with a different secret', () => {
        const r = verifyTopggSignature({
            header: headerFor(NOW, body, 'whs_wrong'),
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('rejects a replayed request past the tolerance', () => {
        const old = NOW - SIGNATURE_TOLERANCE_SECONDS - 1
        const r = verifyTopggSignature({
            header: headerFor(old, body),
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'stale-timestamp' })
    })

    it('accepts a request at the edge of the tolerance', () => {
        const edge = NOW - SIGNATURE_TOLERANCE_SECONDS
        const r = verifyTopggSignature({
            header: headerFor(edge, body),
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: true })
    })

    it('rejects a timestamp far in the future, not just a stale one', () => {
        // A future timestamp would otherwise extend the replay window forever.
        const future = NOW + SIGNATURE_TOLERANCE_SECONDS + 1
        const r = verifyTopggSignature({
            header: headerFor(future, body),
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'stale-timestamp' })
    })

    it('rejects a signature lifted onto a different timestamp', () => {
        const sig = sign(NOW, body)
        const r = verifyTopggSignature({
            header: `t=${NOW + 1},v1=${sig}`,
            rawBody: Buffer.from(body),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('reports a missing header distinctly', () => {
        expect(
            verifyTopggSignature({
                header: undefined,
                rawBody: Buffer.from(body),
                secret: SECRET,
                nowSeconds: NOW,
            }),
        ).toEqual({ ok: false, reason: 'missing-header' })
    })

    it('refuses when the raw body was not captured', () => {
        // Signing re-serialised JSON would accept anything; fail instead.
        expect(
            verifyTopggSignature({
                header: headerFor(NOW, body),
                rawBody: undefined,
                secret: SECRET,
                nowSeconds: NOW,
            }),
        ).toEqual({ ok: false, reason: 'malformed-header' })
    })

    it('rejects a truncated signature without throwing on length mismatch', () => {
        const sig = sign(NOW, body).slice(0, 10)
        expect(() =>
            verifyTopggSignature({
                header: `t=${NOW},v1=${sig}`,
                rawBody: Buffer.from(body),
                secret: SECRET,
                nowSeconds: NOW,
            }),
        ).not.toThrow()
        expect(
            verifyTopggSignature({
                header: `t=${NOW},v1=${sig}`,
                rawBody: Buffer.from(body),
                secret: SECRET,
                nowSeconds: NOW,
            }),
        ).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('preserves exact bytes, so key order and whitespace matter', () => {
        // Re-serialising req.body would produce different bytes and fail here.
        const reserialised = JSON.stringify(JSON.parse(body))
        const spaced = '{"type": "upvote", "user": "123456789012345678"}'
        expect(reserialised).not.toBe(spaced)
        const r = verifyTopggSignature({
            header: headerFor(NOW, spaced),
            rawBody: Buffer.from(reserialised),
            secret: SECRET,
            nowSeconds: NOW,
        })
        expect(r).toEqual({ ok: false, reason: 'bad-signature' })
    })
})
