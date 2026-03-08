import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TwitchNotificationsPage from './TwitchNotifications'
import { api } from '@/services/api'

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

import { useGuildSelection } from '@/hooks/useGuildSelection'

function mockGuildSelection(guild: typeof mockGuild | null) {
    vi.mocked(useGuildSelection).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
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

describe('TwitchNotificationsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
            screen.getByPlaceholderText('Twitch username'),
        ).toBeInTheDocument()
        expect(
            screen.getByPlaceholderText('Twitch user ID'),
        ).toBeInTheDocument()
        expect(
            screen.getByPlaceholderText('Discord channel ID'),
        ).toBeInTheDocument()
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

        await user.click(screen.getByText('Add'))

        await user.type(
            screen.getByPlaceholderText('Twitch username'),
            'teststreamer',
        )
        await user.type(screen.getByPlaceholderText('Twitch user ID'), '12345')
        await user.type(
            screen.getByPlaceholderText('Discord channel ID'),
            '67890',
        )

        await user.click(screen.getByText('Save'))

        expect(api.twitch.add).toHaveBeenCalledWith('123', {
            twitchUserId: '12345',
            twitchLogin: 'teststreamer',
            discordChannelId: '67890',
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
})
