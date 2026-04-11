import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { Readable } from 'stream'

const playdlSearchMock = jest.fn()
const playdlStreamMock = jest.fn()
const spawnMock = jest.fn()

jest.mock('child_process', () => ({
    spawn: (...args: unknown[]) => spawnMock(...args),
}))

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

import {
    createResilientStream,
    streamViaYtDlp,
    streamViaSoundCloud,
    findMatchingSoundCloudResult,
    parseDurationString,
} from './playerFactory'

const fakeStream = { on: jest.fn() } as unknown as Readable

function makeSpawnSuccess() {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const proc = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        kill: jest.fn(),
    })
    setImmediate(() => stdout.emit('data', Buffer.from('audio')))
    return proc
}

function makeSpawnError(code = 1, stderrText = '') {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const proc = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        kill: jest.fn(),
    })
    setImmediate(() => {
        if (stderrText) stderr.emit('data', Buffer.from(stderrText))
        proc.emit('close', code)
    })
    return proc
}

function makeTrack(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        duration: '5:55',
        url: 'https://youtube.com/watch?v=fakeBohemian',
        ...overrides,
    }
}

describe('parseDurationString', () => {
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

describe('findMatchingSoundCloudResult', () => {
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

    it('rejects when duration is > 30s off', () => {
        expect(
            findMatchingSoundCloudResult('Bohemian Rhapsody', '10:00', results),
        ).toBeUndefined()
    })

    it('accepts when duration is 16-30s off (relaxed tolerance)', () => {
        expect(
            findMatchingSoundCloudResult('Bohemian Rhapsody', '5:55', [
                {
                    name: 'Bohemian Rhapsody',
                    url: 'sc://1',
                    durationInSec: 374,
                },
            ])?.url,
        ).toBe('sc://1')
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

    it('matches Brazilian funk track when result is missing 1 compound token (75% threshold)', () => {
        const query =
            'MC Ryan SP MC Jacara e MC Meno K - Posso Ate Nao Te Dar Flores (DJ Japa NK e DJ Davi DogDog)'
        const results = [
            {
                name: 'MC Ryan SP, MC Jacaré e MC Meno K - Posso Até Não Te Dar Flores (DJ Japa NK e DJ Davi Dog Dog)',
                url: 'sc://funk',
                durationInSec: 194,
            },
        ]
        expect(findMatchingSoundCloudResult(query, '3:14', results)?.url).toBe(
            'sc://funk',
        )
    })

    it('returns undefined when fewer than 75% of tokens match', () => {
        const results = [
            {
                name: 'Completely Different Song',
                url: 'sc://x',
                durationInSec: 180,
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Bohemian Rhapsody Queen',
                '3:00',
                results,
            ),
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

describe('streamViaYtDlp', () => {
    beforeEach(() => {
        spawnMock.mockReset()
    })

    it('resolves with a readable stream containing the first chunk when yt-dlp emits data', async () => {
        const proc = makeSpawnSuccess()
        spawnMock.mockReturnValue(proc)

        const stream = await streamViaYtDlp('https://youtube.com/watch?v=test')
        // Now returns a PassThrough (not raw proc.stdout) to preserve first chunk
        expect(stream).not.toBe(proc.stdout)
        expect(stream.readable).toBe(true)
        expect(spawnMock).toHaveBeenCalledWith(
            'yt-dlp',
            expect.arrayContaining([
                '--no-playlist',
                '-o',
                '-',
                '--js-runtimes',
                `node:${process.execPath}`,
                'https://youtube.com/watch?v=test',
            ]),
            expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
        )
    })

    it('rejects for non-https URLs without spawning', async () => {
        await expect(
            streamViaYtDlp('http://youtube.com/watch?v=test'),
        ).rejects.toThrow(/only https/i)
        expect(spawnMock).not.toHaveBeenCalled()
    })

    it('rejects for domains not in the allowlist without spawning', async () => {
        await expect(
            streamViaYtDlp('https://evil.com/audio.mp3'),
        ).rejects.toThrow(/not in allowlist/i)
        expect(spawnMock).not.toHaveBeenCalled()
    })

    it('accepts all allowed domains', async () => {
        const allowedUrls = [
            'https://youtube.com/watch?v=test',
            'https://www.youtube.com/watch?v=test',
            'https://youtu.be/test',
            'https://music.youtube.com/watch?v=test',
            'https://soundcloud.com/artist/track',
            'https://open.spotify.com/track/test',
        ]
        for (const url of allowedUrls) {
            const proc = makeSpawnSuccess()
            spawnMock.mockReturnValue(proc)
            await expect(streamViaYtDlp(url)).resolves.toBeDefined()
            spawnMock.mockReset()
        }
    })

    it('rejects when yt-dlp closes with non-zero exit code', async () => {
        const proc = makeSpawnError(1)
        spawnMock.mockReturnValue(proc)

        await expect(
            streamViaYtDlp('https://youtube.com/watch?v=test'),
        ).rejects.toThrow(/exited with code 1/)
    })

    it('includes first stderr line in rejection message for diagnostics', async () => {
        const proc = makeSpawnError(
            1,
            'ERROR: Video unavailable: This video is not available in your country',
        )
        spawnMock.mockReturnValue(proc)

        await expect(
            streamViaYtDlp('https://youtube.com/watch?v=test'),
        ).rejects.toThrow(/Video unavailable/)
    })

    it('rejects when spawn emits error', async () => {
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        const proc = Object.assign(new EventEmitter(), {
            stdout,
            stderr,
            kill: jest.fn(),
        })
        spawnMock.mockReturnValue(proc)
        setImmediate(() => proc.emit('error', new Error('ENOENT')))

        await expect(
            streamViaYtDlp('https://youtube.com/watch?v=test'),
        ).rejects.toThrow('ENOENT')
    })
})

describe('createResilientStream', () => {
    beforeEach(() => {
        spawnMock.mockReset()
        playdlSearchMock.mockReset()
        playdlStreamMock.mockReset()
    })

    it('streams via yt-dlp from source URL on first attempt', async () => {
        const proc = makeSpawnSuccess()
        spawnMock.mockReturnValue(proc)

        const result = await createResilientStream(makeTrack())
        expect(result.readable).toBe(true)
        expect(spawnMock).toHaveBeenCalledWith(
            'yt-dlp',
            expect.arrayContaining([
                'https://youtube.com/watch?v=fakeBohemian',
            ]),
            expect.anything(),
        )
        expect(playdlSearchMock).not.toHaveBeenCalled()
    })

    it('falls back to SoundCloud primary search when yt-dlp fails', async () => {
        spawnMock.mockReturnValue(makeSpawnError(1))
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
        spawnMock.mockReturnValue(makeSpawnError(1))
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

    it('streams via yt-dlp even for spam uploader channels', async () => {
        const proc = makeSpawnSuccess()
        spawnMock.mockReturnValue(proc)

        const result = await createResilientStream(
            makeTrack({
                title: 'GOLDEN - KPOP DEMON HUNTERS - HUNTR/X [Download]',
                author: 'Best Songs',
            }),
        )
        expect(result.readable).toBe(true)
        expect(playdlSearchMock).not.toHaveBeenCalled()
    })

    it('falls back to core title (stripped parentheticals) when title-only search fails', async () => {
        spawnMock.mockReturnValue(makeSpawnError(1))
        playdlSearchMock
            .mockResolvedValueOnce([
                { name: 'Unrelated', url: 'sc://miss', durationInSec: 180 },
            ])
            .mockResolvedValueOnce([
                { name: 'Unrelated', url: 'sc://miss2', durationInSec: 180 },
            ])
            .mockResolvedValueOnce([
                {
                    name: 'Bohemian Rhapsody',
                    url: 'sc://core',
                    durationInSec: 354,
                },
            ])
        playdlStreamMock.mockResolvedValueOnce({ stream: fakeStream })

        const result = await createResilientStream(
            makeTrack({
                title: 'Bohemian Rhapsody (Official Music Live Session)',
            }),
        )
        expect(result).toBe(fakeStream)
        expect(playdlSearchMock).toHaveBeenCalledTimes(3)
        expect(playdlStreamMock).toHaveBeenCalledWith('sc://core')
    })

    it('throws "Bridge exhausted" when track has no URL and SoundCloud fails', async () => {
        playdlSearchMock.mockResolvedValue([])

        await expect(
            createResilientStream(makeTrack({ url: undefined })),
        ).rejects.toThrow(/bridge exhausted/i)
    })

    it('throws "Bridge exhausted" when all stages fail', async () => {
        spawnMock.mockReturnValue(makeSpawnError(1))
        playdlSearchMock.mockResolvedValue([])

        await expect(createResilientStream(makeTrack())).rejects.toThrow(
            /bridge exhausted/i,
        )
    })
})
