import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AutoModPage from './AutoMod'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { AutoModSettings } from '@/types'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    icon: null,
    owner: true,
    permissions: '8',
    features: [],
    approximate_member_count: 100,
    approximate_presence_count: 50,
}

const mockSettings: AutoModSettings = {
    id: 'settings1',
    guildId: '123',
    enabled: true,
    spamEnabled: true,
    spamThreshold: 5,
    spamTimeWindow: 5,
    capsEnabled: false,
    capsThreshold: 70,
    linksEnabled: false,
    allowedDomains: [],
    invitesEnabled: false,
    wordsEnabled: true,
    bannedWords: ['badword'],
    exemptChannels: [],
    exemptRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

function mockGuildStore(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () => {
    return render(
        <MemoryRouter>
            <AutoModPage />
        </MemoryRouter>,
    )
}

describe('AutoModPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server selected when no guild', () => {
        mockGuildStore(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to configure auto-moderation'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders filter cards on success', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
            expect(screen.getByText('Caps Lock Detection')).toBeInTheDocument()
            expect(screen.getByText('Link Filtering')).toBeInTheDocument()
            expect(
                screen.getByText('Invite Link Filtering'),
            ).toBeInTheDocument()
            expect(screen.getByText('Banned Words')).toBeInTheDocument()
        })
    })

    test('renders header with guild name', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
            expect(
                screen.getByText(
                    /Configure automatic content filters for Test Guild/,
                ),
            ).toBeInTheDocument()
        })
    })

    test('toggles spam filter card', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        const spamSwitch = switches[0]

        expect(spamSwitch).toBeChecked()

        await user.click(spamSwitch)

        expect(spamSwitch).not.toBeChecked()
    })

    test('toggles caps filter and hides children', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Caps Lock Detection')).toBeInTheDocument()
        })

        const capsSwitch = screen.getAllByRole('switch')[1]

        expect(capsSwitch).not.toBeChecked()

        await user.click(capsSwitch)

        expect(capsSwitch).toBeChecked()
        await waitFor(() => {
            expect(screen.getByText('Caps threshold (%)')).toBeInTheDocument()
        })
    })

    test('save button calls updateSettings with current settings', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(api.automod.updateSettings).toHaveBeenCalledWith(
                '123',
                expect.objectContaining({
                    guildId: '123',
                    spamEnabled: true,
                    wordsEnabled: true,
                }),
            )
        })
    })

    test('save success shows toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(
                'Auto-moderation settings saved!',
            )
        })
    })

    test('save failure shows error toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.updateSettings).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
        })
    })

    test('adds a banned word via TagList', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Banned Words')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText('Add a word to ban...')
        const addButton = input.nextElementSibling as HTMLElement

        await user.type(input, 'newbadword')
        await user.click(addButton)

        await waitFor(() => {
            expect(screen.getByText('newbadword')).toBeInTheDocument()
        })
    })

    test('removes a banned word via TagList', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('badword')).toBeInTheDocument()
        })

        const badgeElement = screen.getByText('badword')
        const removeButton = badgeElement.querySelector('button')

        expect(removeButton).toBeInTheDocument()

        await user.click(removeButton!)

        await waitFor(() => {
            expect(screen.queryByText('badword')).not.toBeInTheDocument()
        })
    })

    test('adds banned word via Enter key', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Banned Words')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText('Add a word to ban...')

        await user.type(input, 'anotherbadword{Enter}')

        await waitFor(() => {
            expect(screen.getByText('anotherbadword')).toBeInTheDocument()
        })
    })

    test('does not add duplicate banned word', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Banned Words')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText('Add a word to ban...')
        const addButton = input.nextElementSibling as HTMLElement

        await user.type(input, 'badword')
        await user.click(addButton)

        const badges = screen.getAllByText('badword')
        expect(badges.length).toBe(1)
    })

    test('adds allowed domain to link filtering', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Link Filtering')).toBeInTheDocument()
        })

        const linkCard = screen
            .getByRole('heading', { name: 'Link Filtering' })
            .closest('[class*="overflow-hidden"]')

        expect(linkCard).toBeTruthy()

        const linkSwitch = within(linkCard as HTMLElement).getByRole('switch')
        await user.click(linkSwitch)

        await waitFor(() => {
            expect(screen.getByText('Allowed domains')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText('e.g. youtube.com')
        const addButton = input.nextElementSibling as HTMLElement

        await user.type(input, 'example.com')
        await user.click(addButton)

        await waitFor(() => {
            expect(screen.getByText('example.com')).toBeInTheDocument()
        })
    })

    test('updates spam threshold via number input', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        const label = screen.getByText('Max messages')
        const thresholdInput = label.closest('div')!.querySelector('input')!

        expect(thresholdInput).toHaveValue(5)

        await user.clear(thresholdInput)
        await user.type(thresholdInput, '10')

        expect(thresholdInput).toHaveValue(10)
    })

    test('renders exemptions section', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Exemptions')).toBeInTheDocument()
            expect(
                screen.getByText('Exempt Channels (IDs)'),
            ).toBeInTheDocument()
            expect(screen.getByText('Exempt Roles (IDs)')).toBeInTheDocument()
        })
    })

    test('uses default settings on API error', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockRejectedValue(
            new Error('Not found'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        expect(switches.every((s) => !s.hasAttribute('checked'))).toBe(true)
    })
})
