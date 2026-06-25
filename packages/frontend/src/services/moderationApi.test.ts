import type { AxiosInstance, AxiosResponse } from 'axios'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type {
    ModerationCase,
    ModerationSettings,
    ModerationStats,
} from '@/types'
import {
    createModerationApi,
    type ModerationCaseFilters,
} from './moderationApi'

const apiClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
} as unknown as AxiosInstance

const mockModerationCase: ModerationCase = {
    id: 'case-1',
    caseNumber: 1,
    guildId: 'guild-1',
    userId: 'user-1',
    userName: 'TestUser',
    userAvatar: 'https://example.com/avatar.png',
    moderatorId: 'mod-1',
    moderatorName: 'Moderator',
    type: 'warn',
    reason: 'Spam',
    duration: null,
    expiresAt: null,
    active: true,
    appealed: false,
    appealReason: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
}

const mockModerationStats: ModerationStats = {
    totalCases: 100,
    activeCases: 15,
    recentCases: 5,
    casesByType: {
        warn: 40,
        mute: 30,
        kick: 20,
        ban: 8,
        unban: 1,
        unmute: 1,
    },
}

const mockModerationSettings: ModerationSettings = {
    guildId: 'guild-1',
    logChannelId: 'channel-1',
    muteRoleId: 'role-1',
    dmOnAction: true,
    defaultAction: 'warn',
}

describe('createModerationApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getCases', () => {
        test('calls GET /guilds/:guildId/moderation/cases', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{
                cases: ModerationCase[]
                total: number
            }> = {
                data: {
                    cases: [mockModerationCase],
                    total: 1,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getCases('guild-1')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: undefined },
            )
            expect(result.data.cases).toHaveLength(1)
            expect(result.data.cases[0].id).toBe('case-1')
            expect(result.data.total).toBe(1)
        })

        test('passes pagination parameters in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                page: 2,
                limit: 20,
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes type filter in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                type: 'ban',
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes userId filter in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                userId: 'user-123',
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes moderatorId filter in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                moderatorId: 'mod-123',
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes active filter in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                active: true,
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes search filter in query string', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                search: 'spam',
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('passes multiple filters together', async () => {
            const api = createModerationApi(apiClient)
            const filters: ModerationCaseFilters = {
                page: 1,
                limit: 10,
                type: 'ban',
                userId: 'user-123',
                moderatorId: 'mod-1',
                active: true,
                search: 'raid',
            }

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCases('guild-1', filters)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases',
                { params: filters },
            )
        })

        test('returns axios response with cases and total', async () => {
            const api = createModerationApi(apiClient)
            const case2: ModerationCase = {
                ...mockModerationCase,
                id: 'case-2',
                caseNumber: 2,
                type: 'ban',
            }
            const mockResponse: AxiosResponse<{
                cases: ModerationCase[]
                total: number
            }> = {
                data: {
                    cases: [mockModerationCase, case2],
                    total: 2,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getCases('guild-1')

            expect(result.data.cases).toHaveLength(2)
            expect(result.data.total).toBe(2)
            expect(result.status).toBe(200)
        })
    })

    describe('getCase', () => {
        test('calls GET /guilds/:guildId/moderation/cases/:caseNumber', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ case: ModerationCase }> = {
                data: {
                    case: mockModerationCase,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getCase('guild-1', 1)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/1',
            )
            expect(result.data.case.id).toBe('case-1')
            expect(result.data.case.caseNumber).toBe(1)
        })

        test('includes caseNumber in URL path', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { case: mockModerationCase },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getCase('guild-1', 42)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/42',
            )
        })

        test('returns axios response with case data', async () => {
            const api = createModerationApi(apiClient)
            const customCase: ModerationCase = {
                ...mockModerationCase,
                caseNumber: 99,
                type: 'kick',
                reason: 'Disruptive behavior',
            }
            const mockResponse: AxiosResponse<{ case: ModerationCase }> = {
                data: {
                    case: customCase,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getCase('guild-1', 99)

            expect(result.data.case).toEqual(customCase)
            expect(result.status).toBe(200)
        })
    })

    describe('updateReason', () => {
        test('calls PATCH /guilds/:guildId/moderation/cases/:caseNumber/reason with reason payload', async () => {
            const api = createModerationApi(apiClient)
            const newReason = 'Updated reason'
            const mockResponse: AxiosResponse<{ success: boolean }> = {
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.patch).mockResolvedValue(mockResponse)

            const result = await api.updateReason('guild-1', 1, newReason)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/1/reason',
                { reason: newReason },
            )
            expect(result.data.success).toBe(true)
        })

        test('includes caseNumber in URL path', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateReason('guild-1', 5, 'New reason')

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/5/reason',
                { reason: 'New reason' },
            )
        })

        test('sends reason in request body', async () => {
            const api = createModerationApi(apiClient)
            const reason = 'Spamming in chat'

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateReason('guild-1', 1, reason)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/1/reason',
                { reason },
            )
        })

        test('handles empty reason string', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateReason('guild-1', 1, '')

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/1/reason',
                { reason: '' },
            )
        })

        test('returns axios response with success status', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ success: boolean }> = {
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.patch).mockResolvedValue(mockResponse)

            const result = await api.updateReason('guild-1', 1, 'Updated')

            expect(result.data.success).toBe(true)
            expect(result.status).toBe(200)
        })
    })

    describe('deactivateCase', () => {
        test('calls POST /guilds/:guildId/moderation/cases/:caseId/deactivate', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<ModerationCase> = {
                data: { ...mockModerationCase, active: false },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse)

            const result = await api.deactivateCase('guild-1', 'case-1')

            expect(apiClient.post).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/case-1/deactivate',
            )
            expect(result.data.active).toBe(false)
        })

        test('includes caseId in URL path', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.post).mockResolvedValue({
                data: mockModerationCase,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.deactivateCase('guild-1', 'case-abc-123')

            expect(apiClient.post).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/cases/case-abc-123/deactivate',
            )
        })

        test('returns deactivated case in response', async () => {
            const api = createModerationApi(apiClient)
            const deactivatedCase: ModerationCase = {
                ...mockModerationCase,
                active: false,
                updatedAt: '2024-01-02T00:00:00Z',
            }
            const mockResponse: AxiosResponse<ModerationCase> = {
                data: deactivatedCase,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse)

            const result = await api.deactivateCase('guild-1', 'case-1')

            expect(result.data.active).toBe(false)
            expect(result.data.id).toBe('case-1')
            expect(result.status).toBe(200)
        })
    })

    describe('getStats', () => {
        test('calls GET /guilds/:guildId/moderation/stats', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ stats: ModerationStats }> = {
                data: {
                    stats: mockModerationStats,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getStats('guild-1')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/stats',
            )
            expect(result.data.stats.totalCases).toBe(100)
        })

        test('returns axios response with stats data', async () => {
            const api = createModerationApi(apiClient)
            const customStats: ModerationStats = {
                totalCases: 50,
                activeCases: 5,
                recentCases: 2,
                casesByType: {
                    warn: 20,
                    mute: 15,
                    kick: 10,
                    ban: 4,
                    unban: 1,
                    unmute: 0,
                },
            }
            const mockResponse: AxiosResponse<{ stats: ModerationStats }> = {
                data: {
                    stats: customStats,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getStats('guild-1')

            expect(result.data.stats).toEqual(customStats)
            expect(result.status).toBe(200)
        })

        test('includes all stats properties', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ stats: ModerationStats }> = {
                data: {
                    stats: mockModerationStats,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getStats('guild-1')

            expect(result.data.stats).toHaveProperty('totalCases')
            expect(result.data.stats).toHaveProperty('activeCases')
            expect(result.data.stats).toHaveProperty('recentCases')
            expect(result.data.stats).toHaveProperty('casesByType')
        })
    })

    describe('getSettings', () => {
        test('calls GET /guilds/:guildId/moderation/settings', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{
                settings: ModerationSettings
            }> = {
                data: {
                    settings: mockModerationSettings,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getSettings('guild-1')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/settings',
            )
            expect(result.data.settings.guildId).toBe('guild-1')
        })

        test('returns axios response with settings data', async () => {
            const api = createModerationApi(apiClient)
            const customSettings: ModerationSettings = {
                guildId: 'guild-2',
                logChannelId: 'channel-logs',
                muteRoleId: null,
                dmOnAction: false,
                defaultAction: 'mute',
            }
            const mockResponse: AxiosResponse<{
                settings: ModerationSettings
            }> = {
                data: {
                    settings: customSettings,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getSettings('guild-2')

            expect(result.data.settings).toEqual(customSettings)
            expect(result.status).toBe(200)
        })

        test('includes all settings properties', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{
                settings: ModerationSettings
            }> = {
                data: {
                    settings: mockModerationSettings,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getSettings('guild-1')

            expect(result.data.settings).toHaveProperty('guildId')
            expect(result.data.settings).toHaveProperty('logChannelId')
            expect(result.data.settings).toHaveProperty('muteRoleId')
            expect(result.data.settings).toHaveProperty('dmOnAction')
            expect(result.data.settings).toHaveProperty('defaultAction')
        })
    })

    describe('updateSettings', () => {
        test('calls PATCH /guilds/:guildId/moderation/settings with settings payload', async () => {
            const api = createModerationApi(apiClient)
            const updateData: Partial<ModerationSettings> = {
                dmOnAction: false,
            }
            const mockResponse: AxiosResponse<{
                settings: ModerationSettings
            }> = {
                data: {
                    settings: { ...mockModerationSettings, ...updateData },
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.patch).mockResolvedValue(mockResponse)

            const result = await api.updateSettings('guild-1', updateData)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/settings',
                updateData,
            )
            expect(result.data.settings.dmOnAction).toBe(false)
        })

        test('sends complete settings object in request body', async () => {
            const api = createModerationApi(apiClient)
            const updateData: Partial<ModerationSettings> = {
                logChannelId: 'channel-new',
                muteRoleId: 'role-new',
                dmOnAction: true,
                defaultAction: 'kick',
            }

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: {
                    settings: { ...mockModerationSettings, ...updateData },
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateSettings('guild-1', updateData)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/settings',
                updateData,
            )
        })

        test('handles partial settings update', async () => {
            const api = createModerationApi(apiClient)
            const updateData: Partial<ModerationSettings> = {
                defaultAction: 'ban',
            }

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: {
                    settings: { ...mockModerationSettings, ...updateData },
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateSettings('guild-1', updateData)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/settings',
                { defaultAction: 'ban' },
            )
        })

        test('returns axios response with updated settings', async () => {
            const api = createModerationApi(apiClient)
            const updatedSettings: ModerationSettings = {
                ...mockModerationSettings,
                logChannelId: 'new-channel',
            }
            const mockResponse: AxiosResponse<{
                settings: ModerationSettings
            }> = {
                data: {
                    settings: updatedSettings,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.patch).mockResolvedValue(mockResponse)

            const result = await api.updateSettings('guild-1', {
                logChannelId: 'new-channel',
            })

            expect(result.data.settings.logChannelId).toBe('new-channel')
            expect(result.status).toBe(200)
        })

        test('handles settings with null values', async () => {
            const api = createModerationApi(apiClient)
            const updateData: Partial<ModerationSettings> = {
                logChannelId: null,
                muteRoleId: null,
            }

            vi.mocked(apiClient.patch).mockResolvedValue({
                data: {
                    settings: { ...mockModerationSettings, ...updateData },
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.updateSettings('guild-1', updateData)

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/settings',
                updateData,
            )
        })
    })

    describe('getUserCases', () => {
        test('calls GET /guilds/:guildId/moderation/users/:userId/cases', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ cases: ModerationCase[] }> = {
                data: {
                    cases: [mockModerationCase],
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getUserCases('guild-1', 'user-1')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/users/user-1/cases',
                { params: {} },
            )
            expect(result.data.cases).toHaveLength(1)
        })

        test('includes userId in URL path', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getUserCases('guild-1', 'user-abc-123')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/users/user-abc-123/cases',
                { params: {} },
            )
        })

        test('passes activeOnly=true parameter in query string', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [mockModerationCase] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getUserCases('guild-1', 'user-1', true)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/users/user-1/cases',
                { params: { activeOnly: 'true' } },
            )
        })

        test('passes activeOnly=false as empty params', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getUserCases('guild-1', 'user-1', false)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/users/user-1/cases',
                { params: {} },
            )
        })

        test('passes undefined activeOnly as empty params', async () => {
            const api = createModerationApi(apiClient)

            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            await api.getUserCases('guild-1', 'user-1')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/guild-1/moderation/users/user-1/cases',
                { params: {} },
            )
        })

        test('returns axios response with cases array', async () => {
            const api = createModerationApi(apiClient)
            const case1: ModerationCase = {
                ...mockModerationCase,
                id: 'case-1',
                caseNumber: 1,
            }
            const case2: ModerationCase = {
                ...mockModerationCase,
                id: 'case-2',
                caseNumber: 2,
                type: 'mute',
            }
            const mockResponse: AxiosResponse<{ cases: ModerationCase[] }> = {
                data: {
                    cases: [case1, case2],
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getUserCases('guild-1', 'user-1')

            expect(result.data.cases).toHaveLength(2)
            expect(result.data.cases[0].id).toBe('case-1')
            expect(result.data.cases[1].id).toBe('case-2')
            expect(result.status).toBe(200)
        })

        test('returns empty cases array when user has no cases', async () => {
            const api = createModerationApi(apiClient)
            const mockResponse: AxiosResponse<{ cases: ModerationCase[] }> = {
                data: {
                    cases: [],
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            }

            vi.mocked(apiClient.get).mockResolvedValue(mockResponse)

            const result = await api.getUserCases('guild-1', 'user-no-cases')

            expect(result.data.cases).toHaveLength(0)
            expect(result.data.cases).toEqual([])
        })
    })

    describe('HTTP method verification', () => {
        test('getCases uses GET method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getCases('guild-1')

            expect(apiClient.get).toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })

        test('getCase uses GET method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { case: mockModerationCase },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getCase('guild-1', 1)

            expect(apiClient.get).toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })

        test('updateReason uses PATCH method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.updateReason('guild-1', 1, 'reason')

            expect(apiClient.patch).toHaveBeenCalled()
            expect(apiClient.get).not.toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
        })

        test('deactivateCase uses POST method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.post).mockResolvedValue({
                data: mockModerationCase,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.deactivateCase('guild-1', 'case-1')

            expect(apiClient.post).toHaveBeenCalled()
            expect(apiClient.get).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })

        test('getStats uses GET method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { stats: mockModerationStats },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getStats('guild-1')

            expect(apiClient.get).toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })

        test('getSettings uses GET method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { settings: mockModerationSettings },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getSettings('guild-1')

            expect(apiClient.get).toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })

        test('updateSettings uses PATCH method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { settings: mockModerationSettings },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.updateSettings('guild-1', { dmOnAction: false })

            expect(apiClient.patch).toHaveBeenCalled()
            expect(apiClient.get).not.toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
        })

        test('getUserCases uses GET method', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getUserCases('guild-1', 'user-1')

            expect(apiClient.get).toHaveBeenCalled()
            expect(apiClient.post).not.toHaveBeenCalled()
            expect(apiClient.patch).not.toHaveBeenCalled()
        })
    })

    describe('URL construction', () => {
        test('getCases constructs correct URL with guildId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [], total: 0 },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getCases('my-guild')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/cases',
                expect.any(Object),
            )
        })

        test('getCase constructs correct URL with guildId and caseNumber', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { case: mockModerationCase },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getCase('my-guild', 123)

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/cases/123',
            )
        })

        test('updateReason constructs correct URL with guildId and caseNumber', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { success: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.updateReason('my-guild', 123, 'reason')

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/cases/123/reason',
                expect.any(Object),
            )
        })

        test('deactivateCase constructs correct URL with guildId and caseId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.post).mockResolvedValue({
                data: mockModerationCase,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.deactivateCase('my-guild', 'case-uuid')

            expect(apiClient.post).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/cases/case-uuid/deactivate',
            )
        })

        test('getStats constructs correct URL with guildId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { stats: mockModerationStats },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getStats('my-guild')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/stats',
            )
        })

        test('getSettings constructs correct URL with guildId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { settings: mockModerationSettings },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getSettings('my-guild')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/settings',
            )
        })

        test('updateSettings constructs correct URL with guildId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.patch).mockResolvedValue({
                data: { settings: mockModerationSettings },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.updateSettings('my-guild', {})

            expect(apiClient.patch).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/settings',
                expect.any(Object),
            )
        })

        test('getUserCases constructs correct URL with guildId and userId', () => {
            const api = createModerationApi(apiClient)
            vi.mocked(apiClient.get).mockResolvedValue({
                data: { cases: [] },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
            })

            api.getUserCases('my-guild', 'user-uuid')

            expect(apiClient.get).toHaveBeenCalledWith(
                '/guilds/my-guild/moderation/users/user-uuid/cases',
                expect.any(Object),
            )
        })
    })
})
