import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Readable } from 'node:stream'

const mockSuccessSet = jest.fn()
const mockDurationSet = jest.fn()
const mockFailuresSet = jest.fn()
const mockWarnLog = jest.fn()
const mockInfoLog = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    playProbeSuccess: { set: (...a: unknown[]) => mockSuccessSet(...a) },
    playProbeDurationSeconds: {
        set: (...a: unknown[]) => mockDurationSet(...a),
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
