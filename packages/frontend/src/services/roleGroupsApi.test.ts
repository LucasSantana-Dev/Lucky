import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createRoleGroupsApi } from './roleGroupsApi'

describe('roleGroupsApi', () => {
    let mockClient: AxiosInstance
    let api: ReturnType<typeof createRoleGroupsApi>

    beforeEach(() => {
        mockClient = {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        } as unknown as AxiosInstance
        api = createRoleGroupsApi(mockClient)
    })

    describe('list', () => {
        test('fetches role groups for a guild', async () => {
            const guildId = 'guild-123'
            const mockGroups = [
                {
                    id: 'group-1',
                    guildId,
                    name: 'Main Roles',
                    color: '0x5865F2',
                    hoist: false,
                    mentionable: false,
                    buttonStyle: 'Primary',
                    defaultEmoji: null,
                },
            ]
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { groups: mockGroups },
            })

            const result = await api.list(guildId)

            expect(mockClient.get).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups`,
            )
            expect(result).toEqual(mockGroups)
        })
    })

    describe('create', () => {
        test('creates a role group from a message', async () => {
            const guildId = 'guild-123'
            const payload = {
                name: 'Styled Roles',
                fromMessageId: 'msg-456',
            }
            const mockResult = {
                id: 'group-1',
                guildId,
                ...payload,
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
                defaultEmoji: null,
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockResult,
            })

            const result = await api.create(guildId, payload)

            expect(mockClient.post).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups`,
                payload,
            )
            expect(result).toEqual(mockResult)
        })
    })

    describe('get', () => {
        test('fetches a single role group', async () => {
            const guildId = 'guild-123'
            const groupId = 'group-1'
            const mockGroup = {
                id: groupId,
                guildId,
                name: 'Main Roles',
                color: '0x5865F2',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
                defaultEmoji: null,
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: mockGroup,
            })

            const result = await api.get(guildId, groupId)

            expect(mockClient.get).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups/${groupId}`,
            )
            expect(result).toEqual(mockGroup)
        })
    })

    describe('updateTemplate', () => {
        test('patches a role group template', async () => {
            const guildId = 'guild-123'
            const groupId = 'group-1'
            const payload = {
                color: '0xFF0000',
                hoist: true,
            }
            const mockResult = {
                id: groupId,
                guildId,
                name: 'Main Roles',
                ...payload,
                mentionable: false,
                buttonStyle: 'Primary',
                defaultEmoji: null,
            }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: mockResult,
            })

            const result = await api.updateTemplate(guildId, groupId, payload)

            expect(mockClient.patch).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups/${groupId}`,
                payload,
            )
            expect(result).toEqual(mockResult)
        })
    })

    describe('addRole', () => {
        test('calls addRole with dryRun=true and returns plan', async () => {
            const guildId = 'guild-123'
            const groupId = 'group-1'
            const payload = {
                name: 'New Role',
                label: 'New Role',
                emoji: '🎮',
                dryRun: true,
            }
            const mockPlan = {
                plan: {
                    roleName: 'New Role',
                    color: '0x5865F2',
                    buttonLabel: 'New Role',
                    emoji: '🎮',
                },
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockPlan,
            })

            const result = await api.addRole(guildId, groupId, payload)

            expect(mockClient.post).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups/${groupId}/roles`,
                payload,
            )
            expect(result).toEqual(mockPlan)
        })

        test('calls addRole with dryRun=false and returns applied result', async () => {
            const guildId = 'guild-123'
            const groupId = 'group-1'
            const payload = {
                name: 'New Role',
                label: 'New Role',
                emoji: '🎮',
                dryRun: false,
            }
            const mockResult = {
                status: 'ok',
                role: {
                    id: 'role-new',
                    name: 'New Role',
                    color: '0x5865F2',
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-new',
                    label: 'New Role',
                    emoji: '🎮',
                },
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockResult,
            })

            const result = await api.addRole(guildId, groupId, payload)

            expect(mockClient.post).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups/${groupId}/roles`,
                payload,
            )
            expect(result).toEqual(mockResult)
        })
    })

    describe('detachRole', () => {
        test('deletes a role from a group', async () => {
            const guildId = 'guild-123'
            const groupId = 'group-1'
            const roleId = 'role-456'
            vi.mocked(mockClient.delete).mockResolvedValueOnce({
                data: { success: true },
            })

            const result = await api.detachRole(guildId, groupId, roleId)

            expect(mockClient.delete).toHaveBeenCalledWith(
                `/guilds/${guildId}/role-groups/${groupId}/roles/${roleId}`,
            )
            expect(result).toBe(true)
        })
    })
})
