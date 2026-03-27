import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TwitchNotificationsPage from './TwitchNotifications'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'

vi.mock('@/services/api')
vi.mock('@/hooks/useGuildSelection')

const mockGuild = { id: '123', name: 'Test Server', botAdded: true }

const mockNotifications = [
    {
        id: 'n1',
        guildId: '123',
        twitchUserId: 'tw1',
        twitchLogin: 'shroud',
        discordChannelId: '456',
    },
    {
        id: 'n2',
        guildId: '123',
        twitchUserId: 'tw2',
        twitchLogin: 'pokimane',
        discordChannelId: '789',
    },
]

const TWITCH_INPUT_PLACEHOLDER =
    'Twitch URL or login (e.g. https://twitch.tv/luk)'

import { useGuildSelection } from '@/hooks/useGuildSelection'

function mockGuildSelection(guild: typeof mockGuild | null) {
    vi.mocked(useGuildSelection).mockReturnValue({
        guilds: guild
            ? [
                  {
                      ...guild,
                      icon: null,
                      owner: true,
                      permissions: '8',
                      features: [],
                  },
              ]
            : [],
        selectedGuild: guild
            ? ({
                  ...guild,
                  icon: null,
                  owner: true,
                  permissions: '8',
                  features: [],
              } as any)
            : null,
        selectGuild: vi.fn(),
    })
}

function renderPage() {
    return render(
        <MemoryRouter>
            <TwitchNotificationsPage />
        </MemoryRouter>,
    )
}

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByText('Add'))
}

async function fillNotificationForm(
    user: ReturnType<typeof userEvent.setup>,
    twitchInput: string,
) {
    await user.type(
        screen.getByPlaceholderText(TWITCH_INPUT_PLACEHOLDER),
        twitchInput,
    )
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('#general'))
}

describe('TwitchNotificationsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(
            globalThis.HTMLElement.prototype,
            'scrollIntoView',
            {
                configurable: true,
                value: vi.fn(),
            },
        )
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: {
                channels: [{ id: '67890', name: '#general' }],
            },
        } as any)
        vi.mocked(api.twitch.lookupUser).mockResolvedValue({
            data: {
                id: '12345',
                login: 'teststreamer',
                displayName: 'Test Streamer',
            },
        } as any)
    })

    test('shows select server message when no guild selected', () => {
        mockGuildSelection(null)
        renderPage()

        expect(
            screen.getByText('Select a server to manage Twitch notifications'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders notification list on success', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: mockNotifications },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('shroud')).toBeInTheDocument()
        })

        expect(screen.getByText('pokimane')).toBeInTheDocument()
        expect(screen.getByText('(2)')).toBeInTheDocument()
    })

    test('shows error message on fetch failure', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockRejectedValue(new Error('Network error'))

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load Twitch notifications'),
            ).toBeInTheDocument()
        })
    })

    test('shows empty state when no notifications', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('No Twitch notifications configured'),
            ).toBeInTheDocument()
        })
    })

    test('toggles add form on button click', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Add')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Add'))

        expect(screen.getByText('Add Twitch Notification')).toBeInTheDocument()
        expect(
            screen.getByPlaceholderText(
                'Twitch URL or login (e.g. https://twitch.tv/luk)',
            ),
        ).toBeInTheDocument()
        expect(screen.getByText('Select Discord channel')).toBeInTheDocument()
    })

    test('save button disabled when form fields empty', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Add')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Add'))

        const saveButton = screen.getByText('Save')
        expect(saveButton).toBeDisabled()
    })

    test('submits add form and reloads data', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)
        vi.mocked(api.twitch.add).mockResolvedValue({
            data: { success: true },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Add')).toBeInTheDocument()
        })

        await openAddForm(user)
        await fillNotificationForm(user, 'teststreamer')
        await user.click(screen.getByText('Save'))

        await waitFor(() => {
            expect(api.twitch.lookupUser).toHaveBeenCalledWith('teststreamer')
            expect(api.twitch.add).toHaveBeenCalledWith('123', {
                twitchUserId: '12345',
                twitchLogin: 'teststreamer',
                discordChannelId: '67890',
            })
            expect(api.twitch.list).toHaveBeenCalledTimes(2)
        })
    })

    test('cancel button hides add form', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Add')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Add'))
        expect(screen.getByText('Add Twitch Notification')).toBeInTheDocument()

        await user.click(screen.getByText('Cancel'))
        expect(
            screen.queryByText('Add Twitch Notification'),
        ).not.toBeInTheDocument()
    })

    test('remove button calls api and updates list', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: mockNotifications },
        } as any)
        vi.mocked(api.twitch.remove).mockResolvedValue({
            data: { success: true },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('shroud')).toBeInTheDocument()
        })

        const removeButton = screen.getByLabelText('Remove shroud')
        await userEvent.click(removeButton)

        expect(api.twitch.remove).toHaveBeenCalledWith('123', 'tw1')
    })

    test('shows validation error for invalid Twitch URL/login', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)

        renderPage()

        await openAddForm(user)
        await fillNotificationForm(user, '!!')
        await user.click(screen.getByText('Save'))

        expect(
            await screen.findByText('Enter a valid Twitch URL or login'),
        ).toBeInTheDocument()
    })

    test('shows duplicate error when Twitch user is already configured', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: mockNotifications },
        } as any)
        vi.mocked(api.twitch.lookupUser).mockResolvedValue({
            data: {
                id: 'tw1',
                login: 'shroud',
                displayName: 'Shroud',
            },
        } as any)

        renderPage()

        await openAddForm(user)
        await fillNotificationForm(user, 'shroud')
        await user.click(screen.getByText('Save'))

        expect(
            await screen.findByText(
                'This Twitch channel is already configured',
            ),
        ).toBeInTheDocument()
    })

    test('shows channel loading error when Discord channels request fails', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)
        vi.mocked(api.guilds.getChannels).mockRejectedValue(
            new Error('channels unavailable'),
        )

        renderPage()
        await openAddForm(user)

        expect(
            await screen.findByText('Failed to load Discord channels'),
        ).toBeInTheDocument()
    })

    test('shows backend error message when add notification fails', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.twitch.list).mockResolvedValue({
            data: { notifications: [] },
        } as any)
        vi.mocked(api.twitch.lookupUser).mockRejectedValue(
            new ApiError(404, 'Twitch user not found'),
        )

        renderPage()

        await openAddForm(user)
        await fillNotificationForm(user, 'teststreamer')
        await user.click(screen.getByText('Save'))

        expect(
            await screen.findByText('Twitch user not found'),
        ).toBeInTheDocument()
    })
})
