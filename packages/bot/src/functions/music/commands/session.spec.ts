import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import sessionCommand from './session'

const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const saveSnapshotMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const createQueueMock = jest.fn()
const queueConnectMock = jest.fn()
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

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
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

jest.mock('../../../utils/general/embeds', () => ({
    warningEmbed: (...args: unknown[]) => warningEmbedMock(...args),
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    infoEmbed: (...args: unknown[]) => infoEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

function createInteraction(subcommand: 'save' | 'restore', guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    } as any
}

function createClient(queue?: unknown) {
    return {
        player: {
            nodes: {
                get: jest.fn(() => queue),
            },
        },
    } as any
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
    })

    it('returns when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await sessionCommand.execute({
            client: createClient(),
            interaction: createInteraction('save'),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('warns when saving without active queue', async () => {
        await sessionCommand.execute({
            client: createClient(undefined),
            interaction: createInteraction('save'),
        } as any)

        expect(warningEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('warns when snapshot save has no tracks', async () => {
        const queue = { tracks: { size: 1 } }
        saveSnapshotMock.mockResolvedValue(null)

        await sessionCommand.execute({
            client: createClient(queue),
            interaction: createInteraction('save'),
        } as any)

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

        await sessionCommand.execute({
            client: createClient(queue),
            interaction: createInteraction('save'),
        } as any)

        expect(successEmbedMock).toHaveBeenCalledWith(
            'Session saved',
            expect.stringContaining('Snapshot ID: snap-2'),
        )
    })

    it('stops restore when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)

        await sessionCommand.execute({
            client: createClient(),
            interaction: createInteraction('restore'),
        } as any)

        expect(createQueueMock).not.toHaveBeenCalled()
        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('replies with connection error when queue connection fails', async () => {
        const queue = { id: 'queue-1' }
        createQueueMock.mockResolvedValue(queue)
        queueConnectMock.mockRejectedValue(new Error('connect failed'))

        await sessionCommand.execute({
            client: createClient(undefined),
            interaction: createInteraction('restore'),
        } as any)

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Connection error',
            'Could not connect to your voice channel.',
        )
    })

    it('reports when no snapshot is restored', async () => {
        const queue = { id: 'queue-2' }
        createQueueMock.mockResolvedValue(queue)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 0,
            sessionSnapshotId: null,
        })

        await sessionCommand.execute({
            client: createClient(undefined),
            interaction: createInteraction('restore'),
        } as any)

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

        await sessionCommand.execute({
            client: createClient(undefined),
            interaction: createInteraction('restore'),
        } as any)

        expect(successEmbedMock).toHaveBeenCalledWith(
            'Session restored',
            expect.stringContaining('Restored 3 tracks'),
        )
    })
})
