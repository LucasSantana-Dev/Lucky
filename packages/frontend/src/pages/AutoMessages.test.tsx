import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AutoMessagesPage from './AutoMessages'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/guildStore')

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
})
