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
const updateNowPlayingMock =
    jest.fn<
        (
            artist: string,
            track: string,
            durationSec?: number,
            sessionKey?: string | null,
        ) => Promise<void>
    >()
const scrobbleMock =
    jest.fn<
        (
            artist: string,
            track: string,
            timestamp: number,
            durationSec?: number,
            sessionKey?: string | null,
        ) => Promise<void>
    >()
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
    updateNowPlaying: (
        artist: string,
        track: string,
        durationSec?: number,
        sessionKey?: string | null,
    ) => updateNowPlayingMock(artist, track, durationSec, sessionKey),
    scrobble: (
        artist: string,
        track: string,
        timestamp: number,
        durationSec?: number,
        sessionKey?: string | null,
    ) => scrobbleMock(artist, track, timestamp, durationSec, sessionKey),
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
    })

    afterEach(() => {
        dateNowSpy?.mockRestore()
        dateNowSpy = null
    })

    it('parses now-playing line and updates Last.fm for voice members', async () => {
        const { guild, handler } = createHarness('guild-1')

        await handler(
            createMessage('**Now playing: My Artist – My Song**', guild),
        )

        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            'My Artist',
            'My Song',
            undefined,
            'session-1',
        )
        expect(getSessionKeyForUserMock).toHaveBeenCalledWith('user-1')
    })

    it('scrobbles previous track on next now-playing event after 30 seconds', async () => {
        dateNowSpy = jest.spyOn(Date, 'now')
        dateNowSpy
            .mockReturnValueOnce(100000)
            .mockReturnValueOnce(140000)
            .mockReturnValueOnce(140000)

        const { guild, handler } = createHarness('guild-2')

        await handler(
            createMessage('Now playing: First Artist — First Song', guild),
        )
        await handler(
            createMessage('Now playing: Second Artist - Second Song', guild),
        )

        expect(scrobbleMock).toHaveBeenCalledWith(
            'First Artist',
            'First Song',
            100,
            40,
            'session-1',
        )
        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            'Second Artist',
            'Second Song',
            undefined,
            'session-1',
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
})
