import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import sessionCommand from './session'
import type { QueueResolutionSource } from '../../../utils/music/queueResolver'

const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const saveSnapshotMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const createQueueMock = jest.fn()
const queueConnectMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const warningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))
const successEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const infoEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'info',
    title,
    message,
}))
const errorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
type SessionExecuteParams = Parameters<typeof sessionCommand.execute>[0]
type SessionClient = SessionExecuteParams['client']
type SessionInteraction = SessionExecuteParams['interaction']
const CLIENT = {
    player: {},
} as unknown as SessionClient

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
}))

jest.mock('../../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
    },
}))

jest.mock('../../../handlers/queueHandler', () => ({
    createQueue: (...args: unknown[]) => createQueueMock(...args),
    queueConnect: (...args: unknown[]) => queueConnectMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    warningEmbed: (...args: unknown[]) => warningEmbedMock(...args),
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    infoEmbed: (...args: unknown[]) => infoEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

function createInteraction(
    subcommand: 'save' | 'restore',
    guildId = 'guild-1',
) {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    } as unknown as SessionInteraction
}

function createExecuteParams(
    subcommand: 'save' | 'restore',
    guildId = 'guild-1',
): SessionExecuteParams {
    return {
        client: CLIENT,
        interaction: createInteraction(subcommand, guildId),
    }
}

function createQueueResolution({
    queue = null,
    source = 'miss',
    guildId = 'guild-1',
    cacheSize = 0,
    cacheSampleKeys = [],
}: {
    queue?: unknown
    source?: QueueResolutionSource
    guildId?: string
    cacheSize?: number
    cacheSampleKeys?: string[]
} = {}) {
    return {
        queue,
        source,
        diagnostics: {
            guildId,
            cacheSize,
            cacheSampleKeys,
        },
    }
}

describe('session command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        queueConnectMock.mockResolvedValue(undefined)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 1,
            sessionSnapshotId: 'snap-1',
        })
        resolveGuildQueueMock.mockReturnValue(createQueueResolution())
        warningEmbedMock.mockImplementation(
            (title: string, message: string) => ({
                type: 'warning',
                title,
                message,
            }),
        )
        successEmbedMock.mockImplementation(
            (title: string, message: string) => ({
                type: 'success',
                title,
                message,
            }),
        )
        infoEmbedMock.mockImplementation((title: string, message: string) => ({
            type: 'info',
            title,
            message,
        }))
        errorEmbedMock.mockImplementation((title: string, message: string) => ({
            type: 'error',
            title,
            message,
        }))
    })

    it('returns when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await sessionCommand.execute(createExecuteParams('save'))

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('warns when saving without active queue', async () => {
        await sessionCommand.execute(createExecuteParams('save'))

        expect(warningEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('warns when snapshot save has no tracks', async () => {
        const queue = { tracks: { size: 1 } }
        saveSnapshotMock.mockResolvedValue(null)
        resolveGuildQueueMock.mockReturnValue(
            createQueueResolution({
                queue,
                source: 'nodes.get',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            }),
        )

        await sessionCommand.execute(createExecuteParams('save'))

        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(warningEmbedMock).toHaveBeenCalledWith(
            'Nothing to save',
            'Queue snapshot was not saved because there are no tracks.',
        )
    })

    it('succeeds when snapshot is saved', async () => {
        const queue = { tracks: { size: 3 } }
        saveSnapshotMock.mockResolvedValue({
            sessionSnapshotId: 'snap-2',
            upcomingTracks: [{}, {}],
        })
        resolveGuildQueueMock.mockReturnValue(
            createQueueResolution({
                queue,
                source: 'cache.guild',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            }),
        )

        await sessionCommand.execute(createExecuteParams('save'))

        expect(successEmbedMock).toHaveBeenCalledWith(
            'Session saved',
            expect.stringContaining('Snapshot ID: snap-2'),
        )
    })

    it('stops restore when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)

        await sessionCommand.execute(createExecuteParams('restore'))

        expect(createQueueMock).not.toHaveBeenCalled()
        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('replies with connection error when queue connection fails', async () => {
        const queue = { id: 'queue-1' }
        createQueueMock.mockResolvedValue(queue)
        queueConnectMock.mockRejectedValue(new Error('connect failed'))

        await sessionCommand.execute(createExecuteParams('restore'))

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Connection error',
            'Could not connect to your voice channel.',
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    ephemeral: true,
                    embeds: expect.arrayContaining([
                        expect.objectContaining({ type: 'error' }),
                    ]),
                }),
            }),
        )
    })

    it('reports when no snapshot is restored', async () => {
        const queue = { id: 'queue-2' }
        createQueueMock.mockResolvedValue(queue)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 0,
            sessionSnapshotId: null,
        })

        await sessionCommand.execute(createExecuteParams('restore'))

        expect(infoEmbedMock).toHaveBeenCalledWith(
            'No snapshot restored',
            'No saved session was found or queue is already populated.',
        )
    })

    it('reports successful restore', async () => {
        const queue = { id: 'queue-3' }
        createQueueMock.mockResolvedValue(queue)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 3,
            sessionSnapshotId: 'snap-3',
        })

        await sessionCommand.execute(createExecuteParams('restore'))

        expect(successEmbedMock).toHaveBeenCalledWith(
            'Session restored',
            expect.stringContaining('Restored 3 tracks'),
        )
    })
})
