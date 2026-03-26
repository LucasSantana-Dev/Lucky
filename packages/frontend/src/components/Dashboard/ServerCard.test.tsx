import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerCard from './ServerCard'
import type { Guild } from '@/types'
import { useGuildStore } from '@/stores/guildStore'

const mockNavigate = vi.fn()
const mockSelectGuild = vi.fn()

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

vi.mock('@/stores/guildStore', () => ({
    useGuildStore: vi.fn(),
}))

const mockGuild: Guild = {
    id: '123456789',
    name: 'Test Server',
    icon: 'icon123',
    owner: true,
    permissions: '8',
    features: [],
    botAdded: true,
    memberCount: 150,
}

const mockGuildWithoutBot: Guild = {
    ...mockGuild,
    id: '987654321',
    name: 'Server Without Bot',
    botAdded: false,
}

describe('ServerCard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useGuildStore).mockReturnValue({
            selectGuild: mockSelectGuild,
        } as unknown as ReturnType<typeof useGuildStore>)
    })

    const renderCard = (guild: Guild) => {
        return render(
            <MemoryRouter>
                <ServerCard guild={guild} />
            </MemoryRouter>,
        )
    }

    test('renders server name and icon', () => {
        renderCard(mockGuild)

        expect(screen.getByText('Test Server')).toBeInTheDocument()
        const icon = screen.getByAltText('Test Server icon')
        expect(icon).toHaveAttribute(
            'src',
            `https://cdn.discordapp.com/icons/${mockGuild.id}/${mockGuild.icon}.png?size=128`,
        )
    })

    test('shows fallback initial when icon is null', () => {
        const guildNoIcon = { ...mockGuild, icon: null }
        renderCard(guildNoIcon)

        expect(screen.getByText('T')).toBeInTheDocument()
    })

    test('shows active badge when bot is in server', () => {
        renderCard(mockGuild)

        const badge = screen.getByLabelText('Bot installed')
        expect(badge).toBeInTheDocument()
        expect(screen.getByText(/bot active/i)).toBeInTheDocument()
        expect(badge).toHaveClass('bg-lucky-success/10')
    })

    test('shows no bot badge when bot is not in server', () => {
        renderCard(mockGuildWithoutBot)

        const badge = screen.getByLabelText('Bot not installed')
        expect(badge).toBeInTheDocument()
        expect(screen.getByText(/no bot/i)).toBeInTheDocument()
        expect(badge).toHaveClass('bg-lucky-error/10')
    })

    test('shows member count when present', () => {
        renderCard(mockGuild)

        expect(screen.getByText('150 members')).toBeInTheDocument()
    })

    test('shows Manage button when bot is added', () => {
        renderCard(mockGuild)

        const manageButton = screen.getByRole('button', { name: /manage/i })
        expect(manageButton).toBeInTheDocument()
    })

    test('Manage button selects guild and navigates to overview route', async () => {
        const user = userEvent.setup()
        renderCard(mockGuild)

        const manageButton = screen.getByRole('button', { name: /manage/i })
        await user.click(manageButton)

        expect(mockSelectGuild).toHaveBeenCalledWith(mockGuild)
        expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    test('shows Add Bot button when bot is not added', () => {
        renderCard(mockGuildWithoutBot)

        expect(screen.queryByText(/manage/i)).not.toBeInTheDocument()
        expect(
            screen.getByRole('button', {
                name: /add bot to server without bot/i,
            }),
        ).toBeInTheDocument()
    })

    test('displays installed indicator when bot is added', () => {
        renderCard(mockGuild)

        const indicator = screen.getByLabelText('Bot is installed')
        expect(indicator).toBeInTheDocument()
    })

    test('does not display installed indicator when bot is not added', () => {
        renderCard(mockGuildWithoutBot)

        expect(
            screen.queryByLabelText('Bot is installed'),
        ).not.toBeInTheDocument()
    })
})
