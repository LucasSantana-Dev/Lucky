import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import clearCommand from './clear'
import leaveCommand from './leave'
import lyricsCommand from './lyrics'
import moveCommand from './move'
import pauseCommand from './pause'
import removeCommand from './remove'
import repeatCommand from './repeat'
import shuffleCommand from './shuffle'
import skipCommand from './skip'
import songinfoCommand from './songinfo'
import stopCommand from './stop'
import volumeCommand from './volume'
import type { CommandExecuteParams } from '../../../types/CommandData'

const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const featureToggleIsEnabledMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: (...args: unknown[]) => featureToggleIsEnabledMock(...args),
    },
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn(() => ({})),
    createSuccessEmbed: jest.fn(() => ({})),
    createWarningEmbed: jest.fn(() => ({})),
    musicEmbed: jest.fn(() => ({
        setThumbnail: jest.fn(),
    })),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

type CommandLike = {
    execute: (_params: unknown) => Promise<void>
}

type QueueCase = {
    name: string
    command: CommandLike
}

type CommandInteraction = CommandExecuteParams['interaction']
type CommandClient = CommandExecuteParams['client']
type InteractionStub = Pick<CommandInteraction, 'guildId' | 'user' | 'options'>

const queueValidationCases: QueueCase[] = [
    { name: 'clear', command: clearCommand },
    { name: 'leave', command: leaveCommand },
    { name: 'move', command: moveCommand },
    { name: 'pause', command: pauseCommand },
    { name: 'remove', command: removeCommand },
    { name: 'repeat', command: repeatCommand },
    { name: 'shuffle', command: shuffleCommand },
    { name: 'skip', command: skipCommand },
    { name: 'songinfo', command: songinfoCommand },
    { name: 'stop', command: stopCommand },
    { name: 'volume', command: volumeCommand },
]

function createClient(): CommandClient {
    return {
        player: {},
    } as unknown as CommandClient
}

function createInteraction(): InteractionStub {
    return {
        guildId: 'guild-1',
        user: {
            id: 'user-1',
        },
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'mode') return 'off'
                if (name === 'song') return null
                return null
            }),
            getInteger: jest.fn(() => null),
        },
    }
}

function executeWithParams(
    command: CommandLike,
    client: CommandClient,
    interaction: InteractionStub,
) {
    return command.execute({
        client,
        interaction: interaction as unknown as CommandInteraction,
    })
}

describe('music command resolver wiring', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(false)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        featureToggleIsEnabledMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({
            queue: { id: 'queue-1' },
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })
    })

    for (const testCase of queueValidationCases) {
        it(`uses resolveGuildQueue in ${testCase.name}`, async () => {
            const client = createClient()
            const interaction = createInteraction()

            await executeWithParams(testCase.command, client, interaction)

            expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'guild-1')
            expect(requireQueueMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'queue-1' }),
                interaction,
            )
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })
    }

    it(
        'calls resolveGuildQueue before requireCurrentTrack when lyrics has no song',
        async () => {
        const client = createClient()
        const interaction = createInteraction()
        requireCurrentTrackMock.mockResolvedValue(false)

        await executeWithParams(lyricsCommand, client, interaction)

        expect(featureToggleIsEnabledMock).toHaveBeenCalledWith(
            'LYRICS',
            expect.objectContaining({
                guildId: 'guild-1',
                userId: 'user-1',
            }),
        )
        expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'guild-1')
        expect(requireCurrentTrackMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'queue-1' }),
            interaction,
        )
        expect(interactionReplyMock).not.toHaveBeenCalled()
        },
    )

    it('returns early in lyrics when guild id is missing', async () => {
        const client = createClient()
        const interaction = {
            ...createInteraction(),
            guildId: null,
        }

        await executeWithParams(lyricsCommand, client, interaction)

        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
        expect(requireCurrentTrackMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                    ephemeral: true,
                }),
            }),
        )
    })
})
