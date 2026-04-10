import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Readable } from 'stream'

const playdlSearchMock = jest.fn()
const playdlStreamMock = jest.fn()

// Stub `discord-player` and `@discord-player/extractor` so importing
// playerFactory.ts doesn't pull in their full dependency trees (one of
// which requires the native `file-type` module that isn't present in
// the test environment). We only exercise the bridge fallback chain —
// the Player class and DefaultExtractors aren't touched in these tests.
jest.mock('discord-player', () => ({
    Player: class {
        extractors = {
            loadMulti: jest.fn(),
            register: jest.fn(),
        }
        setMaxListeners = jest.fn()
    },
}))

jest.mock('@discord-player/extractor', () => ({
    DefaultExtractors: [],
}))

jest.mock('play-dl', () => ({
    search: (...args: unknown[]) => playdlSearchMock(...args),
    stream: (...args: unknown[]) => playdlStreamMock(...args),
    getFreeClientID: jest.fn(async () => 'fake-client-id'),
    setToken: jest.fn(async () => undefined),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    debugLog: jest.fn(),
}))

// Import AFTER the mocks so the real module wires against the mock.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import {
    createResilientStream,
    streamViaSoundCloud,
    findMatchingSoundCloudResult,
    parseDurationString,
} from './playerFactory'

const fakeStream = { on: jest.fn() } as unknown as Readable

function makeTrack(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        duration: '5:55',
        url: 'https://youtube.com/watch?v=fakeBohemian',
        ...overrides,
    }
}

describe('parseDurationString (real export)', () => {
    it('parses m:ss', () => {
        expect(parseDurationString('3:45')).toBe(225)
    })

    it('parses h:mm:ss', () => {
        expect(parseDurationString('1:02:03')).toBe(3723)
    })

    it('returns null for undefined / empty', () => {
        expect(parseDurationString(undefined)).toBeNull()
        expect(parseDurationString('')).toBeNull()
    })

    it('returns null for non-numeric parts', () => {
        expect(parseDurationString('3:xx')).toBeNull()
    })

    it('returns null for single-token input', () => {
        expect(parseDurationString('225')).toBeNull()
    })
})

describe('findMatchingSoundCloudResult (real export)', () => {
    const results = [
        { name: 'Bohemian Rhapsody', url: 'sc://1', durationInSec: 354 },
        { name: 'Unrelated', url: 'sc://2', durationInSec: 180 },
    ]

    it('matches title inclusion + duration within 15s', () => {
        expect(
            findMatchingSoundCloudResult('Bohemian Rhapsody', '5:55', results)
                ?.url,
        ).toBe('sc://1')
    })

    it('rejects when duration is > 15s off', () => {
        expect(
            findMatchingSoundCloudResult('Bohemian Rhapsody', '10:00', results),
        ).toBeUndefined()
    })

    it('accepts when track has no duration', () => {
        expect(
            findMatchingSoundCloudResult(
                'Bohemian Rhapsody',
                undefined,
                results,
            )?.url,
        ).toBe('sc://1')
    })

    it('accepts when result has no duration', () => {
        expect(
            findMatchingSoundCloudResult('Bohemian Rhapsody', '5:55', [
                { name: 'Bohemian Rhapsody', url: 'sc://n' },
            ])?.url,
        ).toBe('sc://n')
    })

    it('returns undefined when query normalizes to empty (non-ASCII only)', () => {
        expect(
            findMatchingSoundCloudResult('夜に駆ける', '4:07', [
                { name: '夜に駆ける', url: 'sc://3', durationInSec: 247 },
            ]),
        ).toBeUndefined()
    })
})

describe('streamViaSoundCloud', () => {
    beforeEach(() => {
        playdlSearchMock.mockReset()
        playdlStreamMock.mockReset()
    })

    it('throws on empty query without hitting the network', async () => {
        await expect(streamViaSoundCloud('   ')).rejects.toThrow(/empty query/i)
        expect(playdlSearchMock).not.toHaveBeenCalled()
    })

    it('throws "no results" when SoundCloud returns nothing', async () => {
        playdlSearchMock.mockResolvedValue([])
        await expect(
            streamViaSoundCloud('nonexistent', '3:00'),
        ).rejects.toThrow(/no results/i)
    })

    it('throws "no validated match" when title fuzzy-match fails', async () => {
        playdlSearchMock.mockResolvedValue([
            { name: 'Totally Different', url: 'sc://x', durationInSec: 180 },
        ])
        await expect(
            streamViaSoundCloud('Bohemian Rhapsody', '5:55'),
        ).rejects.toThrow(/no validated match/i)
    })

    it('returns a stream when a candidate validates', async () => {
        playdlSearchMock.mockResolvedValue([
            { name: 'Bohemian Rhapsody', url: 'sc://ok', durationInSec: 354 },
        ])
        playdlStreamMock.mockResolvedValue({ stream: fakeStream })

        const result = await streamViaSoundCloud('Bohemian Rhapsody', '5:55')
        expect(result).toBe(fakeStream)
        expect(playdlStreamMock).toHaveBeenCalledWith('sc://ok')
    })
})

describe('createResilientStream', () => {
    beforeEach(() => {
        playdlSearchMock.mockReset()
        playdlStreamMock.mockReset()
    })

    it('streams directly from source URL on first attempt', async () => {
        playdlStreamMock.mockResolvedValueOnce({ stream: fakeStream })

        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(playdlStreamMock).toHaveBeenCalledWith(
            'https://youtube.com/watch?v=fakeBohemian',
        )
        expect(playdlSearchMock).not.toHaveBeenCalled()
    })

    it('falls back to SoundCloud primary search when direct stream fails', async () => {
        playdlStreamMock.mockRejectedValueOnce(new Error('403'))
        playdlSearchMock.mockResolvedValueOnce([
            {
                name: 'Bohemian Rhapsody - Queen',
                url: 'sc://primary',
                durationInSec: 354,
            },
        ])
        playdlStreamMock.mockResolvedValueOnce({ stream: fakeStream })

        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(playdlSearchMock).toHaveBeenCalledTimes(1)
        expect(playdlStreamMock).toHaveBeenCalledWith('sc://primary')
    })

    it('falls back to SoundCloud title-only when primary returns no validated match', async () => {
        playdlStreamMock.mockRejectedValueOnce(new Error('403'))
        playdlSearchMock
            .mockResolvedValueOnce([
                { name: 'Unrelated', url: 'sc://miss', durationInSec: 180 },
            ])
            .mockResolvedValueOnce([
                {
                    name: 'Bohemian Rhapsody',
                    url: 'sc://secondary',
                    durationInSec: 354,
                },
            ])
        playdlStreamMock.mockResolvedValueOnce({ stream: fakeStream })

        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(playdlSearchMock).toHaveBeenCalledTimes(2)
        expect(playdlStreamMock).toHaveBeenCalledWith('sc://secondary')
    })

    it('streams directly from source URL even for spam uploader channels', async () => {
        playdlStreamMock.mockResolvedValueOnce({ stream: fakeStream })

        const result = await createResilientStream(
            makeTrack({
                title: 'GOLDEN - KPOP DEMON HUNTERS - HUNTR/X [Download]',
                author: 'Best Songs',
            }),
        )
        expect(result).toBe(fakeStream)
        expect(playdlSearchMock).not.toHaveBeenCalled()
    })

    it('throws "Bridge exhausted" when a track has no URL and SoundCloud fails', async () => {
        playdlSearchMock.mockResolvedValue([])

        await expect(
            createResilientStream(makeTrack({ url: undefined })),
        ).rejects.toThrow(/bridge exhausted/i)
    })

    it('throws "Bridge exhausted" when all stages fail', async () => {
        playdlStreamMock.mockRejectedValueOnce(new Error('youtube 403'))
        playdlSearchMock.mockResolvedValue([])

        await expect(createResilientStream(makeTrack())).rejects.toThrow(
            /bridge exhausted/i,
        )
    })
})
