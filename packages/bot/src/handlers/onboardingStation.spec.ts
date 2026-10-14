import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const infoLogMock = jest.fn()
const warnLogMock = jest.fn()
const interactionReplyMock = jest.fn()
const translatorForInteractionMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string) => ({ title }))
const createWarningEmbedMock = jest.fn((title: string) => ({ title }))
const createSuccessEmbedMock = jest.fn((title: string) => ({ title }))
const isUnknownInteractionErrorMock = jest.fn(() => false)
const resolveGuildQueueMock = jest.fn()
const runPostPlayBackgroundOpsMock = jest.fn<() => Promise<void>>()

// A fixed, distinguishable blocklist so tests can assert it flows through
// unmodified to player.play — the real list lives in resolveProvider.ts and
// exists to stop the Spotify/Attachment extractors from claiming a
// SOUNDCLOUD_SEARCH text query (documented there against #1930).
const FAKE_BLOCKED_EXTRACTORS = ['fake-spotify-id', 'fake-attachment-id']

jest.mock('discord.js', () => {
    class MockButtonBuilder {
        setCustomId = jest.fn().mockReturnThis()
        setLabel = jest.fn().mockReturnThis()
        setEmoji = jest.fn().mockReturnThis()
        setStyle = jest.fn().mockReturnThis()
    }
    class MockActionRowBuilder {
        components: unknown[] = []
        addComponents(...components: unknown[]) {
            this.components = components
            return this
        }
    }
    return {
        ActionRowBuilder: MockActionRowBuilder,
        ButtonBuilder: MockButtonBuilder,
        ButtonStyle: { Secondary: 'SECONDARY' },
        PermissionFlagsBits: { Connect: 'CONNECT', Speak: 'SPEAK' },
    }
})

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'auto',
        YOUTUBE_SEARCH: 'youtubeSearch',
        SOUNDCLOUD_SEARCH: 'soundcloudSearch',
    },
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 20_000 } },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../functions/music/commands/play/queryUtils', () => ({
    isUnknownInteractionError: (...args: unknown[]) =>
        isUnknownInteractionErrorMock(...args),
}))

jest.mock('../functions/music/commands/play/handlers/resolveProvider', () => ({
    TEXT_SEARCH_BLOCKED_EXTRACTORS: FAKE_BLOCKED_EXTRACTORS,
}))

jest.mock(
    '../functions/music/commands/play/handlers/postPlayBackgroundOps',
    () => ({
        runPostPlayBackgroundOps: (...args: unknown[]) =>
            runPostPlayBackgroundOpsMock(...args),
    }),
)

jest.mock('../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../i18n/translatorForInteraction', () => ({
    translatorForInteraction: (...args: unknown[]) =>
        translatorForInteractionMock(...args),
}))

import {
    createOnboardingStationRow,
    handleOnboardingStationButton,
    ONBOARDING_STATION_BUTTON_PREFIX,
} from './onboardingStation'

type MockVoiceChannel = {
    permissionsFor: jest.Mock
}

function createVoiceChannel(hasPermissions: boolean): MockVoiceChannel {
    return {
        permissionsFor: jest.fn().mockReturnValue({
            has: jest.fn().mockReturnValue(hasPermissions),
        }),
    }
}

function createInteraction(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    const playMock = jest
        .fn()
        .mockResolvedValue({ track: { title: 'Fake Track' } })
    return {
        customId: `${ONBOARDING_STATION_BUTTON_PREFIX}lofi`,
        guildId: 'guild-1',
        guild: { members: { me: { id: 'bot-id' } } },
        channel: { id: 'channel-1' },
        user: { id: 'user-1' },
        member: { voice: { channel: createVoiceChannel(true) } },
        client: { player: { play: playMock } },
        deferred: false,
        replied: false,
        deferReply: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

describe('createOnboardingStationRow', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        translatorForInteractionMock.mockResolvedValue((key: string) => key)
    })

    it('builds one button per genre with a station_ prefixed customId', async () => {
        const row = (await createOnboardingStationRow({
            id: 'guild-1',
            preferredLocale: 'en-US',
        })) as unknown as { components: { setCustomId: jest.Mock }[] }

        expect(row.components).toHaveLength(4)
        const customIds = row.components.map(
            (button) => button.setCustomId.mock.calls[0][0],
        )
        expect(customIds).toEqual([
            'station_lofi',
            'station_gaming',
            'station_pop',
            'station_brMix',
        ])
    })
})

describe('handleOnboardingStationButton', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Minimal interpolation so the "started" test can prove the genre
        // label actually reaches the embed, not just that t() was called.
        translatorForInteractionMock.mockResolvedValue(
            (key: string, opts?: { genre?: string }) =>
                opts?.genre ? `${key}:${opts.genre}` : key,
        )
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        runPostPlayBackgroundOpsMock.mockResolvedValue(undefined)
    })

    it('replies ephemerally asking to join a voice channel when not in one', async () => {
        const interaction = createInteraction({
            member: { voice: { channel: null } },
        })

        await handleOnboardingStationButton(interaction as never)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'music.station.notInVoiceTitle',
            'music.station.notInVoiceDescription',
        )
        expect(
            (interaction.client as { player: { play: jest.Mock } }).player.play,
        ).not.toHaveBeenCalled()
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    event: 'onboarding_station',
                    guildId: 'guild-1',
                    genre: 'lofi',
                    started: false,
                    reason: 'not_in_voice',
                }),
            }),
        )
    })

    it('replies ephemerally when Connect/Speak permissions are missing', async () => {
        const interaction = createInteraction({
            member: { voice: { channel: createVoiceChannel(false) } },
        })

        await handleOnboardingStationButton(interaction as never)

        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'music.station.missingPermissionsTitle',
            'music.station.missingPermissionsDescription',
        )
        expect(
            (interaction.client as { player: { play: jest.Mock } }).player.play,
        ).not.toHaveBeenCalled()
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    started: false,
                    reason: 'missing_permissions',
                }),
            }),
        )
    })

    it('starts playback from SoundCloud (never YouTube) when in voice with permissions', async () => {
        const fakeQueue = { id: 'queue-1' }
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue: null }) // hadQueueBeforePlay check: fresh guild
            .mockReturnValueOnce({ queue: fakeQueue }) // post-play lookup
        const interaction = createInteraction()

        await handleOnboardingStationButton(interaction as never)

        const client = interaction.client as { player: { play: jest.Mock } }
        expect(interaction.deferReply).toHaveBeenCalledWith({
            ephemeral: true,
        })
        expect(client.player.play).toHaveBeenCalledTimes(1)
        const [voiceChannel, query, playOptions] = client.player.play.mock
            .calls[0] as [unknown, string, Record<string, unknown>]
        expect(voiceChannel).toBe(
            (interaction.member as { voice: { channel: unknown } }).voice
                .channel,
        )
        expect(typeof query).toBe('string')
        expect(playOptions.searchEngine).toBe('soundcloudSearch')
        expect(playOptions.searchEngine).not.toBe('youtubeSearch')
        expect(playOptions.searchEngine).not.toBe('auto')
        expect(playOptions.blockExtractors).toBe(FAKE_BLOCKED_EXTRACTORS)

        // #2473 hand-off: without this call the seed track plays once and
        // stops, since trackEventHandlers only replenishes the queue in
        // QueueRepeatMode.AUTOPLAY and a fresh queue defaults to OFF.
        expect(runPostPlayBackgroundOpsMock).toHaveBeenCalledWith({
            queue: fakeQueue,
            guildId: 'guild-1',
            track: { title: 'Fake Track' },
            hadQueueBeforePlay: false,
            isPlaylist: false,
        })

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            'music.station.startedTitle',
            'music.station.startedDescription:music.station.genres.lofi',
        )
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    started: true,
                    reason: 'ok',
                    genre: 'lofi',
                }),
            }),
        )
    })

    it('logs interaction_expired and does not start playback when the defer races the interaction timing out', async () => {
        isUnknownInteractionErrorMock.mockReturnValueOnce(true)
        const interaction = createInteraction({
            deferReply: jest
                .fn()
                .mockRejectedValue(new Error('Unknown interaction')),
        })

        await handleOnboardingStationButton(interaction as never)

        const client = interaction.client as { player: { play: jest.Mock } }
        expect(client.player.play).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    started: false,
                    reason: 'interaction_expired',
                }),
            }),
        )
    })

    it('shows a friendly error and logs a failure when playback throws', async () => {
        const interaction = createInteraction()
        ;(
            interaction.client as { player: { play: jest.Mock } }
        ).player.play.mockRejectedValueOnce(new Error('no results'))

        await handleOnboardingStationButton(interaction as never)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'music.station.failedTitle',
            'music.station.failedDescription',
        )
        expect(warnLogMock).toHaveBeenCalled()
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    started: false,
                    reason: 'playback_error',
                }),
            }),
        )
    })
})
