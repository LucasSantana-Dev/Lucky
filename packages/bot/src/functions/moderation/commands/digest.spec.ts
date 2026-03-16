import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import digestCommand from './digest'

const getStatsMock = jest.fn()
const getRecentCasesMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        getStats: (...args: unknown[]) => getStatsMock(...args),
        getRecentCases: (...args: unknown[]) => getRecentCasesMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function makeCase(type: string, moderatorName: string, daysAgo: number) {
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    return { type, moderatorName, createdAt }
}

function createInteraction(period: string | null = null) {
    return {
        guild: {
            id: '123456789012345678',
            name: 'TestServer',
        },
        user: {
            tag: 'Admin#0001',
        },
        options: {
            getString: jest.fn((_name: string) => period),
        },
        replied: false,
        deferred: false,
    } as any
}

describe('digest command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        infoLogMock.mockReturnValue(undefined)
        errorLogMock.mockReturnValue(undefined)
    })

    it('has correct command name and description', () => {
        const data = digestCommand.data.toJSON()
        expect(data.name).toBe('digest')
        expect(data.description).toContain('digest')
    })

    it('replies with embed when cases exist in period', async () => {
        getStatsMock.mockResolvedValue({ totalCases: 10, activeCases: 2 })
        getRecentCasesMock.mockResolvedValue([
            makeCase('WARN', 'Mod1', 3),
            makeCase('BAN', 'Mod2', 5),
            makeCase('WARN', 'Mod1', 6),
        ])

        const interaction = createInteraction('7d')
        await digestCommand.execute({ interaction, client: {} as any })

        expect(getStatsMock).toHaveBeenCalledWith('123456789012345678')
        expect(getRecentCasesMock).toHaveBeenCalledWith('123456789012345678', 500)
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        expect(replyArg.content.embeds).toHaveLength(1)
        expect(infoLogMock).toHaveBeenCalledTimes(1)
    })

    it('defaults to 7d period when no option provided', async () => {
        getStatsMock.mockResolvedValue({ totalCases: 5, activeCases: 0 })
        getRecentCasesMock.mockResolvedValue([makeCase('KICK', 'Mod1', 2)])

        const interaction = createInteraction(null)
        await digestCommand.execute({ interaction, client: {} as any })

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        expect(replyArg.content.embeds).toHaveLength(1)
    })

    it('shows no actions message when no cases in period', async () => {
        getStatsMock.mockResolvedValue({ totalCases: 100, activeCases: 5 })
        // All cases are older than 7 days
        getRecentCasesMock.mockResolvedValue([
            makeCase('WARN', 'Mod1', 10),
            makeCase('BAN', 'Mod2', 15),
        ])

        const interaction = createInteraction('7d')
        await digestCommand.execute({ interaction, client: {} as any })

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        const embed = replyArg.content.embeds[0]
        const fields = embed.data?.fields ?? []
        const actionsField = fields.find((f: any) => f.name.includes('Actions'))
        expect(actionsField?.value).toContain('No actions recorded')
    })

    it('uses 30d period when specified', async () => {
        getStatsMock.mockResolvedValue({ totalCases: 20, activeCases: 1 })
        getRecentCasesMock.mockResolvedValue([makeCase('MUTE', 'Mod1', 20)])

        const interaction = createInteraction('30d')
        await digestCommand.execute({ interaction, client: {} as any })

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        const embed = replyArg.content.embeds[0]
        expect(embed.data?.title).toContain('30 days')
    })

    it('replies with error message when not in a guild', async () => {
        const interaction = {
            guild: null,
            user: { tag: 'Admin#0001' },
            options: { getString: jest.fn(() => null) },
            replied: false,
            deferred: false,
        } as any

        await digestCommand.execute({ interaction, client: {} as any })

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        expect(replyArg.content.content).toContain('server')
        expect(getStatsMock).not.toHaveBeenCalled()
    })

    it('replies with error message when service throws', async () => {
        getStatsMock.mockRejectedValue(new Error('DB error'))
        getRecentCasesMock.mockResolvedValue([])

        const interaction = createInteraction('7d')
        await digestCommand.execute({ interaction, client: {} as any })

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        expect(replyArg.content.content).toContain('Failed')
        expect(errorLogMock).toHaveBeenCalledTimes(1)
    })

    it('shows top moderators field when cases exist', async () => {
        getStatsMock.mockResolvedValue({ totalCases: 15, activeCases: 3 })
        getRecentCasesMock.mockResolvedValue([
            makeCase('WARN', 'Alice', 1),
            makeCase('BAN', 'Alice', 2),
            makeCase('KICK', 'Bob', 3),
        ])

        const interaction = createInteraction('7d')
        await digestCommand.execute({ interaction, client: {} as any })

        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        const embed = replyArg.content.embeds[0]
        const fields = embed.data?.fields ?? []
        const modField = fields.find((f: any) => f.name.includes('moderator'))
        expect(modField).toBeDefined()
        expect(modField?.value).toContain('Alice')
    })
})
