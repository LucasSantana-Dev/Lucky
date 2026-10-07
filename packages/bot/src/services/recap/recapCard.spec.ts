import { describe, expect, it, jest } from '@jest/globals'

type AnyFn = (...args: any[]) => any
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const debugLogMock = jest.fn<AnyFn>()
jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...a: unknown[]) => debugLogMock(...a),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))
jest.mock('@lucky/shared/services', () => ({
    getRecapCardTracks: jest.fn(),
}))

import { buildRecapCardPayload, renderRecapCard } from './recapCard'

const asFetch = (fn: AnyFn) => fn as unknown as typeof fetch

const recap = {
    schemaVersion: 1 as const,
    guildId: 'g-1',
    from: '2026-10-04T18:00:00.000Z',
    to: '2026-10-11T18:00:00.000Z',
    plays: 12,
    skips: 2,
    autoplayPlays: 3,
    listenedSeconds: 4000,
    topTracks: [{ title: 'Embed Song', author: 'Embed Artist', plays: 4 }],
    topArtists: [{ name: 'Artist​ A', plays: 6 }],
}

const cardTracks = [
    {
        title: 'Song A',
        author: 'Artist A',
        plays: 4,
        thumbnail: 'https://i.scdn.co/image/a',
    },
    { title: 'Song​ B', author: 'X'.repeat(500), plays: 2, thumbnail: null },
    {
        title: 'Song C',
        author: 'Artist C',
        plays: 1,
        thumbnail: 'https://evil.example/c.jpg',
    },
]

function coverFetch() {
    return jest.fn<AnyFn>(async (url: string) => {
        if (String(url).startsWith('https://i.scdn.co/')) {
            return new Response(
                Uint8Array.from([0xff, 0xd8, 0xff, 9]) as BodyInit,
                {
                    headers: { 'content-type': 'image/jpeg' },
                },
            )
        }
        throw new Error('unexpected fetch ' + url)
    })
}

describe('buildRecapCardPayload', () => {
    it('adds covers only where a safe thumbnail exists and sanitizes text', async () => {
        const payload = await buildRecapCardPayload(recap, {
            fetch: asFetch(coverFetch()),
            getCardTracks: jest.fn<AnyFn>().mockResolvedValue(cardTracks),
        })

        expect(payload.topTracks[0]).toEqual({
            title: 'Song A',
            author: 'Artist A',
            plays: 4,
            cover: Buffer.from([0xff, 0xd8, 0xff, 9]).toString('base64'),
        })
        expect(payload.topTracks[1].title).toBe('Song B')
        expect(Array.from(payload.topTracks[1].author)).toHaveLength(200)
        expect(payload.topTracks[1]).not.toHaveProperty('cover')
        expect(payload.topTracks[2]).not.toHaveProperty('cover')
        expect(payload.topArtists).toEqual([{ name: 'Artist A', plays: 6 }])
    })

    it('logs only counts of dropped covers', async () => {
        debugLogMock.mockClear()
        await buildRecapCardPayload(recap, {
            fetch: asFetch(coverFetch()),
            getCardTracks: jest.fn<AnyFn>().mockResolvedValue(cardTracks),
        })

        // 2 thumbnails wanted (one is off-allowlist), 1 cover obtained.
        expect(debugLogMock).toHaveBeenCalledWith({
            message: 'recap card: covers fetched',
            data: { guildId: 'g-1', wanted: 2, got: 1, dropped: 1 },
        })
    })

    it('keeps the worst-case request under 2.5 MB', async () => {
        const big = Uint8Array.from({ length: 64 * 1024 }, (_, i) =>
            i < 3 ? [0xff, 0xd8, 0xff][i] : 7,
        )
        const fetchFn = jest.fn<AnyFn>(
            async () =>
                new Response(big as BodyInit, {
                    headers: { 'content-type': 'image/jpeg' },
                }),
        )
        const tracks = Array.from({ length: 25 }, (_, i) => ({
            title: '😀'.repeat(300),
            author: '😀'.repeat(300),
            plays: 1000 - i,
            thumbnail: `https://i.scdn.co/image/${i}`,
        }))
        const payload = await buildRecapCardPayload(
            {
                ...recap,
                topArtists: Array.from({ length: 5 }, () => ({
                    name: '😀'.repeat(300),
                    plays: 9,
                })),
            },
            {
                fetch: asFetch(fetchFn),
                getCardTracks: jest.fn<AnyFn>().mockResolvedValue(tracks),
            },
        )

        expect(payload.topTracks.every((t) => t.cover)).toBe(true)
        expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(
            2.5 * 1024 * 1024,
        )
    })

    it('falls back to the embed list without covers when the track query fails', async () => {
        const fetchFn = coverFetch()
        const payload = await buildRecapCardPayload(recap, {
            fetch: asFetch(fetchFn),
            getCardTracks: jest.fn<AnyFn>().mockRejectedValue(new Error('db')),
        })

        expect(payload.topTracks).toEqual([
            { title: 'Embed Song', author: 'Embed Artist', plays: 4 },
        ])
        expect(fetchFn).not.toHaveBeenCalled()
    })
})

describe('renderRecapCard', () => {
    it('posts the payload and returns the sidecar JPEG', async () => {
        const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 1])
        const fetchFn = jest.fn<AnyFn>(async (url: string) =>
            String(url).endsWith('/render/recap')
                ? new Response(jpeg as BodyInit, {
                      status: 200,
                      headers: { 'content-type': 'image/jpeg' },
                  })
                : new Response(null, { status: 404 }),
        )

        const out = await renderRecapCard(recap, {
            fetch: asFetch(fetchFn),
            getCardTracks: jest.fn<AnyFn>().mockResolvedValue(cardTracks),
            renderBaseUrl: 'http://render:8080',
        })

        expect(out).toEqual({ ok: true, jpeg: Buffer.from(jpeg) })
        const render = fetchFn.mock.calls.find((c) =>
            String(c[0]).endsWith('/render/recap'),
        )
        expect(JSON.parse(render?.[1].body).guildId).toBe('g-1')
    })

    it('never throws: an unexpected error becomes bad_response', async () => {
        const out = await renderRecapCard(recap, {
            getCardTracks: jest.fn<AnyFn>().mockResolvedValue(null),
        })
        expect(out).toEqual({ ok: false, reason: 'bad_response' })
    })
})

// The sidecar crate (#2699) owns recap.schema.json. Until it lands on this
// branch the contract cannot be checked, so the test says so instead of
// passing silently.
const SCHEMA_PATH = resolve(
    __dirname,
    '../../../../render/schema/recap.schema.json',
)
const schemaPresent = existsSync(SCHEMA_PATH)
// In CI a missing schema is a failure, never a silent skip.
const inCi = Boolean(process.env.CI)
const contract = schemaPresent || inCi ? it : it.skip

describe('lucky-render contract (recap.schema.json)', () => {
    if (!schemaPresent) {
        // eslint-disable-next-line no-console
        console.warn(
            `contract test skipped: ${SCHEMA_PATH} not found (lucky-render crate, #2699, not merged yet)`,
        )
    }

    type JsonSchema = {
        properties: Record<
            string,
            { type?: string | string[]; const?: unknown }
        >
        required: string[]
        additionalProperties: boolean
        $defs: Record<string, JsonSchema>
    }

    function typeMatches(
        value: unknown,
        type: string | string[] | undefined,
    ): boolean {
        const types = Array.isArray(type) ? type : type ? [type] : []
        return types.some((t) => {
            if (t === 'integer')
                return Number.isInteger(value) && (value as number) >= 0
            if (t === 'string') return typeof value === 'string'
            if (t === 'null') return value === null
            if (t === 'array') return Array.isArray(value)
            return false
        })
    }

    function assertMatches(value: Record<string, unknown>, schema: JsonSchema) {
        expect(schema.additionalProperties).toBe(false)
        expect(
            Object.keys(value).filter((k) => !(k in schema.properties)),
        ).toEqual([])
        for (const key of schema.required) expect(value).toHaveProperty(key)
        for (const [key, v] of Object.entries(value)) {
            const spec = schema.properties[key]
            if (spec.type) {
                expect({ key, ok: typeMatches(v, spec.type) }).toEqual({
                    key,
                    ok: true,
                })
            }
            if (spec.const !== undefined) expect(v).toBe(spec.const)
        }
    }

    contract('the built payload matches the schema exactly', async () => {
        if (!schemaPresent) {
            throw new Error(`CI requires ${SCHEMA_PATH} (lucky-render crate)`)
        }
        const schema = JSON.parse(
            readFileSync(SCHEMA_PATH, 'utf8'),
        ) as JsonSchema
        const payload = await buildRecapCardPayload(recap, {
            fetch: asFetch(coverFetch()),
            getCardTracks: jest.fn<AnyFn>().mockResolvedValue(cardTracks),
        })

        assertMatches(payload as unknown as Record<string, unknown>, schema)
        expect(payload.schemaVersion).toBe(1)
        expect(payload.topTracks.some((t) => 'cover' in t)).toBe(true)
        for (const track of payload.topTracks) {
            assertMatches(
                track as unknown as Record<string, unknown>,
                schema.$defs.TopTrack,
            )
        }
        expect(payload.topArtists.length).toBeGreaterThan(0)
        for (const artist of payload.topArtists) {
            assertMatches(
                artist as unknown as Record<string, unknown>,
                schema.$defs.TopArtist,
            )
        }
    })
})
