import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Levels from './Levels'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import type { MemberXP, LevelReward, LevelConfig } from '@/services/levelsApi'
import type { GuildRoleOption } from '@/types'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api')
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockGuild = {
    id: '123456',
    name: 'Test Guild',
    icon: null,
    memberCount: 100,
}

const mockLeaderboard: MemberXP[] = [
    {
        id: '1',
        guildId: '123456',
        userId: '111',
        xp: 1500,
        level: 5,
        lastXpAt: new Date('2024-01-15').toISOString(),
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-15').toISOString(),
    },
    {
        id: '2',
        guildId: '123456',
        userId: '222',
        xp: 800,
        level: 3,
        lastXpAt: new Date('2024-01-14').toISOString(),
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-14').toISOString(),
    },
]

const mockRewards: LevelReward[] = [
    { id: '1', guildId: '123456', level: 5, roleId: 'role-1' },
    { id: '2', guildId: '123456', level: 10, roleId: 'role-2' },
]

const mockRoles: GuildRoleOption[] = [
    { id: 'role-1', name: 'Veteran', color: 0, position: 1 },
    { id: 'role-2', name: 'Legend', color: 0, position: 2 },
]

const mockConfig: LevelConfig = {
    id: 'config-1',
    guildId: '123456',
    enabled: true,
    xpPerMessage: 15,
    xpCooldownMs: 60000,
    announceChannel: '999',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
}

function mockGuildStore(selectedGuild: typeof mockGuild | null = mockGuild) {
    vi.mocked(useGuildStore).mockReturnValue({
        selectedGuild,
    } as ReturnType<typeof useGuildStore>)
}

describe('Levels', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.levels.getConfig).mockResolvedValue(mockConfig)
        vi.mocked(api.levels.getLeaderboard).mockResolvedValue(mockLeaderboard)
        vi.mocked(api.levels.getRewards).mockResolvedValue(mockRewards)
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: { roles: mockRoles },
        } as never)
    })

    test('renders empty state when no guild is selected', () => {
        mockGuildStore(null)
        render(<Levels />)
        expect(screen.getByText('No server selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to view level settings'),
        ).toBeInTheDocument()
    })

    test('renders loading skeletons initially', () => {
        mockGuildStore()
        const { container } = render(<Levels />)
        const skeletons = container.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('loads and displays leaderboard data', async () => {
        mockGuildStore()
        render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getLeaderboard).toHaveBeenCalledWith('123456', 20)
        })

        expect(await screen.findByText('111')).toBeInTheDocument()
        expect(screen.getByText('222')).toBeInTheDocument()
        expect(screen.getByText('1,500 XP')).toBeInTheDocument()
        expect(screen.getByText('800 XP')).toBeInTheDocument()
    })

    test('displays empty state when leaderboard is empty', async () => {
        mockGuildStore()
        vi.mocked(api.levels.getLeaderboard).mockResolvedValue([])
        render(<Levels />)

        expect(await screen.findByText('No data yet')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Members gain XP by chatting once the level system is enabled',
            ),
        ).toBeInTheDocument()
    })

    test('loads and displays config settings', async () => {
        mockGuildStore()
        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getConfig).toHaveBeenCalledWith('123456')
        })

        const enableSwitch = screen.getByRole('switch', { name: /enable xp/i })
        expect(enableSwitch).toBeChecked()

        const inputs = container.querySelectorAll(
            'input[type="number"]',
        ) as NodeListOf<HTMLInputElement>
        const xpInput = Array.from(inputs).find(
            (input) => Number(input.value) === 15,
        )
        expect(xpInput).toBeDefined()
        expect(Number(xpInput?.value)).toBe(15)

        const cooldownInput = Array.from(inputs).find(
            (input) => Number(input.value) === 60000,
        )
        expect(cooldownInput).toBeDefined()
        expect(Number(cooldownInput?.value)).toBe(60000)

        const channelInput = screen.getByPlaceholderText(
            /channel id \(optional\)/i,
        )
        expect(channelInput).toHaveValue('999')
    })

    test('loads and displays role rewards', async () => {
        mockGuildStore()
        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getRewards).toHaveBeenCalledWith('123456')
        })

        expect(await screen.findByText('Veteran')).toBeInTheDocument()
        expect(screen.getByText('Legend')).toBeInTheDocument()
        const rewards = container.querySelectorAll('.text-lucky-brand')
        expect(rewards[0].textContent).toContain('Lv.5')
        expect(rewards[1].textContent).toContain('Lv.10')
    })

    test('handles config save successfully', async () => {
        mockGuildStore()
        vi.mocked(api.levels.updateConfig).mockResolvedValue(undefined as never)
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save settings/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', {
            name: /save settings/i,
        })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(api.levels.updateConfig).toHaveBeenCalledWith('123456', {
                enabled: true,
                xpPerMessage: 15,
                xpCooldownMs: 60000,
                announceChannel: '999',
            })
        })

        expect(toast.success).toHaveBeenCalledWith('Level settings saved')
    })

    test('handles config save failure', async () => {
        mockGuildStore()
        vi.mocked(api.levels.updateConfig).mockRejectedValue(
            new Error('API error'),
        )
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save settings/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', {
            name: /save settings/i,
        })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
        })
    })

    test('toggles enable switch', async () => {
        mockGuildStore()
        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByRole('switch', { name: /enable xp/i }),
            ).toBeInTheDocument()
        })

        const enableSwitch = screen.getByRole('switch', { name: /enable xp/i })
        expect(enableSwitch).toBeChecked()

        fireEvent.click(enableSwitch)
        expect(enableSwitch).not.toBeChecked()
    })

    test('updates xp per message input', async () => {
        mockGuildStore()
        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getConfig).toHaveBeenCalled()
        })

        const inputs = container.querySelectorAll(
            'input[type="number"]',
        ) as NodeListOf<HTMLInputElement>
        const xpInput = Array.from(inputs).find(
            (input) => Number(input.min) === 1 && Number(input.max) === 1000,
        )
        expect(xpInput).toBeDefined()

        if (xpInput) {
            fireEvent.change(xpInput, { target: { value: '25' } })
            expect(xpInput.value).toBe('25')
        }
    })

    test('updates cooldown input', async () => {
        mockGuildStore()
        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getConfig).toHaveBeenCalled()
        })

        const cooldownInput = container.querySelector(
            'input[type="number"][value="60000"]',
        ) as HTMLInputElement
        fireEvent.change(cooldownInput, { target: { value: '90000' } })

        expect(cooldownInput.value).toBe('90000')
    })

    test('updates announce channel input', async () => {
        mockGuildStore()
        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByPlaceholderText(/channel id \(optional\)/i),
            ).toBeInTheDocument()
        })

        const channelInput = screen.getByPlaceholderText(
            /channel id \(optional\)/i,
        ) as HTMLInputElement
        fireEvent.change(channelInput, { target: { value: '888' } })

        expect(channelInput.value).toBe('888')
    })

    test('adds a new reward successfully', async () => {
        mockGuildStore()
        const newReward: LevelReward = {
            id: '3',
            guildId: '123456',
            level: 15,
            roleId: 'role-3',
        }
        vi.mocked(api.levels.addReward).mockResolvedValue(newReward)
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('e.g. 5')).toBeInTheDocument()
        })

        const levelInput = screen.getByPlaceholderText('e.g. 5')
        const roleInput = screen.getByPlaceholderText('Role ID')
        const addButton = screen.getByRole('button', { name: /add reward/i })

        fireEvent.change(levelInput, { target: { value: '15' } })
        fireEvent.change(roleInput, { target: { value: 'role-3' } })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(api.levels.addReward).toHaveBeenCalledWith('123456', {
                level: 15,
                roleId: 'role-3',
            })
        })

        expect(toast.success).toHaveBeenCalledWith('Reward added for level 15')
    })

    test('disables add reward button when inputs are empty', async () => {
        mockGuildStore()
        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /add reward/i }),
            ).toBeInTheDocument()
        })

        const addButton = screen.getByRole('button', { name: /add reward/i })
        expect(addButton).toBeDisabled()
    })

    test('handles add reward failure', async () => {
        mockGuildStore()
        vi.mocked(api.levels.addReward).mockRejectedValue(
            new Error('API error'),
        )
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('e.g. 5')).toBeInTheDocument()
        })

        const levelInput = screen.getByPlaceholderText('e.g. 5')
        const roleInput = screen.getByPlaceholderText('Role ID')
        const addButton = screen.getByRole('button', { name: /add reward/i })

        fireEvent.change(levelInput, { target: { value: '20' } })
        fireEvent.change(roleInput, { target: { value: 'role-4' } })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to add reward')
        })
    })

    test('removes a reward successfully', async () => {
        mockGuildStore()
        vi.mocked(api.levels.removeReward).mockResolvedValue(undefined as never)
        const { toast } = await import('sonner')

        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(screen.getByText('Veteran')).toBeInTheDocument()
        })

        const deleteIcons = container.querySelectorAll('svg')
        const trashIcon = Array.from(deleteIcons).find(
            (svg) =>
                svg.closest('button') &&
                svg.closest('.bg-lucky-bg-secondary\\/50'),
        )
        const removeButton = trashIcon?.closest('button')

        expect(removeButton).toBeDefined()
        if (removeButton) {
            fireEvent.click(removeButton)
        }

        await waitFor(() => {
            expect(api.levels.removeReward).toHaveBeenCalledWith('123456', 5)
        })

        expect(toast.success).toHaveBeenCalledWith('Reward removed')
    })

    test('handles remove reward failure', async () => {
        mockGuildStore()
        vi.mocked(api.levels.removeReward).mockRejectedValue(
            new Error('API error'),
        )
        const { toast } = await import('sonner')

        const { container } = render(<Levels />)

        await waitFor(() => {
            expect(screen.getByText('Veteran')).toBeInTheDocument()
        })

        const deleteIcons = container.querySelectorAll('svg')
        const trashIcon = Array.from(deleteIcons).find(
            (svg) =>
                svg.closest('button') &&
                svg.closest('.bg-lucky-bg-secondary\\/50'),
        )
        const removeButton = trashIcon?.closest('button')

        expect(removeButton).toBeDefined()
        if (removeButton) {
            fireEvent.click(removeButton)
        }

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to remove reward')
        })
    })

    test('handles API error when loading data', async () => {
        mockGuildStore()
        vi.mocked(api.levels.getConfig).mockRejectedValue(
            new ApiError(500, 'Server error'),
        )
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to load level settings',
            )
        })
    })

    test('ignores 404 errors when loading config', async () => {
        mockGuildStore()
        vi.mocked(api.levels.getConfig).mockResolvedValue(null as never)
        vi.mocked(api.levels.getLeaderboard).mockResolvedValue([])
        vi.mocked(api.levels.getRewards).mockResolvedValue([])
        const { toast } = await import('sonner')

        render(<Levels />)

        await waitFor(() => {
            expect(api.levels.getConfig).toHaveBeenCalled()
        })

        expect(toast.error).not.toHaveBeenCalled()
    })

    test('displays no rewards message when list is empty', async () => {
        mockGuildStore()
        vi.mocked(api.levels.getRewards).mockResolvedValue([])

        render(<Levels />)

        expect(
            await screen.findByText('No rewards configured'),
        ).toBeInTheDocument()
    })

    test('handles RBAC fetch failure gracefully', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getRbac).mockRejectedValue(new Error('RBAC error'))

        render(<Levels />)

        await waitFor(() => {
            expect(api.guilds.getRbac).toHaveBeenCalled()
        })

        expect(await screen.findByText('111')).toBeInTheDocument()
    })

    test('displays role ID when role name is not found', async () => {
        mockGuildStore()
        const rewardWithUnknownRole: LevelReward[] = [
            { id: '1', guildId: '123456', level: 5, roleId: 'unknown-role' },
        ]
        vi.mocked(api.levels.getRewards).mockResolvedValue(
            rewardWithUnknownRole,
        )

        const { container } = render(<Levels />)

        expect(await screen.findByText('unknown-role')).toBeInTheDocument()
        const rewards = container.querySelectorAll('.text-lucky-brand')
        expect(rewards[0].textContent).toContain('Lv.5')
    })

    test('shows saving state on save button', async () => {
        mockGuildStore()
        vi.mocked(api.levels.updateConfig).mockImplementation(
            () => new Promise(() => {}),
        )

        render(<Levels />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save settings/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', {
            name: /save settings/i,
        })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(saveButton).toBeDisabled()
        })
    })

    test('shows adding state on add reward button', async () => {
        mockGuildStore()
        vi.mocked(api.levels.addReward).mockImplementation(
            () => new Promise(() => {}),
        )

        render(<Levels />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('e.g. 5')).toBeInTheDocument()
        })

        const levelInput = screen.getByPlaceholderText('e.g. 5')
        const roleInput = screen.getByPlaceholderText('Role ID')
        const addButton = screen.getByRole('button', { name: /add reward/i })

        fireEvent.change(levelInput, { target: { value: '15' } })
        fireEvent.change(roleInput, { target: { value: 'role-3' } })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(addButton).toBeDisabled()
        })
    })
})
