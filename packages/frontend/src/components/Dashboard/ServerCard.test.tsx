import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerCard from './ServerCard'
import type { Guild } from '@/types'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

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
        const icon = screen.getByAltText('Test Server server icon')
        expect(icon).toHaveAttribute(
            'src',
            `https://cdn.discordapp.com/icons/${mockGuild.id}/${mockGuild.icon}.png`,
        )
    })

    test('shows fallback initial when icon is null', () => {
        const guildNoIcon = { ...mockGuild, icon: null }
        renderCard(guildNoIcon)

        expect(screen.getByText('T')).toBeInTheDocument()
    })

    test('shows "Bot Added" badge when bot is in server', () => {
        renderCard(mockGuild)

        const badge = screen.getByText(/bot added/i)
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-lucky-success/20')
    })

    test('shows "Not Added" badge when bot is not in server', () => {
        renderCard(mockGuildWithoutBot)

        const badge = screen.getByText(/not added/i)
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-lucky-error/20')
    })

    test('shows Manage button when bot is added', () => {
        renderCard(mockGuild)

        const manageButton = screen.getByRole('button', { name: /manage/i })
        expect(manageButton).toBeInTheDocument()
    })

    test('Manage button navigates to dashboard', async () => {
        const user = userEvent.setup()
        renderCard(mockGuild)

        const manageButton = screen.getByRole('button', { name: /manage/i })
        await user.click(manageButton)

        expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    test('shows Add Bot button when bot is not added', () => {
        renderCard(mockGuildWithoutBot)

        expect(screen.queryByText(/manage/i)).not.toBeInTheDocument()
    })

    test('displays online indicator when bot is added', () => {
        renderCard(mockGuild)

        const indicator = screen.getByLabelText('Bot is online')
        expect(indicator).toBeInTheDocument()
    })

    test('does not display online indicator when bot is not added', () => {
        renderCard(mockGuildWithoutBot)

        expect(screen.queryByLabelText('Bot is online')).not.toBeInTheDocument()
    })
})
