import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import AutoMessagesPage from './AutoMessages'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { AutoMessage } from '@/types'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api')
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockGuild = { id: '123', name: 'Test Guild' }

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
            <AutoMessagesPage />
        </MemoryRouter>,
    )

describe('AutoMessagesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.autoMessages.list).mockResolvedValue({
            data: { messages: [] },
        } as any)
    })

    test('shows no server selected when no guild', () => {
        mockGuildStoreFn(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to manage auto messages'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons initially', () => {
        mockGuildStoreFn(mockGuild)
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders header with guild name', () => {
        mockGuildStoreFn(mockGuild)
        renderPage()
        expect(screen.getByText('Auto Messages')).toBeInTheDocument()
        expect(
            screen.getByText(/Schedule automatic messages for Test Guild/),
        ).toBeInTheDocument()
    })

    test('shows new message button', () => {
        mockGuildStoreFn(mockGuild)
        renderPage()
        expect(screen.getByText('New Message')).toBeInTheDocument()
    })

    test('shows empty state after loading', async () => {
        mockGuildStoreFn(mockGuild)
        renderPage()

        await waitFor(
            () => {
                expect(
                    screen.getByText('No auto messages configured'),
                ).toBeInTheDocument()
            },
            { timeout: 2000 },
        )
        expect(screen.getByText('Create Auto Message')).toBeInTheDocument()
    })

    test('handles legacy automessages payload without crashing', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.autoMessages.list).mockResolvedValue({
            data: { welcome: null, leave: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No auto messages configured')).toBeInTheDocument()
        })
    })

    test('shows an error toast when saving a new message fails', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.autoMessages.create).mockRejectedValue(
            new Error('Request failed with status code 400'),
        )

        renderPage()

        await user.click(screen.getByText('New Message'))
        await user.type(
            screen.getByLabelText('Message'),
            'Welcome to the server!',
        )
        await user.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to save auto message',
            )
        })
    })

    test('asks for confirmation before deleting and only deletes after confirming', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        const existingMessage: AutoMessage = {
            id: 'msg-1',
            type: 'welcome',
            message: 'Welcome!',
            channelId: '123456789012345678',
            enabled: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
        }
        vi.mocked(api.autoMessages.list).mockResolvedValue({
            data: { messages: [existingMessage] },
        } as any)
        vi.mocked(api.autoMessages.delete).mockResolvedValue({
            data: { success: true },
        } as any)

        renderPage()

        const deleteButton = await screen.findByLabelText(
            'Delete Welcome message',
        )
        await user.click(deleteButton)

        expect(screen.getByText('Delete Auto Message')).toBeInTheDocument()
        expect(api.autoMessages.delete).not.toHaveBeenCalled()

        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => {
            expect(
                screen.queryByText('Delete Auto Message'),
            ).not.toBeInTheDocument()
        })
        expect(api.autoMessages.delete).not.toHaveBeenCalled()

        await user.click(deleteButton)
        await user.click(screen.getByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            expect(api.autoMessages.delete).toHaveBeenCalledWith(
                mockGuild.id,
                'msg-1',
            )
        })
    })

    test('shows an error toast and keeps the dialog open when delete fails', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        const existingMessage: AutoMessage = {
            id: 'msg-1',
            type: 'welcome',
            message: 'Welcome!',
            channelId: '123456789012345678',
            enabled: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
        }
        vi.mocked(api.autoMessages.list).mockResolvedValue({
            data: { messages: [existingMessage] },
        } as any)
        vi.mocked(api.autoMessages.delete).mockRejectedValue(
            new Error('Request failed with status code 500'),
        )

        renderPage()

        const deleteButton = await screen.findByLabelText(
            'Delete Welcome message',
        )
        await user.click(deleteButton)
        await user.click(screen.getByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to delete auto message',
            )
        })
        expect(screen.getByText('Delete Auto Message')).toBeInTheDocument()
    })
})
