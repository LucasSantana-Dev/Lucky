import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsPage from './ServerSettings'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockGuild = { id: '123', name: 'Test Guild' }
const mockSettings = {
    nickname: 'Nexus',
    commandPrefix: '!',
    managerRoles: [],
    updatesChannel: '',
    timezone: 'UTC',
    disableWarnings: false,
}

function mockGuildStoreFn(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
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
            expect(screen.getByPlaceholderText('Nexus')).toBeInTheDocument()
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
                    nickname: 'Nexus',
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

    test('uses default settings on API error', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.guilds.getSettings).mockRejectedValue(
            new Error('Not found'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Settings')).toBeInTheDocument()
        })
    })
})
