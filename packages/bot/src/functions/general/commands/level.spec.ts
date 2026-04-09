import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import levelCommand from './level'

const interactionReplyMock = jest.fn()
const successEmbedMock = jest.fn((title: string, description: string) => ({ type: 'success', title, description }))
const errorEmbedMock = jest.fn((title: string, description: string) => ({ type: 'error', title, description }))
const infoEmbedMock = jest.fn((title: string, description: string) => ({ type: 'info', title, description }))
const buildListPageEmbedMock = jest.fn((items: unknown[], page: unknown, config: unknown) => ({ type: 'list', items, page, config }))
const createLeaderboardPaginationButtonsMock = jest.fn()
const requireGuildMock = jest.fn()
const getMemberXPMock = jest.fn()
const getRankMock = jest.fn()
const getLeaderboardMock = jest.fn()
const upsertConfigMock = jest.fn()
const addRewardMock = jest.fn()
const removeRewardMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
    infoEmbed: (...args: unknown[]) => infoEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildListPageEmbed: (...args: unknown[]) => buildListPageEmbedMock(...args),
}))

jest.mock('../../../utils/music/buttonComponents', () => ({
    createLeaderboardPaginationButtons: (...args: unknown[]) => createLeaderboardPaginationButtonsMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    levelService: {
        getMemberXP: (...args: unknown[]) => getMemberXPMock(...args),
        getRank: (...args: unknown[]) => getRankMock(...args),
        getLeaderboard: (...args: unknown[]) => getLeaderboardMock(...args),
        upsertConfig: (...args: unknown[]) => upsertConfigMock(...args),
        addReward: (...args: unknown[]) => addRewardMock(...args),
        removeReward: (...args: unknown[]) => removeRewardMock(...args),
    },
    xpNeededForLevel: (level: number) => level * level * 100,
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    debugLog: jest.fn(),
}))

function createInteraction(
    subcommand: string,
    opts: Record<string, unknown> = {},
    subcommandGroup: string | null = null,
) {
    return {
        guild: {
            id: 'guild-1',
            members: {
                fetch: jest.fn().mockResolvedValue({ toString: () => '<@user-1>' }),
            },
        },
        user: { id: 'user-1' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getSubcommandGroup: jest.fn(() => subcommandGroup),
            getUser: jest.fn((name: string) => opts[name] ?? null),
            getChannel: jest.fn((name: string) => opts[name] ?? null),
            getInteger: jest.fn((name: string) => opts[name] ?? null),
            getRole: jest.fn((name: string) => opts[name] ?? null),
        },
    } as any
}

describe('level command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        createLeaderboardPaginationButtonsMock.mockReturnValue(null)
    })

    it('rank shows own XP and level', async () => {
        getMemberXPMock.mockResolvedValue({ xp: 250, level: 1 })
        getRankMock.mockResolvedValue(1)
        await levelCommand.execute({ interaction: createInteraction('rank') } as any)
        expect(infoEmbedMock).toHaveBeenCalledWith('Rank', expect.stringContaining('250'))
    })

    it('rank shows level 0 when no XP record', async () => {
        getMemberXPMock.mockResolvedValue(null)
        getRankMock.mockResolvedValue(0)
        await levelCommand.execute({ interaction: createInteraction('rank') } as any)
        expect(infoEmbedMock).toHaveBeenCalledWith('Rank', expect.stringContaining('**Level:** 0'))
    })

    it('leaderboard uses pagination with 5 items per page', async () => {
        getLeaderboardMock.mockResolvedValue([
            { userId: 'u1', level: 5, xp: 2500 },
            { userId: 'u2', level: 3, xp: 900 },
            { userId: 'u3', level: 2, xp: 400 },
            { userId: 'u4', level: 1, xp: 100 },
            { userId: 'u5', level: 1, xp: 50 },
            { userId: 'u6', level: 1, xp: 25 },
        ])
        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)
        expect(buildListPageEmbedMock).toHaveBeenCalled()
        const callArgs = buildListPageEmbedMock.mock.calls[0]
        expect(callArgs[2]?.itemsPerPage).toBe(5)
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: expect.any(Object),
            content: expect.objectContaining({
                components: expect.any(Array),
            }),
        })
    })

    it('leaderboard shows empty state when no data', async () => {
        getLeaderboardMock.mockResolvedValue([])
        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)
        expect(infoEmbedMock).toHaveBeenCalledWith('Leaderboard', expect.stringContaining('No XP recorded'))
    })

    it('setup configures XP system correctly', async () => {
        upsertConfigMock.mockResolvedValue({})
        await levelCommand.execute({
            interaction: createInteraction('setup', { 'xp-per-message': 20, 'cooldown-seconds': 30 }),
        } as any)
        expect(upsertConfigMock).toHaveBeenCalledWith('guild-1', {
            xpPerMessage: 20,
            xpCooldownMs: 30000,
            announceChannel: null,
        })
        expect(successEmbedMock).toHaveBeenCalledWith('Level System Configured', expect.any(String))
    })

    it('reward add assigns role reward for level', async () => {
        addRewardMock.mockResolvedValue({})
        const role = { id: 'role-1', toString: () => '<@&role-1>' }
        await levelCommand.execute({
            interaction: createInteraction('add', { level: 5, role }, 'reward'),
        } as any)
        expect(addRewardMock).toHaveBeenCalledWith('guild-1', 5, 'role-1')
        expect(successEmbedMock).toHaveBeenCalledWith('Reward Added', expect.any(String))
    })

    it('reward remove deletes level reward', async () => {
        removeRewardMock.mockResolvedValue(undefined)
        await levelCommand.execute({
            interaction: createInteraction('remove', { level: 5 }, 'reward'),
        } as any)
        expect(removeRewardMock).toHaveBeenCalledWith('guild-1', 5)
        expect(successEmbedMock).toHaveBeenCalledWith('Reward Removed', expect.any(String))
    })

    it('returns early without guild', async () => {
        requireGuildMock.mockResolvedValue(false)
        await levelCommand.execute({
            interaction: { ...createInteraction('rank'), guild: null },
        } as any)
        expect(getMemberXPMock).not.toHaveBeenCalled()
    })

    it('shows error embed on service failure', async () => {
        getMemberXPMock.mockRejectedValue(new Error('DB error'))
        getRankMock.mockRejectedValue(new Error('DB error'))
        await levelCommand.execute({ interaction: createInteraction('rank') } as any)
        expect(errorEmbedMock).toHaveBeenCalled()
    })

    it('leaderboard with >5 users creates pagination buttons', async () => {
        const users = Array.from({ length: 12 }, (_, i) => ({
            userId: `u${i + 1}`,
            level: 5 - Math.floor(i / 3),
            xp: 2500 - i * 100,
        }))
        getLeaderboardMock.mockResolvedValue(users)
        createLeaderboardPaginationButtonsMock.mockReturnValue({ mock: 'button' })

        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)

        expect(createLeaderboardPaginationButtonsMock).toHaveBeenCalled()
        const callArgs = createLeaderboardPaginationButtonsMock.mock.calls[0]
        expect(callArgs[0]).toBe(0) // current page
        expect(callArgs[1]).toBe(3) // total pages (12 / 5 = 2.4, ceil = 3)
    })

    it('leaderboard with <=5 users does not create pagination buttons', async () => {
        getLeaderboardMock.mockResolvedValue([
            { userId: 'u1', level: 5, xp: 2500 },
            { userId: 'u2', level: 4, xp: 1500 },
            { userId: 'u3', level: 3, xp: 900 },
        ])
        createLeaderboardPaginationButtonsMock.mockReturnValue(null)

        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)

        expect(createLeaderboardPaginationButtonsMock).toHaveBeenCalledWith(0, 1)
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    components: [],
                }),
            }),
        )
    })

    it('leaderboard field values do not exceed 1024 chars', async () => {
        const users = Array.from({ length: 50 }, (_, i) => ({
            userId: `u${i + 1}`,
            level: 10 - Math.floor(i / 10),
            xp: 5000 - i * 50,
        }))
        getLeaderboardMock.mockResolvedValue(users)

        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)

        expect(buildListPageEmbedMock).toHaveBeenCalled()
        const listItems = buildListPageEmbedMock.mock.calls[0][0]
        listItems.forEach((item: { value: string }) => {
            expect(item.value.length).toBeLessThanOrEqual(1024)
        })
    })

    it('getLeaderboard fetches 50 entries for pagination', async () => {
        getLeaderboardMock.mockResolvedValue([])
        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)
        expect(getLeaderboardMock).toHaveBeenCalledWith('guild-1', 50)
    })
})
