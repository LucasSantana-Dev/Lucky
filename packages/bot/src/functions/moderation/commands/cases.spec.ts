import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import casesCommand from './cases.js'

const getUserCasesMock = jest.fn()
const getStatsMock = jest.fn()
const getRecentCasesMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        getUserCases: (...args: unknown[]) => getUserCasesMock(...args),
        getStats: (...args: unknown[]) => getStatsMock(...args),
        getRecentCases: (...args: unknown[]) => getRecentCasesMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createCase(
    overrides: {
        caseNumber?: number
        type?: string
        username?: string
        active?: boolean
        appealed?: boolean
        createdAt?: Date
    } = {},
) {
    return {
        caseNumber: overrides.caseNumber ?? 1,
        type: overrides.type ?? 'warn',
        username: overrides.username ?? 'User#1234',
        active: overrides.active ?? true,
        appealed: overrides.appealed ?? false,
        createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    }
}

function createUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
    } as any
}

function createGuild(id = 'guild-123') {
    return {
        id,
        name: 'Test Guild',
    } as any
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    user = null as any,
    targetUser = null as any,
    type = null as string | null,
    page = null as number | null,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        user: user || { id: userId, tag: userTag },
        options: {
            getUser: jest.fn((name: string) => {
                if (name === 'user') return targetUser
                return null
            }),
            getString: jest.fn((name: string) => {
                if (name === 'type') return type
                return null
            }),
            getInteger: jest.fn((name: string) => {
                if (name === 'page') return page
                return null
            }),
        },
    }

    return interaction as any
}

describe('cases command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getUserCasesMock.mockResolvedValue([])
        getStatsMock.mockResolvedValue({ totalCases: 0 })
        getRecentCasesMock.mockResolvedValue([])
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getUser: jest.fn(),
                getString: jest.fn(),
                getInteger: jest.fn(),
            },
        } as any

        await casesCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('shows no cases message when no cases found', async () => {
        const interaction = createInteraction()

        await casesCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '📋 No cases found matching the criteria.',
            },
        })
    })

    test('lists all cases for guild', async () => {
        const interaction = createInteraction()
        const cases = [
            createCase({ caseNumber: 1, type: 'warn' }),
            createCase({ caseNumber: 2, type: 'ban' }),
        ]
        getStatsMock.mockResolvedValue({ totalCases: 2 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        expect(getRecentCasesMock).toHaveBeenCalledWith('guild-123', 1000)
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: expect.objectContaining({
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '📋 Moderation Cases',
                        }),
                    }),
                ],
            }),
        })
        expect(infoLogMock).toHaveBeenCalled()
    })

    test('filters cases by user', async () => {
        const interaction = createInteraction({
            targetUser: createUser('user-123', 'Target#1234'),
        })
        const cases = [
            createCase({ caseNumber: 1, username: 'Target#1234' }),
            createCase({ caseNumber: 2, username: 'Target#1234' }),
        ]
        getUserCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        expect(getUserCasesMock).toHaveBeenCalledWith(
            'guild-123',
            'user-123',
            false,
        )
        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const filterField = embed.data.fields.find(
            (f: any) => f.name === 'Filtered By',
        )
        expect(filterField).toBeDefined()
        expect(filterField.value).toContain('Target#1234')
    })

    test('filters cases by type', async () => {
        const interaction = createInteraction({ type: 'ban' })
        const allCases = [
            createCase({ caseNumber: 1, type: 'warn' }),
            createCase({ caseNumber: 2, type: 'ban' }),
            createCase({ caseNumber: 3, type: 'ban' }),
        ]
        getStatsMock.mockResolvedValue({ totalCases: 3 })
        getRecentCasesMock.mockResolvedValue(allCases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const typeField = embed.data.fields.find(
            (f: any) => f.name === 'Type Filter',
        )
        expect(typeField).toBeDefined()
        expect(typeField.value).toBe('BAN')
    })

    test('filters cases by user and type', async () => {
        const interaction = createInteraction({
            targetUser: createUser('user-123', 'Target#1234'),
            type: 'ban',
        })
        const cases = [
            createCase({ caseNumber: 1, type: 'warn' }),
            createCase({ caseNumber: 2, type: 'ban' }),
        ]
        getUserCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        expect(getUserCasesMock).toHaveBeenCalledWith(
            'guild-123',
            'user-123',
            false,
        )
    })

    test('paginates results with 10 items per page', async () => {
        const interaction = createInteraction({ page: 2 })
        const cases = Array.from({ length: 25 }, (_, i) =>
            createCase({ caseNumber: i + 1 }),
        )
        getStatsMock.mockResolvedValue({ totalCases: 25 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        expect(embed.data.footer.text).toContain('Page 2/3')
        expect(embed.data.footer.text).toContain('Total Cases: 25')
    })

    test('defaults to page 1 when page not specified', async () => {
        const interaction = createInteraction()
        const cases = [createCase({ caseNumber: 1 })]
        getStatsMock.mockResolvedValue({ totalCases: 1 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        expect(embed.data.footer.text).toContain('Page 1/1')
    })

    test('adds pagination buttons when multiple pages exist', async () => {
        const interaction = createInteraction({ page: 2 })
        const cases = Array.from({ length: 30 }, (_, i) =>
            createCase({ caseNumber: i + 1 }),
        )
        getStatsMock.mockResolvedValue({ totalCases: 30 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        expect(embedCall.content.components).toHaveLength(1)
        expect(embedCall.content.components[0].components).toHaveLength(2)
        expect(embedCall.content.components[0].components[0].data.label).toBe(
            'Previous',
        )
        expect(embedCall.content.components[0].components[1].data.label).toBe(
            'Next',
        )
    })

    test('disables previous button on first page', async () => {
        const interaction = createInteraction({ page: 1 })
        const cases = Array.from({ length: 30 }, (_, i) =>
            createCase({ caseNumber: i + 1 }),
        )
        getStatsMock.mockResolvedValue({ totalCases: 30 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const prevButton = embedCall.content.components[0].components[0]
        expect(prevButton.data.disabled).toBe(true)
    })

    test('disables next button on last page', async () => {
        const interaction = createInteraction({ page: 3 })
        const cases = Array.from({ length: 30 }, (_, i) =>
            createCase({ caseNumber: i + 1 }),
        )
        getStatsMock.mockResolvedValue({ totalCases: 30 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const nextButton = embedCall.content.components[0].components[1]
        expect(nextButton.data.disabled).toBe(true)
    })

    test('does not add pagination buttons for single page', async () => {
        const interaction = createInteraction()
        const cases = [createCase({ caseNumber: 1 })]
        getStatsMock.mockResolvedValue({ totalCases: 1 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        expect(embedCall.content.components).toHaveLength(0)
    })

    test('displays case status indicators correctly', async () => {
        const interaction = createInteraction()
        const cases = [
            createCase({ caseNumber: 1, active: true, appealed: false }),
            createCase({ caseNumber: 2, active: false, appealed: true }),
        ]
        getStatsMock.mockResolvedValue({ totalCases: 2 })
        getRecentCasesMock.mockResolvedValue(cases)

        await casesCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        expect(embed.data.description).toContain('🟢')
        expect(embed.data.description).toContain('🔴📝')
    })

    test('handles error gracefully', async () => {
        const interaction = createInteraction()
        getStatsMock.mockRejectedValue(new Error('Database error'))

        await casesCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to list cases',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to list cases. Please try again.',
            },
        })
    })
})
