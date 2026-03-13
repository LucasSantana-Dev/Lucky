import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsPage from './ServerSettings'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { ApiError } from '@/services/ApiError'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockGuild = { id: '123', name: 'Test Guild', canManageRbac: false }
const mockSettings = {
    nickname: 'Lucky',
    commandPrefix: '!',
    managerRoles: [],
    updatesChannel: '',
    timezone: 'UTC',
    disableWarnings: false,
}

const defaultAccess = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
} as const

function mockGuildStoreFn(guild: typeof mockGuild | null, memberContext?: any) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        memberContext: memberContext ?? null,
        memberContextLoading: false,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () =>
    render(
        <MemoryRouter>
            <ServerSettingsPage />
        </MemoryRouter>,
    )

describe('ServerSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: mockGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [],
                roles: [],
                effectiveAccess: defaultAccess,
                canManageRbac: false,
            },
        } as any)
        vi.mocked(api.guilds.updateRbac).mockResolvedValue({
            data: { success: true, grants: [] },
        } as any)
    })

    test('shows no server selected when no guild', () => {
        mockGuildStoreFn(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to manage settings'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders settings form on success', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Settings')).toBeInTheDocument()
        })

        expect(
            screen.getByText(/General configuration for Test Guild/),
        ).toBeInTheDocument()
        expect(screen.getByText('General')).toBeInTheDocument()
        expect(screen.getByText('Region & Notifications')).toBeInTheDocument()
        expect(screen.getByText('Disable Command Warnings')).toBeInTheDocument()
    })

    test('renders nickname and prefix inputs', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Lucky')).toBeInTheDocument()
        })

        expect(screen.getByPlaceholderText('!')).toBeInTheDocument()
    })

    test('save button calls updateSettings', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Settings')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]
        await user.click(saveButton)

        await waitFor(() => {
            expect(api.guilds.updateSettings).toHaveBeenCalledWith(
                '123',
                expect.objectContaining({
                    nickname: 'Lucky',
                    commandPrefix: '!',
                }),
            )
        })
    })

    test('save success shows toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Settings')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]
        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Server settings saved!')
        })
    })

    test('save failure shows error toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.updateSettings).mockRejectedValue(
            new Error('fail'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Settings')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]
        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
        })
    })

    test('warnings switch toggles', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Disable Command Warnings'),
            ).toBeInTheDocument()
        })

        const warningSwitch = screen.getByRole('switch')
        expect(warningSwitch).not.toBeChecked()

        await user.click(warningSwitch)
        expect(warningSwitch).toBeChecked()
    })

    test('shows actionable load error and retry when settings fetch fails', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockRejectedValue(
            new ApiError(502, 'Discord API unavailable'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Unable to load server settings'),
            ).toBeInTheDocument()
        })

        expect(screen.getByText('Discord API unavailable')).toBeInTheDocument()

        vi.mocked(api.guilds.getSettings).mockResolvedValueOnce({
            data: { settings: mockSettings },
        } as any)

        await user.click(screen.getByRole('button', { name: 'Retry' }))

        await waitFor(() => {
            expect(screen.getByText('General')).toBeInTheDocument()
        })
    })

    test('shows RBAC manager message when user cannot manage policy', async () => {
        mockGuildStoreFn({ ...mockGuild, canManageRbac: false })

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Access Control')).toBeInTheDocument()
        })

        expect(
            screen.getByText(
                /Only server owner or users with Administrator\/Manage Server permission can manage RBAC policy/i,
            ),
        ).toBeInTheDocument()
        expect(api.guilds.getRbac).not.toHaveBeenCalled()
    })

    test('loads RBAC policy and saves newly added rule', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')

        const managerGuild = { ...mockGuild, canManageRbac: true }
        const roles = [{ id: '222222222222222222', name: 'Mods' }]

        mockGuildStoreFn(managerGuild, {
            canManageRbac: true,
            effectiveAccess: defaultAccess,
        })
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: managerGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [],
                roles,
                effectiveAccess: defaultAccess,
                canManageRbac: true,
            },
        } as any)
        vi.mocked(api.guilds.updateRbac).mockResolvedValue({
            data: {
                success: true,
                grants: [
                    {
                        roleId: roles[0].id,
                        module: 'overview',
                        mode: 'view',
                    },
                ],
            },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(api.guilds.getRbac).toHaveBeenCalledWith(managerGuild.id)
        })

        await user.click(screen.getByRole('button', { name: /Add Rule/i }))
        await user.click(screen.getByRole('button', { name: /Save Policy/i }))

        await waitFor(() => {
            expect(api.guilds.updateRbac).toHaveBeenCalledWith(
                managerGuild.id,
                [
                    {
                        roleId: roles[0].id,
                        module: 'overview',
                        mode: 'view',
                    },
                ],
            )
        })
        expect(toast.success).toHaveBeenCalledWith(
            'Access control policy saved',
        )
    })

    test('shows toast when RBAC policy load fails', async () => {
        const { toast } = await import('sonner')

        mockGuildStoreFn(
            { ...mockGuild, canManageRbac: true },
            {
                canManageRbac: true,
                effectiveAccess: defaultAccess,
            },
        )
        vi.mocked(api.guilds.getRbac).mockRejectedValue(new Error('network'))

        renderPage()

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to load role options for access rules.',
            )
        })
    })

    test('shows blocked feedback when adding rule without role options', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')

        mockGuildStoreFn(
            { ...mockGuild, canManageRbac: true },
            {
                canManageRbac: true,
                effectiveAccess: defaultAccess,
            },
        )
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: mockGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [],
                roles: [],
                effectiveAccess: defaultAccess,
                canManageRbac: true,
            },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText(
                    'No assignable roles found for this server yet.',
                ),
            ).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /Add Rule/i }))

        expect(toast.error).toHaveBeenCalledWith(
            'No assignable roles found for this server yet.',
        )
    })

    test('shows toast when RBAC policy save fails', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        const managerGuild = { ...mockGuild, canManageRbac: true }

        mockGuildStoreFn(managerGuild, {
            canManageRbac: true,
            effectiveAccess: defaultAccess,
        })
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: managerGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [
                    {
                        roleId: '222222222222222222',
                        module: 'moderation',
                        mode: 'view',
                    },
                ],
                roles: [{ id: '222222222222222222', name: 'Mods' }],
                effectiveAccess: defaultAccess,
                canManageRbac: true,
            },
        } as any)
        vi.mocked(api.guilds.updateRbac).mockRejectedValue(new Error('fail'))

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /Save Policy/i }),
            ).toBeInTheDocument()
        })
        await user.click(screen.getByRole('button', { name: /Save Policy/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to save access control policy',
            )
        })
    })

    test('applies Criativaria baseline and shows success toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        const managerGuild = { ...mockGuild, canManageRbac: true }

        mockGuildStoreFn(managerGuild, {
            canManageRbac: true,
            effectiveAccess: defaultAccess,
        })
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: managerGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [],
                roles: [{ id: '222222222222222222', name: 'Mods' }],
                effectiveAccess: defaultAccess,
                canManageRbac: true,
            },
        } as any)
        vi.mocked(api.guilds.applyCriativariaPreset).mockResolvedValue({
            data: { run: { status: 'completed' } },
        } as any)

        renderPage()

        const applyButton = await screen.findByRole('button', {
            name: /Apply Criativaria Baseline/i,
        })
        await user.click(applyButton)

        await waitFor(() => {
            expect(api.guilds.applyCriativariaPreset).toHaveBeenCalledWith(
                managerGuild.id,
            )
            expect(toast.success).toHaveBeenCalledWith(
                'Criativaria baseline applied (completed)',
            )
        })
    })

    test('shows ApiError message when Criativaria baseline apply fails', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        const managerGuild = { ...mockGuild, canManageRbac: true }

        mockGuildStoreFn(managerGuild, {
            canManageRbac: true,
            effectiveAccess: defaultAccess,
        })
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: {
                guildId: managerGuild.id,
                modules: Object.keys(defaultAccess),
                grants: [],
                roles: [{ id: '222222222222222222', name: 'Mods' }],
                effectiveAccess: defaultAccess,
                canManageRbac: true,
            },
        } as any)
        vi.mocked(api.guilds.applyCriativariaPreset).mockRejectedValue(
            new ApiError(500, 'Preset failed'),
        )

        renderPage()

        const applyButton = await screen.findByRole('button', {
            name: /Apply Criativaria Baseline/i,
        })
        await user.click(applyButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Preset failed')
        })
    })

    test('retries RBAC role loading from warning card', async () => {
        const user = userEvent.setup()
        const managerGuild = { ...mockGuild, canManageRbac: true }

        mockGuildStoreFn(managerGuild, {
            canManageRbac: true,
            effectiveAccess: defaultAccess,
        })
        vi.mocked(api.guilds.getRbac)
            .mockRejectedValueOnce(new Error('initial network'))
            .mockResolvedValueOnce({
                data: {
                    guildId: managerGuild.id,
                    modules: Object.keys(defaultAccess),
                    grants: [],
                    roles: [{ id: '222222222222222222', name: 'Mods' }],
                    effectiveAccess: defaultAccess,
                    canManageRbac: true,
                },
            } as any)

        renderPage()

        const retryButton = await screen.findByRole('button', {
            name: /Retry Roles/i,
        })
        await user.click(retryButton)

        await waitFor(() => {
            expect(api.guilds.getRbac).toHaveBeenCalledTimes(2)
        })
    })
})
