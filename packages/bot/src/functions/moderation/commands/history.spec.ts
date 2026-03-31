import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import historyCommand from './history.js'

const getUserCasesMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        getUserCases: (...args: unknown[]) => getUserCasesMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
        displayAvatarURL: jest
            .fn()
            .mockReturnValue('https://example.com/avatar.png'),
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
    } as any
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    channelId = 'channel-123',
    user = null as any,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channelId,
        user: user || { id: userId, tag: userTag },
        options: {
            getUser: jest.fn((name: string, required?: boolean) => {
                if (name === 'user') return createUser()
                return null
            }),
        },
    }

    return interaction as any
}

describe('history command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getUser: jest.fn(),
            },
        } as any

        await historyCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('shows no history message when user has no cases', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        getUserCasesMock.mockResolvedValue([])

        await historyCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: `📋 ${user.tag} has no moderation history.`,
            },
        })
    })

    test('displays moderation history with stats', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = [
            {
                caseNumber: 1,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Spamming',
                createdAt: new Date('2024-01-01'),
            },
            {
                caseNumber: 2,
                type: 'mute',
                active: true,
                appealed: false,
                reason: 'Harassment',
                createdAt: new Date('2024-01-02'),
            },
            {
                caseNumber: 3,
                type: 'ban',
                active: false,
                appealed: true,
                reason: 'Severe violation',
                createdAt: new Date('2024-01-03'),
            },
        ]

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: expect.stringContaining(
                                'Moderation History',
                            ),
                        }),
                    }),
                ]),
            }),
        })
    })

    test('calculates correct statistics from cases', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = [
            {
                caseNumber: 1,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Spam 1',
                createdAt: new Date(),
            },
            {
                caseNumber: 2,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Spam 2',
                createdAt: new Date(),
            },
            {
                caseNumber: 3,
                type: 'mute',
                active: true,
                appealed: false,
                reason: 'Harassment',
                createdAt: new Date(),
            },
            {
                caseNumber: 4,
                type: 'kick',
                active: false,
                appealed: false,
                reason: 'Spam 3',
                createdAt: new Date(),
            },
            {
                caseNumber: 5,
                type: 'ban',
                active: false,
                appealed: true,
                reason: 'Severe',
                createdAt: new Date(),
            },
        ]

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]
        const fields = embed.data.fields

        expect(fields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'Total Cases',
                    value: '5',
                }),
                expect.objectContaining({
                    name: 'Active Cases',
                    value: '3',
                }),
                expect.objectContaining({
                    name: 'Appeals',
                    value: '1',
                }),
                expect.objectContaining({
                    name: '⚠️ Warnings',
                    value: '2',
                }),
                expect.objectContaining({
                    name: '🔇 Mutes',
                    value: '1',
                }),
                expect.objectContaining({
                    name: '👢 Kicks',
                    value: '1',
                }),
                expect.objectContaining({
                    name: '🔨 Bans',
                    value: '1',
                }),
            ]),
        )
    })

    test('displays recent cases timeline', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = [
            {
                caseNumber: 1,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Spamming',
                createdAt: new Date('2024-01-01'),
            },
        ]

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]
        const recentCasesField = embed.data.fields.find(
            (f: any) => f.name === 'Recent Cases',
        )

        expect(recentCasesField).toBeDefined()
        expect(recentCasesField.value).toContain('#1')
        expect(recentCasesField.value).toContain('WARN')
    })

    test('shows pagination footer when more than 10 cases', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = Array.from({ length: 15 }, (_, i) => ({
            caseNumber: i + 1,
            type: 'warn',
            active: true,
            appealed: false,
            reason: `Case ${i + 1}`,
            createdAt: new Date(),
        }))

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]

        expect(embed.data.footer).toBeDefined()
        expect(embed.data.footer.text).toContain('Showing 10 of 15 cases')
    })

    test('shows inactive case status with red circle', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = [
            {
                caseNumber: 1,
                type: 'warn',
                active: false,
                appealed: false,
                reason: 'Resolved',
                createdAt: new Date(),
            },
        ]

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]
        const recentCasesField = embed.data.fields.find(
            (f: any) => f.name === 'Recent Cases',
        )

        expect(recentCasesField.value).toContain('🔴')
    })

    test('shows appeal status with appeal emoji', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        const mockCases = [
            {
                caseNumber: 1,
                type: 'ban',
                active: true,
                appealed: true,
                reason: 'Under appeal',
                createdAt: new Date(),
            },
        ]

        getUserCasesMock.mockResolvedValue(mockCases)

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]
        const recentCasesField = embed.data.fields.find(
            (f: any) => f.name === 'Recent Cases',
        )

        expect(recentCasesField.value).toContain('📝')
    })

    test('logs history view action', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        getUserCasesMock.mockResolvedValue([
            {
                caseNumber: 1,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Test',
                createdAt: new Date(),
            },
        ])

        await historyCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('History for'),
        })
    })

    test('handles error when fetching cases', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        getUserCasesMock.mockRejectedValue(new Error('db error'))

        await historyCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to view user history',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to view user history. Please try again.',
            },
        })
    })

    test('shows user avatar in embed', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        getUserCasesMock.mockResolvedValue([
            {
                caseNumber: 1,
                type: 'warn',
                active: true,
                appealed: false,
                reason: 'Test',
                createdAt: new Date(),
            },
        ])

        await historyCommand.execute({ interaction } as any)

        const embed = interactionReplyMock.mock.calls[0][0].content.embeds[0]

        expect(embed.data.thumbnail).toBeDefined()
        expect(embed.data.thumbnail.url).toContain('avatar.png')
    })
})
