import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const requireGuildMock = jest.fn()
const logSettingsServiceMock = {
    getConfig: jest.fn(),
    addIgnored: jest.fn(),
    removeIgnored: jest.fn(),
}
const interactionReplyMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    logSettingsService: logSettingsServiceMock,
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title, desc) => ({ title, desc })),
    createSuccessEmbed: jest.fn((title, desc) => ({ title, desc })),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    captureException: jest.fn(),
}))

function makeOptions({
    subcommand = 'list',
    channel = null as { id: string } | null,
    role = null as { id: string } | null,
    user = null as { id: string } | null,
} = {}) {
    return {
        getSubcommand: jest.fn().mockReturnValue(subcommand),
        getChannel: jest.fn().mockReturnValue(channel),
        getRole: jest.fn().mockReturnValue(role),
        getUser: jest.fn().mockReturnValue(user),
    }
}

describe('logging command', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>
    let loggingCommand: any

    beforeEach(async () => {
        jest.clearAllMocks()

        mockInteraction = {
            guildId: 'guild-123',
            deferReply: jest.fn().mockResolvedValue(undefined),
            options: makeOptions() as any,
        } as any

        requireGuildMock.mockResolvedValue(true)
        logSettingsServiceMock.getConfig.mockResolvedValue(null)
        interactionReplyMock.mockResolvedValue(undefined)

        loggingCommand = (await import('./logging')).default
    })

    it('defers reply ephemerally', async () => {
        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })
        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 })
    })

    it('returns early if requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(mockInteraction.deferReply).not.toHaveBeenCalled()
    })

    it('ignore-add rejects when zero targets given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-add',
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.addIgnored).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: [
                        expect.objectContaining({
                            desc: expect.stringContaining('exactly one'),
                        }),
                    ],
                }),
            }),
        )
    })

    it('ignore-add rejects when more than one target given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-add',
            channel: { id: 'c1' },
            role: { id: 'r1' },
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.addIgnored).not.toHaveBeenCalled()
    })

    it('ignore-add adds the channel when only channel is given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-add',
            channel: { id: 'c1' },
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.addIgnored).toHaveBeenCalledWith(
            'guild-123',
            'channel',
            'c1',
        )
    })

    it('ignore-add adds the role when only role is given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-add',
            role: { id: 'r1' },
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.addIgnored).toHaveBeenCalledWith(
            'guild-123',
            'role',
            'r1',
        )
    })

    it('ignore-add adds the user when only user is given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-add',
            user: { id: 'u1' },
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.addIgnored).toHaveBeenCalledWith(
            'guild-123',
            'user',
            'u1',
        )
    })

    it('ignore-remove removes the given target', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-remove',
            user: { id: 'u1' },
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.removeIgnored).toHaveBeenCalledWith(
            'guild-123',
            'user',
            'u1',
        )
    })

    it('ignore-remove rejects when zero targets given', async () => {
        mockInteraction.options = makeOptions({
            subcommand: 'ignore-remove',
        }) as any

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(logSettingsServiceMock.removeIgnored).not.toHaveBeenCalled()
    })

    it('list reports nothing excluded when config is unset', async () => {
        mockInteraction.options = makeOptions({ subcommand: 'list' }) as any
        logSettingsServiceMock.getConfig.mockResolvedValue(null)

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('list reports the configured exclusions', async () => {
        mockInteraction.options = makeOptions({ subcommand: 'list' }) as any
        logSettingsServiceMock.getConfig.mockResolvedValue({
            ignoredChannelIds: ['c1'],
            ignoredRoleIds: ['r1'],
            ignoredUserIds: ['u1'],
        })

        await loggingCommand.execute({
            interaction: mockInteraction as ChatInputCommandInteraction,
        })

        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
