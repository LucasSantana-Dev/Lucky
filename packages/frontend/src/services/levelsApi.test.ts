import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createLevelsApi } from './levelsApi'

describe('createLevelsApi', () => {
    const get = vi.fn()
    const post = vi.fn()
    const patch = vi.fn()
    const del = vi.fn()
    const apiClient = { get, post, patch, delete: del }

    const LEVEL_CONFIG = {
        id: 'cfg-1',
        guildId: 'g1',
        enabled: true,
        xpPerMessage: 10,
        xpCooldownMs: 5000,
        announceChannel: 'ch-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
    }

    const MEMBER_XP = {
        id: 'mx-1',
        guildId: 'g1',
        userId: 'u1',
        displayName: 'Alice',
        xp: 1000,
        level: 5,
        lastXpAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
    }

    const LEVEL_REWARD = {
        id: 'r-1',
        guildId: 'g1',
        level: 5,
        roleId: 'role-1',
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getConfig', () => {
        test('returns config on success', async () => {
            get.mockResolvedValue({ data: { config: LEVEL_CONFIG } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getConfig('g1')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/config')
            expect(result).toEqual(LEVEL_CONFIG)
        })

        test('returns null when config is null', async () => {
            get.mockResolvedValue({ data: { config: null } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getConfig('g1')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/config')
            expect(result).toBeNull()
        })

        test('passes correct guildId in URL', async () => {
            get.mockResolvedValue({ data: { config: LEVEL_CONFIG } })
            const api = createLevelsApi(apiClient as any)
            await api.getConfig('guild-123')
            expect(get).toHaveBeenCalledWith('/guilds/guild-123/levels/config')
        })
    })

    describe('updateConfig', () => {
        test('returns updated config on success', async () => {
            const updatedConfig = { ...LEVEL_CONFIG, enabled: false }
            patch.mockResolvedValue({ data: { config: updatedConfig } })
            const api = createLevelsApi(apiClient as any)
            const input = { enabled: false }
            const result = await api.updateConfig('g1', input)
            expect(patch).toHaveBeenCalledWith(
                '/guilds/g1/levels/config',
                input,
            )
            expect(result).toEqual(updatedConfig)
        })

        test('passes all update fields correctly', async () => {
            patch.mockResolvedValue({ data: { config: LEVEL_CONFIG } })
            const api = createLevelsApi(apiClient as any)
            const input = {
                enabled: true,
                xpPerMessage: 20,
                xpCooldownMs: 10000,
                announceChannel: 'ch-2',
            }
            await api.updateConfig('g1', input)
            expect(patch).toHaveBeenCalledWith(
                '/guilds/g1/levels/config',
                input,
            )
        })

        test('passes correct guildId in URL', async () => {
            patch.mockResolvedValue({ data: { config: LEVEL_CONFIG } })
            const api = createLevelsApi(apiClient as any)
            await api.updateConfig('guild-456', { enabled: true })
            expect(patch).toHaveBeenCalledWith(
                '/guilds/guild-456/levels/config',
                expect.anything(),
            )
        })
    })

    describe('getLeaderboard', () => {
        test('returns leaderboard on success', async () => {
            const leaderboard = [MEMBER_XP]
            get.mockResolvedValue({ data: { leaderboard } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getLeaderboard('g1', 10)
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/leaderboard', {
                params: { limit: 10 },
            })
            expect(result).toEqual(leaderboard)
        })

        test('uses default limit of 10 when not provided', async () => {
            const leaderboard = [MEMBER_XP]
            get.mockResolvedValue({ data: { leaderboard } })
            const api = createLevelsApi(apiClient as any)
            await api.getLeaderboard('g1')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/leaderboard', {
                params: { limit: 10 },
            })
        })

        test('passes custom limit correctly', async () => {
            const leaderboard = [MEMBER_XP, MEMBER_XP]
            get.mockResolvedValue({ data: { leaderboard } })
            const api = createLevelsApi(apiClient as any)
            await api.getLeaderboard('g1', 50)
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/leaderboard', {
                params: { limit: 50 },
            })
        })

        test('returns empty array when no members', async () => {
            get.mockResolvedValue({ data: { leaderboard: [] } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getLeaderboard('g1')
            expect(result).toEqual([])
        })

        test('passes correct guildId in URL', async () => {
            get.mockResolvedValue({ data: { leaderboard: [] } })
            const api = createLevelsApi(apiClient as any)
            await api.getLeaderboard('guild-xyz', 25)
            expect(get).toHaveBeenCalledWith(
                '/guilds/guild-xyz/levels/leaderboard',
                { params: { limit: 25 } },
            )
        })
    })

    describe('getRank', () => {
        test('returns rank and memberXp on success', async () => {
            const response = { memberXp: MEMBER_XP, rank: 5 }
            get.mockResolvedValue({ data: response })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getRank('g1', 'u1')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/rank/u1')
            expect(result).toEqual(response)
        })

        test('passes userId in URL correctly', async () => {
            const response = { memberXp: MEMBER_XP, rank: 1 }
            get.mockResolvedValue({ data: response })
            const api = createLevelsApi(apiClient as any)
            await api.getRank('g1', 'user-999')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/rank/user-999')
        })

        test('passes correct guildId and userId in URL', async () => {
            const response = { memberXp: MEMBER_XP, rank: 10 }
            get.mockResolvedValue({ data: response })
            const api = createLevelsApi(apiClient as any)
            await api.getRank('guild-abc', 'user-def')
            expect(get).toHaveBeenCalledWith(
                '/guilds/guild-abc/levels/rank/user-def',
            )
        })
    })

    describe('getRewards', () => {
        test('returns rewards on success', async () => {
            const rewards = [LEVEL_REWARD]
            get.mockResolvedValue({ data: { rewards } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getRewards('g1')
            expect(get).toHaveBeenCalledWith('/guilds/g1/levels/rewards')
            expect(result).toEqual(rewards)
        })

        test('returns empty array when no rewards', async () => {
            get.mockResolvedValue({ data: { rewards: [] } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getRewards('g1')
            expect(result).toEqual([])
        })

        test('passes correct guildId in URL', async () => {
            get.mockResolvedValue({ data: { rewards: [] } })
            const api = createLevelsApi(apiClient as any)
            await api.getRewards('guild-rewards-test')
            expect(get).toHaveBeenCalledWith(
                '/guilds/guild-rewards-test/levels/rewards',
            )
        })

        test('returns multiple rewards', async () => {
            const rewards = [
                LEVEL_REWARD,
                { ...LEVEL_REWARD, id: 'r-2', level: 10, roleId: 'role-2' },
                { ...LEVEL_REWARD, id: 'r-3', level: 20, roleId: 'role-3' },
            ]
            get.mockResolvedValue({ data: { rewards } })
            const api = createLevelsApi(apiClient as any)
            const result = await api.getRewards('g1')
            expect(result).toEqual(rewards)
        })
    })

    describe('addReward', () => {
        test('returns reward on success', async () => {
            post.mockResolvedValue({ data: { reward: LEVEL_REWARD } })
            const api = createLevelsApi(apiClient as any)
            const input = { level: 5, roleId: 'role-1' }
            const result = await api.addReward('g1', input)
            expect(post).toHaveBeenCalledWith(
                '/guilds/g1/levels/rewards',
                input,
            )
            expect(result).toEqual(LEVEL_REWARD)
        })

        test('passes correct data structure', async () => {
            post.mockResolvedValue({ data: { reward: LEVEL_REWARD } })
            const api = createLevelsApi(apiClient as any)
            const input = { level: 10, roleId: 'role-999' }
            await api.addReward('g1', input)
            expect(post).toHaveBeenCalledWith(
                '/guilds/g1/levels/rewards',
                input,
            )
        })

        test('passes correct guildId in URL', async () => {
            post.mockResolvedValue({ data: { reward: LEVEL_REWARD } })
            const api = createLevelsApi(apiClient as any)
            await api.addReward('guild-post', { level: 5, roleId: 'role-1' })
            expect(post).toHaveBeenCalledWith(
                '/guilds/guild-post/levels/rewards',
                expect.anything(),
            )
        })
    })

    describe('removeReward', () => {
        test('calls delete with correct URL on success', async () => {
            del.mockResolvedValue({})
            const api = createLevelsApi(apiClient as any)
            await api.removeReward('g1', 5)
            expect(del).toHaveBeenCalledWith('/guilds/g1/levels/rewards/5')
        })

        test('passes level in URL correctly', async () => {
            del.mockResolvedValue({})
            const api = createLevelsApi(apiClient as any)
            await api.removeReward('g1', 20)
            expect(del).toHaveBeenCalledWith('/guilds/g1/levels/rewards/20')
        })

        test('passes correct guildId and level in URL', async () => {
            del.mockResolvedValue({})
            const api = createLevelsApi(apiClient as any)
            await api.removeReward('guild-del', 15)
            expect(del).toHaveBeenCalledWith(
                '/guilds/guild-del/levels/rewards/15',
            )
        })

        test('returns void on success', async () => {
            del.mockResolvedValue({})
            const api = createLevelsApi(apiClient as any)
            const result = await api.removeReward('g1', 5)
            expect(result).toBeUndefined()
        })
    })
})
