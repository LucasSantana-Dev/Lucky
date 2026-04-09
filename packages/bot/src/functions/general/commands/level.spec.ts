import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import levelCommand from './level'

const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, description: string) => ({ type: 'success', title, description }))
const createErrorEmbedMock = jest.fn((title: string, description: string) => ({ type: 'error', title, description }))
const createInfoEmbedMock = jest.fn((title: string, description: string) => ({ type: 'info', title, description }))
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
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createInfoEmbed: (...args: unknown[]) => createInfoEmbedMock(...args),
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
    })

    it('rank shows own XP and level', async () => {
        getMemberXPMock.mockResolvedValue({ xp: 250, level: 1 })
        getRankMock.mockResolvedValue(1)
        await levelCommand.execute({ interaction: createInteraction('rank') } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith('Rank', expect.stringContaining('250'))
    })

    it('rank shows level 0 when no XP record', async () => {
        getMemberXPMock.mockResolvedValue(null)
        getRankMock.mockResolvedValue(0)
        await levelCommand.execute({ interaction: createInteraction('rank') } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith('Rank', expect.stringContaining('**Level:** 0'))
    })

    it('leaderboard lists top users', async () => {
        getLeaderboardMock.mockResolvedValue([
            { userId: 'u1', level: 5, xp: 2500 },
            { userId: 'u2', level: 3, xp: 900 },
        ])
        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith('XP Leaderboard', expect.stringContaining('2500'))
    })

    it('leaderboard shows empty state when no data', async () => {
        getLeaderboardMock.mockResolvedValue([])
        await levelCommand.execute({ interaction: createInteraction('leaderboard') } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith('Leaderboard', expect.stringContaining('No XP recorded'))
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
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Level System Configured', expect.any(String))
    })

    it('reward add assigns role reward for level', async () => {
        addRewardMock.mockResolvedValue({})
        const role = { id: 'role-1', toString: () => '<@&role-1>' }
        await levelCommand.execute({
            interaction: createInteraction('add', { level: 5, role }, 'reward'),
        } as any)
        expect(addRewardMock).toHaveBeenCalledWith('guild-1', 5, 'role-1')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Reward Added', expect.any(String))
    })

    it('reward remove deletes level reward', async () => {
        removeRewardMock.mockResolvedValue(undefined)
        await levelCommand.execute({
            interaction: createInteraction('remove', { level: 5 }, 'reward'),
        } as any)
        expect(removeRewardMock).toHaveBeenCalledWith('guild-1', 5)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Reward Removed', expect.any(String))
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
        expect(createErrorEmbedMock).toHaveBeenCalled()
    })
})
