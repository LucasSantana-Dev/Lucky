import { Readable } from 'node:stream'

const mockSuccessSet = jest.fn()
const mockDurationSet = jest.fn()
const mockDurationRemove = jest.fn()
const mockFailuresSet = jest.fn()
const mockWarnLog = jest.fn()
const mockInfoLog = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    playProbeSuccess: { set: (...a: unknown[]) => mockSuccessSet(...a) },
    playProbeDurationSeconds: {
        set: (...a: unknown[]) => mockDurationSet(...a),
        remove: (...a: unknown[]) => mockDurationRemove(...a),
    },
    playProbeConsecutiveFailures: {
        set: (...a: unknown[]) => mockFailuresSet(...a),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...a: unknown[]) => mockInfoLog(...a),
    warnLog: (...a: unknown[]) => mockWarnLog(...a),
}))

jest.mock(
    '../../functions/music/commands/play/handlers/resolveProvider',
    () => ({
        SOUNDCLOUD_FALLBACK_BLOCKED_EXTRACTORS: ['blocked-extractor'],
    }),
)

import { isPlayProbe } from '../../handlers/player/probeContext'
import {
    PROBE_FIRST_RUN_DELAY_MS,
    PROBE_INTERVAL_MS,
    PlayProbeScheduler,
    __resetPlayProbeStateForTests,
    isPlayProbeEnabled,
    probeCasesFromEnv,
    runPlayProbe,
    runProbeCase,
    type ProbeCase,
} from './playProbe'

const URL_CASE: ProbeCase = {
    id: 'youtube_watch',
    query: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    kind: 'url',
}
const TEXT_CASE: ProbeCase = {
    id: 'soundcloud_text',
    query: 'lofi hip hop',
    kind: 'text',
}

function streamingTrack(stream: () => Promise<unknown>) {
    return { extractor: { stream: jest.fn(stream) } }
}

function playerReturning(...tracks: unknown[]) {
    return {
        search: jest.fn(async () => ({ tracks })),
    } as unknown as Parameters<typeof runProbeCase>[0] & {
        search: jest.Mock
    }
}

describe('probeCasesFromEnv', () => {
    it('builds the three YouTube URL forms and the SoundCloud text case', () => {
        const cases = probeCasesFromEnv({})
        expect(cases.map((c) => c.id)).toEqual([
            'youtube_watch',
            'youtube_music',
            'youtu_be',
            'soundcloud_text',
        ])
        expect(cases[1].query).toBe(
            'https://music.youtube.com/watch?v=jNQXAC9IVRw',
        )
        expect(cases[2].query).toMatch(/^https:\/\/youtu\.be\/jNQXAC9IVRw\?si=/)
    })

    it('adds the playlist case only when the operator sets one', () => {
        const cases = probeCasesFromEnv({
            PLAY_PROBE_PLAYLIST_URL:
                'https://www.youtube.com/playlist?list=PLx',
        })
        expect(cases.find((c) => c.id === 'youtube_playlist')?.query).toBe(
            'https://www.youtube.com/playlist?list=PLx',
        )
    })
})

describe('isPlayProbeEnabled', () => {
    it.each([
        [undefined, true],
        ['true', true],
        ['false', false],
        ['0', false],
        [' FALSE ', false],
    ])('PLAY_PROBE_ENABLED=%s -> %s', (value, expected) => {
        expect(isPlayProbeEnabled({ PLAY_PROBE_ENABLED: value })).toBe(expected)
    })
})

describe('runProbeCase', () => {
    it('passes when the stream yields a first chunk, inside the probe scope', async () => {
        let scopedDuringStream = false
        const player = playerReturning(
            streamingTrack(async () => {
                scopedDuringStream = isPlayProbe()
                return Readable.from([Buffer.from('audio')])
            }),
        )

        const result = await runProbeCase(player, URL_CASE, 1_000)

        expect(result).toMatchObject({ id: 'youtube_watch', ok: true })
        expect(scopedDuringStream).toBe(true)
        expect(isPlayProbe()).toBe(false)
    })

    it('reads a { $fmt, stream } source', async () => {
        const player = playerReturning(
            streamingTrack(async () => ({
                $fmt: 'opus',
                stream: Readable.from([Buffer.from('audio')]),
            })),
        )
        await expect(
            runProbeCase(player, URL_CASE, 1_000),
        ).resolves.toMatchObject({ ok: true })
    })

    it('fails at resolve when the search finds nothing', async () => {
        const player = playerReturning()
        await expect(
            runProbeCase(player, URL_CASE, 1_000),
        ).resolves.toMatchObject({
            ok: false,
            failedStage: 'resolve',
            error: 'search returned no tracks',
        })
    })

    it('fails at first_byte when the bridge throws', async () => {
        const player = playerReturning(
            streamingTrack(async () => {
                throw new Error('Bridge exhausted')
            }),
        )
        await expect(
            runProbeCase(player, URL_CASE, 1_000),
        ).resolves.toMatchObject({
            ok: false,
            failedStage: 'first_byte',
            error: 'Bridge exhausted',
        })
    })

    it('fails at first_byte when the stream ends empty', async () => {
        const player = playerReturning(
            streamingTrack(async () => Readable.from([])),
        )
        await expect(
            runProbeCase(player, URL_CASE, 1_000),
        ).resolves.toMatchObject({ ok: false, failedStage: 'first_byte' })
    })

    it('times out a stream that never produces data', async () => {
        const player = playerReturning(
            streamingTrack(async () => new Readable({ read() {} })),
        )
        await expect(runProbeCase(player, URL_CASE, 50)).resolves.toMatchObject(
            {
                ok: false,
                failedStage: 'first_byte',
                error: 'first byte timed out after 50ms',
            },
        )
    })

    it('searches plain text on the SoundCloud arm with the stealing extractors blocked', async () => {
        const player = playerReturning(
            streamingTrack(async () => Readable.from([Buffer.from('a')])),
        )
        await runProbeCase(player, TEXT_CASE, 1_000)
        expect(player.search).toHaveBeenCalledWith('lofi hip hop', {
            searchEngine: 'soundcloudSearch',
            blockExtractors: ['blocked-extractor'],
        })
    })
})

describe('runPlayProbe', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetPlayProbeStateForTests()
    })

    it('publishes success, durations and counts consecutive failures per case', async () => {
        const failing = playerReturning()
        await runPlayProbe(failing, [URL_CASE], 1_000)
        await runPlayProbe(failing, [URL_CASE], 1_000)

        expect(mockSuccessSet).toHaveBeenLastCalledWith(
            { case: 'youtube_watch' },
            0,
        )
        expect(mockFailuresSet).toHaveBeenLastCalledWith(
            { case: 'youtube_watch' },
            2,
        )
        expect(mockDurationSet).toHaveBeenCalledWith(
            { case: 'youtube_watch', stage: 'resolve' },
            expect.any(Number),
        )
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'play probe: case failed' }),
        )

        const working = playerReturning(
            streamingTrack(async () => Readable.from([Buffer.from('a')])),
        )
        await runPlayProbe(working, [URL_CASE], 1_000)

        expect(mockSuccessSet).toHaveBeenLastCalledWith(
            { case: 'youtube_watch' },
            1,
        )
        expect(mockFailuresSet).toHaveBeenLastCalledWith(
            { case: 'youtube_watch' },
            0,
        )
    })
})

describe('runProbeCase cancellation and HTTP sources (#2920 review)', () => {
    it('destroys a stream that never yields once the timeout fires', async () => {
        const stream = new Readable({ read() {} })
        const player = playerReturning(streamingTrack(async () => stream))

        await runProbeCase(player, URL_CASE, 50)

        expect(stream.destroyed).toBe(true)
    })

    it('destroys a stream that arrives after the timeout', async () => {
        const stream = new Readable({ read() {} })
        let release: () => void = () => undefined
        const player = playerReturning(
            streamingTrack(
                () =>
                    new Promise((resolve) => {
                        release = () => resolve(stream)
                    }),
            ),
        )

        await expect(runProbeCase(player, URL_CASE, 20)).resolves.toMatchObject(
            {
                ok: false,
                failedStage: 'first_byte',
            },
        )
        release()
        await new Promise((resolve) => setImmediate(resolve))

        expect(stream.destroyed).toBe(true)
    })

    it('reads the first bytes of a stream URL', async () => {
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('audio'))
        try {
            const player = playerReturning(
                streamingTrack(async () => 'https://cdn.example/stream'),
            )
            await expect(
                runProbeCase(player, URL_CASE, 1_000),
            ).resolves.toMatchObject({ ok: true })
            expect(fetchMock).toHaveBeenCalledWith(
                'https://cdn.example/stream',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            )
        } finally {
            fetchMock.mockRestore()
        }
    })

    it('fails on a stream URL that answers an error status', async () => {
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('no', { status: 403 }))
        try {
            const player = playerReturning(
                streamingTrack(async () => 'https://cdn.example/stream'),
            )
            await expect(
                runProbeCase(player, URL_CASE, 1_000),
            ).resolves.toMatchObject({
                ok: false,
                failedStage: 'first_byte',
                error: 'stream URL answered HTTP 403',
            })
        } finally {
            fetchMock.mockRestore()
        }
    })

    it('fails on a track without an extractor', async () => {
        const player = playerReturning({ extractor: null })
        await expect(
            runProbeCase(player, URL_CASE, 1_000),
        ).resolves.toMatchObject({
            ok: false,
            failedStage: 'first_byte',
            error: 'resolved track has no extractor',
        })
    })
})

describe('runPlayProbe gauges', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetPlayProbeStateForTests()
    })

    it('drops the stale first_byte value when a run fails at resolve', async () => {
        await runPlayProbe(playerReturning(), [URL_CASE], 1_000)

        expect(mockDurationRemove).toHaveBeenCalledWith({
            case: 'youtube_watch',
            stage: 'first_byte',
        })
    })
})

describe('PlayProbeScheduler', () => {
    const ORIGINAL = process.env.PLAY_PROBE_ENABLED

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        delete process.env.PLAY_PROBE_ENABLED
    })

    afterEach(() => {
        jest.useRealTimers()
        if (ORIGINAL === undefined) delete process.env.PLAY_PROBE_ENABLED
        else process.env.PLAY_PROBE_ENABLED = ORIGINAL
    })

    it('first runs after the boot delay, then every interval, until stopped', async () => {
        const scheduler = new PlayProbeScheduler()
        const player = playerReturning()
        scheduler.start(player)

        await jest.advanceTimersByTimeAsync(PROBE_FIRST_RUN_DELAY_MS - 1)
        expect(player.search).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        const perRun = player.search.mock.calls.length
        expect(perRun).toBeGreaterThan(0)

        await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS)
        expect(player.search.mock.calls.length).toBe(perRun * 2)

        scheduler.stop()
        await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 2)
        expect(player.search.mock.calls.length).toBe(perRun * 2)
    })

    it('does not schedule anything when PLAY_PROBE_ENABLED=false', async () => {
        process.env.PLAY_PROBE_ENABLED = 'false'
        const scheduler = new PlayProbeScheduler()
        const player = playerReturning()
        scheduler.start(player)

        await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 2)

        expect(player.search).not.toHaveBeenCalled()
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'play probe: disabled by PLAY_PROBE_ENABLED',
            }),
        )
    })

    it('ignores a second start and skips a tick while a run is still going', async () => {
        const scheduler = new PlayProbeScheduler()
        const player = {
            search: jest.fn(() => new Promise(() => undefined)),
        } as unknown as Parameters<typeof runProbeCase>[0] & {
            search: jest.Mock
        }
        scheduler.start(player)
        scheduler.start(player)

        await jest.advanceTimersByTimeAsync(PROBE_FIRST_RUN_DELAY_MS)
        expect(player.search).toHaveBeenCalledTimes(1)

        // The first case's search never settles within this interval's
        // ticks only because of the resolve timeout; the overlap guard
        // must keep the next tick from starting a second run.
        await jest.advanceTimersByTimeAsync(
            PROBE_INTERVAL_MS - PROBE_FIRST_RUN_DELAY_MS,
        )
        expect(player.search.mock.calls.length).toBeLessThan(
            probeCasesFromEnv().length + 2,
        )
        scheduler.stop()
    })
})
