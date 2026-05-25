import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import { Events, type Message } from 'discord.js'
import { handleExternalScrobbler } from './externalScrobbler'

const isLastFmConfiguredMock = jest.fn<() => boolean>()
const getSessionKeyForUserMock =
    jest.fn<(discordId: string) => Promise<string | null>>()
const isLastFmInvalidSessionErrorMock = jest.fn<(error: unknown) => boolean>()
const getTrackMetadataMock = jest.fn()
const updateNowPlayingMock = jest.fn()
const scrobbleMock = jest.fn()
const lastFmUnlinkMock = jest.fn<(discordId: string) => Promise<boolean>>()
const infoLogMock = jest.fn<(payload: unknown) => void>()
const errorLogMock = jest.fn<(payload: unknown) => void>()
const debugLogMock = jest.fn<(payload: unknown) => void>()

jest.mock('../lastfm', () => ({
    isLastFmConfigured: () => isLastFmConfiguredMock(),
    getSessionKeyForUser: (discordId: string) =>
        getSessionKeyForUserMock(discordId),
    isLastFmInvalidSessionError: (error: unknown) =>
        isLastFmInvalidSessionErrorMock(error),
    getTrackMetadata: (...args: unknown[]) => getTrackMetadataMock(...args),
    updateNowPlaying: (...args: unknown[]) => updateNowPlayingMock(...args),
    scrobble: (...args: unknown[]) => scrobbleMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        unlink: (discordId: string) => lastFmUnlinkMock(discordId),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (payload: unknown) => infoLogMock(payload),
    errorLog: (payload: unknown) => errorLogMock(payload),
    debugLog: (payload: unknown) => debugLogMock(payload),
}))

function createVoiceChannel() {
    return {
        members: new Map([
            ['user-1', { user: { bot: false, username: 'User One' } }],
            ['bot-2', { user: { bot: true, username: 'Bot Two' } }],
        ]),
        isVoiceBased: () => true,
    }
}

function createMessage(
    content: string,
    guild: {
        id: string
        members: { cache: Map<string, { voice: { channel: unknown } }> }
    },
): Message {
    return {
        content,
        author: {
            id: 'music-bot',
            bot: true,
            username: 'Rythm',
        },
        guild,
    } as unknown as Message
}

function createHarness(guildId: string): {
    guild: {
        id: string
        members: { cache: Map<string, { voice: { channel: unknown } }> }
    }
    handler: (message: Message) => Promise<void>
} {
    const listeners = new Map<string, (message: Message) => Promise<void>>()
    const voiceChannel = createVoiceChannel()
    const guild = {
        id: guildId,
        members: {
            cache: new Map([
                ['music-bot', { voice: { channel: voiceChannel } }],
            ]),
        },
        channels: {
            cache: {
                filter: jest.fn(() => new Map([['voice-1', voiceChannel]])),
            },
        },
    }

    const client = {
        on: jest.fn(
            (event: string, handler: (message: Message) => Promise<void>) => {
                listeners.set(event, handler)
            },
        ),
        guilds: { cache: new Map([[guildId, guild]]) },
    }

    handleExternalScrobbler(client as unknown as never)
    const handler = listeners.get(Events.MessageCreate)
    if (!handler) {
        throw new Error('MessageCreate handler was not registered')
    }

    return { guild, handler }
}

describe('externalScrobbler', () => {
    let dateNowSpy: jest.SpiedFunction<typeof Date.now> | null = null

    beforeEach(() => {
        jest.clearAllMocks()
        isLastFmConfiguredMock.mockReturnValue(true)
        getSessionKeyForUserMock.mockResolvedValue('session-1')
        isLastFmInvalidSessionErrorMock.mockReturnValue(false)
        lastFmUnlinkMock.mockResolvedValue(true)
        getTrackMetadataMock.mockResolvedValue(null)
        updateNowPlayingMock.mockResolvedValue(undefined)
        scrobbleMock.mockResolvedValue(undefined)
    })

    afterEach(() => {
        dateNowSpy?.mockRestore()
        dateNowSpy = null
    })

    it('parses now-playing messages and updates Last.fm with metadata', async () => {
        const testMeta = { mbid: 'test-mbid', album: 'Test Album' }
        getTrackMetadataMock.mockResolvedValue(testMeta)
        const { guild, handler } = createHarness('guild-1')

        // Test standard separator (–)
        await handler(
            createMessage('**Now playing: My Artist – My Song**', guild),
        )

        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            'My Artist',
            'My Song',
            undefined,
            'session-1',
            testMeta,
        )

        // Test em dash separator (—)
        updateNowPlayingMock.mockClear()
        getSessionKeyForUserMock.mockClear()
        getTrackMetadataMock.mockResolvedValue(null)

        await handler(createMessage('Now playing: Artist 2 — Song 2', guild))

        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            'Artist 2',
            'Song 2',
            undefined,
            'session-1',
            undefined,
        )
        expect(getSessionKeyForUserMock).toHaveBeenCalledWith('user-1')
    })

    it('scrobbles previous track after 30 seconds and updates now-playing', async () => {
        dateNowSpy = jest.spyOn(Date, 'now')
        dateNowSpy
            .mockReturnValueOnce(100000)
            .mockReturnValueOnce(140000)
            .mockReturnValueOnce(140000)

        const { guild, handler } = createHarness('guild-2')

        // First track triggers registration
        await handler(
            createMessage('Now playing: First Artist — First Song', guild),
        )

        expect(updateNowPlayingMock).toHaveBeenCalled()
        expect(updateNowPlayingMock.mock.calls[0][0]).toBe('First Artist')
        expect(updateNowPlayingMock.mock.calls[0][1]).toBe('First Song')

        // Second track (after 40 seconds elapsed) triggers scrobble of first and update of second
        updateNowPlayingMock.mockClear()
        scrobbleMock.mockClear()

        await handler(
            createMessage('Now playing: Second Artist - Second Song', guild),
        )

        // Should have scrobbled the previous track with correct elapsed time (40 seconds)
        expect(scrobbleMock).toHaveBeenCalledWith(
            'First Artist',
            'First Song',
            100,
            40,
            'session-1',
            undefined,
        )

        // Should have updated now playing for the new track
        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            'Second Artist',
            'Second Song',
            undefined,
            'session-1',
            undefined,
        )
    })

    it('unlinks user when updateNowPlaying fails with invalid Last.fm session', async () => {
        const { guild, handler } = createHarness('guild-3')
        const invalidSessionError = new Error(
            'Last.fm track.updateNowPlaying: 403 {"message":"Invalid session key - Please re-authenticate","error":9}',
        )

        updateNowPlayingMock.mockRejectedValue(invalidSessionError)
        isLastFmInvalidSessionErrorMock.mockReturnValue(true)

        await handler(createMessage('Now playing: Artist – Song', guild))

        expect(lastFmUnlinkMock).toHaveBeenCalledWith('user-1')
        expect(errorLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'External updateNowPlaying failed',
            }),
        )
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Removed invalid Last.fm session for User One',
            }),
        )
    })

    it('unlinks user when scrobble fails with invalid Last.fm session', async () => {
        dateNowSpy = jest.spyOn(Date, 'now')
        dateNowSpy
            .mockReturnValueOnce(100000)
            .mockReturnValueOnce(140000)
            .mockReturnValueOnce(140000)

        const { guild, handler } = createHarness('guild-4')
        const invalidSessionError = new Error(
            'Last.fm track.scrobble: 403 {"message":"Invalid session key - Please re-authenticate","error":9}',
        )

        scrobbleMock.mockRejectedValue(invalidSessionError)
        isLastFmInvalidSessionErrorMock.mockReturnValue(true)

        await handler(
            createMessage('Now playing: First Artist — First Song', guild),
        )
        await handler(
            createMessage('Now playing: Second Artist - Second Song', guild),
        )

        expect(lastFmUnlinkMock).toHaveBeenCalledWith('user-1')
        expect(errorLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({ message: 'External scrobble failed' }),
        )
    })

    it('logs unlink failure when invalid Last.fm session cannot be removed', async () => {
        const { guild, handler } = createHarness('guild-5')
        const invalidSessionError = new Error(
            'Last.fm track.updateNowPlaying: 403 {"message":"Invalid session key - Please re-authenticate","error": 9}',
        )

        updateNowPlayingMock.mockRejectedValue(invalidSessionError)
        isLastFmInvalidSessionErrorMock.mockReturnValue(true)
        lastFmUnlinkMock.mockResolvedValue(false)

        await handler(createMessage('Now playing: Artist – Song', guild))

        expect(lastFmUnlinkMock).toHaveBeenCalledWith('user-1')
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to remove invalid Last.fm session',
                data: expect.objectContaining({ discordId: 'user-1' }),
            }),
        )
    })
})
