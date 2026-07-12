import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const guildSettingsServiceMock = {
    getGuildSettings: jest.fn() as jest.MockedFunction<any>,
}
const supportSessionServiceMock = {
    getActiveForUser: jest.fn() as jest.MockedFunction<any>,
    open: jest.fn() as jest.MockedFunction<any>,
    getByChannel: jest.fn() as jest.MockedFunction<any>,
    close: jest.fn() as jest.MockedFunction<any>,
}
const interactionReplyMock = jest.fn() as jest.MockedFunction<any>

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: guildSettingsServiceMock,
    supportSessionService: supportSessionServiceMock,
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

import ticketCommand from './ticket'

function makeChannel() {
    return {
        id: 'ch-1',
        send: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
    }
}

function makeInteraction(
    sub: 'open' | 'close',
    channel: ReturnType<typeof makeChannel>,
) {
    return {
        guildId: 'g1',
        channelId: 'ch-1',
        user: { id: 'u1', username: 'bob', tag: 'bob#1' },
        options: {
            getSubcommand: () => sub,
            getString: () => null,
        },
        guild: {
            id: 'g1',
            roles: { everyone: { id: 'everyone' } },
            channels: {
                create: jest.fn().mockResolvedValue(channel),
                fetch: jest.fn().mockResolvedValue(channel),
            },
            members: {
                fetch: jest.fn().mockResolvedValue({
                    roles: { cache: { has: () => false } },
                    permissions: { has: () => true },
                }),
            },
        },
    } as any
}

describe('/ticket command (smoke)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        guildSettingsServiceMock.getGuildSettings.mockResolvedValue({
            supportCategoryId: 'cat-1',
            supportAgentRoleId: 'agent-role',
        })
    })

    it('open: creates a channel, records the session, and confirms', async () => {
        const channel = makeChannel()
        supportSessionServiceMock.getActiveForUser.mockResolvedValue(null)
        supportSessionServiceMock.open.mockResolvedValue({ id: 's1' })

        await ticketCommand.execute({
            interaction: makeInteraction('open', channel),
        } as any)

        expect(supportSessionServiceMock.open).toHaveBeenCalledWith(
            expect.objectContaining({
                guildId: 'g1',
                channelId: 'ch-1',
                requestorId: 'u1',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: { content: expect.stringContaining('Ticket opened') },
            }),
        )
    })

    it('open: refuses when the feature is not configured', async () => {
        guildSettingsServiceMock.getGuildSettings.mockResolvedValue({})
        const channel = makeChannel()

        await ticketCommand.execute({
            interaction: makeInteraction('open', channel),
        } as any)

        expect(channel.send).not.toHaveBeenCalled()
        expect(supportSessionServiceMock.open).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    content: expect.stringContaining('not configured'),
                },
            }),
        )
    })

    it('open: rolls the channel back when recording the session fails', async () => {
        const channel = makeChannel()
        supportSessionServiceMock.getActiveForUser.mockResolvedValue(null)
        supportSessionServiceMock.open.mockRejectedValue({ code: 'P2002' })

        await ticketCommand.execute({
            interaction: makeInteraction('open', channel),
        } as any)

        expect(channel.delete).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    content: expect.stringContaining('already have an open'),
                },
            }),
        )
    })

    it('close: deletes the channel and closes the session', async () => {
        const channel = makeChannel()
        supportSessionServiceMock.getByChannel.mockResolvedValue({
            id: 's1',
            status: 'open',
            requestorId: 'u1',
        })

        await ticketCommand.execute({
            interaction: makeInteraction('close', channel),
        } as any)

        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
        expect(channel.delete).toHaveBeenCalled()
    })
})
