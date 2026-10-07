import { describe, expect, it, jest } from '@jest/globals'
import {
    RENDER_MAX_RESPONSE_BYTES,
    requestRecapCard,
} from './recapRenderClient'

type AnyFn = (...args: any[]) => any

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function jpegResponse(
    body: Uint8Array = JPEG,
    headers: Record<string, string> = {},
) {
    return new Response(body as BodyInit, {
        status: 200,
        headers: { 'content-type': 'image/jpeg', ...headers },
    })
}

const asFetch = (fn: AnyFn) => fn as unknown as typeof fetch

describe('requestRecapCard', () => {
    it('POSTs JSON to /render/recap and returns the JPEG', async () => {
        const fetchFn = jest.fn<AnyFn>().mockResolvedValue(jpegResponse())

        const out = await requestRecapCard(
            { schemaVersion: 1 },
            { fetch: asFetch(fetchFn), baseUrl: 'http://render:8080/' },
        )

        expect(out).toEqual({ ok: true, jpeg: Buffer.from(JPEG) })
        const [url, init] = fetchFn.mock.calls[0]
        expect(url).toBe('http://render:8080/render/recap')
        expect(init.method).toBe('POST')
        expect(init.headers).toEqual({ 'content-type': 'application/json' })
        expect(JSON.parse(init.body)).toEqual({ schemaVersion: 1 })
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('uses RENDER_URL, defaulting to the compose service name', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockImplementation(async () => jpegResponse())
        const prev = process.env.RENDER_URL
        try {
            delete process.env.RENDER_URL
            await requestRecapCard({}, { fetch: asFetch(fetchFn) })
            expect(fetchFn.mock.calls[0][0]).toBe(
                'http://render:8080/render/recap',
            )

            process.env.RENDER_URL = 'http://other:9000'
            await requestRecapCard({}, { fetch: asFetch(fetchFn) })
            expect(fetchFn.mock.calls[1][0]).toBe(
                'http://other:9000/render/recap',
            )
        } finally {
            if (prev === undefined) delete process.env.RENDER_URL
            else process.env.RENDER_URL = prev
        }
    })

    it('maps a timeout to timeout', async () => {
        const err = Object.assign(new Error('t'), { name: 'TimeoutError' })
        const fetchFn = jest.fn<AnyFn>().mockRejectedValue(err)
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'timeout',
            },
        )
    })

    it('really times out a hung sidecar', async () => {
        const fetchFn = jest.fn<AnyFn>(
            (_u: string, init: RequestInit) =>
                new Promise((_, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(init.signal?.reason),
                    )
                }),
        )
        expect(
            await requestRecapCard(
                {},
                { fetch: asFetch(fetchFn), timeoutMs: 20 },
            ),
        ).toEqual({ ok: false, reason: 'timeout' })
    })

    it('maps a connection failure to network', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockRejectedValue(new TypeError('fetch failed'))
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'network',
            },
        )
    })

    it.each([400, 422, 500, 503, 204])(
        'maps status %i to http_error',
        async (status) => {
            const fetchFn = jest
                .fn<AnyFn>()
                .mockResolvedValue(
                    new Response(status === 204 ? null : 'x', { status }),
                )
            expect(
                await requestRecapCard({}, { fetch: asFetch(fetchFn) }),
            ).toEqual({
                ok: false,
                reason: 'http_error',
            })
        },
    )

    it.each([
        ['png', { 'content-type': 'image/png' }],
        ['html', { 'content-type': 'text/html' }],
        ['no type', {}],
    ])('rejects a 200 with %s content-type', async (_, headers) => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(
                new Response(JPEG as BodyInit, { status: 200, headers }),
            )
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'bad_response',
            },
        )
    })

    it('rejects image/jpeg bytes that are not a JPEG', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(jpegResponse(Uint8Array.from([1, 2, 3, 4])))
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'bad_response',
            },
        )
    })

    it('rejects bytes with only a partial SOI marker', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(
                jpegResponse(Uint8Array.from([0xff, 0xd8, 0x00, 1])),
            )
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'bad_response',
            },
        )
    })

    it('rejects an empty body', async () => {
        const fetchFn = jest
            .fn<AnyFn>()
            .mockResolvedValue(jpegResponse(new Uint8Array(0)))
        expect(await requestRecapCard({}, { fetch: asFetch(fetchFn) })).toEqual(
            {
                ok: false,
                reason: 'bad_response',
            },
        )
    })

    it('rejects a body over 3 MB, streamed or declared', async () => {
        const big = new Uint8Array(RENDER_MAX_RESPONSE_BYTES + 1)
        big.set([0xff, 0xd8, 0xff])
        const streamed = jest.fn<AnyFn>().mockResolvedValue(jpegResponse(big))
        expect(
            await requestRecapCard({}, { fetch: asFetch(streamed) }),
        ).toEqual({
            ok: false,
            reason: 'bad_response',
        })

        const declared = jest.fn<AnyFn>().mockResolvedValue(
            jpegResponse(JPEG, {
                'content-length': String(RENDER_MAX_RESPONSE_BYTES + 1),
            }),
        )
        expect(
            await requestRecapCard({}, { fetch: asFetch(declared) }),
        ).toEqual({
            ok: false,
            reason: 'bad_response',
        })
    })

    it('accepts exactly 3 MB', async () => {
        const body = new Uint8Array(RENDER_MAX_RESPONSE_BYTES)
        body.set([0xff, 0xd8, 0xff])
        const fetchFn = jest.fn<AnyFn>().mockResolvedValue(jpegResponse(body))
        const out = await requestRecapCard({}, { fetch: asFetch(fetchFn) })
        expect(out.ok).toBe(true)
    })

    it.each([
        ['a non-200 status', { status: 500 }],
        [
            'a non-jpeg content-type',
            { headers: { 'content-type': 'image/png' } },
        ],
    ])('releases the body on %s without reading it', async (_, init) => {
        const response = new Response(new Uint8Array(8), init)
        const getReader = jest.spyOn(response.body!, 'getReader')
        const cancel = jest.spyOn(response.body!, 'cancel')
        const fetchFn = jest.fn<AnyFn>().mockResolvedValue(response)

        await requestRecapCard({}, { fetch: asFetch(fetchFn) })

        expect(getReader).not.toHaveBeenCalled()
        expect(cancel).toHaveBeenCalledTimes(1)
    })
})
