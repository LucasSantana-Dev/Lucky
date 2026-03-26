import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Layout from './Layout'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import type { Guild } from '@/types'

vi.mock('@/hooks/useGuildSelection')
vi.mock('./Sidebar', () => ({
    default: () => <aside data-testid='sidebar'>Sidebar</aside>,
}))

const mockGuild: Guild = {
    id: '987654321',
    name: 'Test Server',
    icon: 'icon123',
    owner: true,
    permissions: '8',
    features: [],
    botAdded: true,
}

describe('Layout', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useGuildSelection).mockReturnValue({
            guilds: [mockGuild],
            selectedGuild: mockGuild,
            selectGuild: vi.fn(),
        })
    })

    const renderLayout = (path = '/') =>
        render(
            <MemoryRouter initialEntries={[path]}>
                <Layout>
                    <div>Page content</div>
                </Layout>
            </MemoryRouter>,
        )

    test('renders root route copy and active server panel', () => {
        renderLayout('/')

        expect(screen.getByTestId('sidebar')).toBeInTheDocument()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Operational overview and key status signals for your server.',
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', {
                name: 'Active server: Test Server. Click to switch.',
            }),
        ).toBeInTheDocument()
        expect(screen.getByText('Test Server')).toBeInTheDocument()
    })

    test('renders music history route copy', () => {
        renderLayout('/music/history')

        expect(screen.getByText('Track History')).toBeInTheDocument()
        expect(
            screen.getByText('Inspect recent playback and requester activity.'),
        ).toBeInTheDocument()
    })

    test('renders music route copy', () => {
        renderLayout('/music/queue')

        expect(screen.getByText('Music Player')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Manage queue, autoplay, and real-time playback controls.',
            ),
        ).toBeInTheDocument()
    })

    test('renders fallback route copy without selected guild', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            guilds: [],
            selectedGuild: null,
            selectGuild: vi.fn(),
        })

        renderLayout('/unknown')

        expect(screen.getByText('Lucky Dashboard')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Configure modules, moderation, and engagement workflows.',
            ),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: /active server:/i }),
        ).not.toBeInTheDocument()
    })
})
