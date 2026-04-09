import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const createWarningEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const createInfoEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const resolveGuildQueueMock = jest.fn()
const createQueueMock = jest.fn()
const queueConnectMock = jest.fn()
const namedSessionServiceMock = {
    save: jest.fn(),
    restore: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
}

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createInfoEmbed: (...args: unknown[]) => createInfoEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../handlers/queueHandler', () => ({
    createQueue: (...args: unknown[]) => createQueueMock(...args),
    queueConnect: (...args: unknown[]) => queueConnectMock(...args),
}))

jest.mock('../../../utils/music/namedSessions', () => ({
    namedSessionService: namedSessionServiceMock,
}))

jest.mock('../../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {},
}))

function createInteraction(subcommand: string, options: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getString: jest.fn((name: string) => {
                if (name === 'name') return options[name] || 'test-session'
                return null
            }),
        },
    } as any
}

function createQueue() {
    return {
        guild: { id: 'guild-1' },
        tracks: [],
    } as any
}

function createClient() {
    return {
        player: {},
    } as any
}

describe('session command', () => {
    let sessionCommand: any

    beforeEach(async () => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })
        createQueueMock.mockResolvedValue(createQueue())
        queueConnectMock.mockResolvedValue(undefined)
        namedSessionServiceMock.save.mockResolvedValue({
            name: 'test-session',
            trackCount: 5,
        })
        namedSessionServiceMock.restore.mockResolvedValue({
            restoredCount: 5,
        })
        namedSessionServiceMock.list.mockResolvedValue([
            {
                name: 'session-1',
                savedBy: 'user-1',
                savedAt: Date.now(),
                trackCount: 3,
            },
        ])
        namedSessionServiceMock.delete.mockResolvedValue(true)

        const module = await import('./session')
        sessionCommand = module.default
    })

    it('should have correct command name and description', () => {
        expect(sessionCommand.data.name).toBe('session')
        expect(sessionCommand.data.description).toContain('Save or restore')
    })

    it('should handle save subcommand with valid session', async () => {
        const interaction = createInteraction('save', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(namedSessionServiceMock.save).toHaveBeenCalledWith(
            expect.any(Object),
            'party-mix',
            'user-1',
        )
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('should handle save with no active queue', async () => {
        resolveGuildQueueMock.mockReturnValueOnce({ queue: null })
        const interaction = createInteraction('save', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            expect.stringContaining('No active queue'),
            expect.any(String),
        )
    })

    it('should handle save when session already exists', async () => {
        namedSessionServiceMock.save.mockResolvedValueOnce(null)
        const interaction = createInteraction('save', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            expect.stringContaining('Could not save'),
            expect.any(String),
        )
    })

    it('should handle list subcommand', async () => {
        const interaction = createInteraction('list')
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(namedSessionServiceMock.list).toHaveBeenCalledWith('guild-1')
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Saved Sessions',
            expect.stringContaining('session-1'),
        )
    })

    it('should handle list with no sessions', async () => {
        namedSessionServiceMock.list.mockResolvedValueOnce([])
        const interaction = createInteraction('list')
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'No saved sessions',
            expect.any(String),
        )
    })

    it('should handle delete subcommand successfully', async () => {
        const interaction = createInteraction('delete', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(namedSessionServiceMock.delete).toHaveBeenCalledWith(
            'guild-1',
            'party-mix',
        )
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('should handle delete when session not found', async () => {
        namedSessionServiceMock.delete.mockResolvedValueOnce(false)
        const interaction = createInteraction('delete', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'Session not found',
            expect.any(String),
        )
    })

    it('should handle restore subcommand successfully', async () => {
        const interaction = createInteraction('restore', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(namedSessionServiceMock.restore).toHaveBeenCalledWith(
            expect.any(Object),
            'party-mix',
            expect.any(Object),
        )
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('should handle restore when session not found', async () => {
        namedSessionServiceMock.restore.mockResolvedValueOnce({
            restoredCount: 0,
        })
        const interaction = createInteraction('restore', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'Session not found',
            expect.any(String),
        )
    })

    it('should require voice channel for restore', async () => {
        requireVoiceChannelMock.mockResolvedValueOnce(false)
        const interaction = createInteraction('restore', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(requireVoiceChannelMock).toHaveBeenCalledWith(interaction)
    })

    it('should handle voice connection failure', async () => {
        queueConnectMock.mockRejectedValueOnce(new Error('Connection failed'))
        const interaction = createInteraction('restore', { name: 'party-mix' })
        const client = createClient()

        await sessionCommand.execute({ client, interaction })

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Connection error',
            expect.any(String),
        )
    })
})
