import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FeaturesPage from './Features'
import { useGuildStore } from '@/stores/guildStore'
import { useFeatures } from '@/hooks/useFeatures'

vi.mock('@/stores/guildStore')
vi.mock('@/hooks/useFeatures')
vi.mock('@/services/api', () => ({
    api: {
        auth: {
            getDiscordLoginUrl: vi.fn(() => '/api/auth/discord'),
        },
    },
}))
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Features/GlobalTogglesSection', () => ({
    default: ({ toggles }: any) => (
        <div data-testid='global-toggles'>
            GlobalToggles ({toggles?.length || 0})
        </div>
    ),
}))
vi.mock('@/components/Features/ServerTogglesSection', () => ({
    default: ({ toggles, onSelectGuild }: any) => (
        <div data-testid='server-toggles'>
            ServerToggles ({toggles?.length || 0})
            <button type='button' onClick={() => onSelectGuild('guild-2')}>
                Select Guild
            </button>
        </div>
    ),
}))

function mockGuildStore(overrides: any = {}) {
    vi.mocked(useGuildStore).mockImplementation((selector?: any) => {
        const state = {
            guilds: [],
            selectedGuild: null,
            selectGuild: vi.fn(),
            isLoading: false,
            error: null,
            fetchGuilds: vi.fn(),
            ...overrides,
        }
        return typeof selector === 'function' ? selector(state) : state
    })
}

function mockFeatures(overrides: any = {}) {
    vi.mocked(useFeatures).mockReturnValue({
        globalToggles: [],
        globalToggleProvider: 'environment',
        globalTogglesWritable: false,
        serverToggles: [],
        isLoading: false,
        loadError: null,
        isDeveloper: false,
        retryLoad: vi.fn(),
        handleGlobalToggle: vi.fn(),
        handleServerToggle: vi.fn(),
        ...overrides,
    })
}

describe('FeaturesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading skeletons when loading', () => {
        mockGuildStore()
        mockFeatures({ isLoading: true })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders features heading', () => {
        mockGuildStore()
        mockFeatures()
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Features')).toBeInTheDocument()
    })

    test('shows server toggles section', () => {
        mockGuildStore()
        mockFeatures({
            serverToggles: [{ id: '1', name: 'Music', enabled: true }],
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.getByTestId('server-toggles')).toBeInTheDocument()
    })

    test('shows global toggles for developers', () => {
        mockGuildStore()
        mockFeatures({
            isDeveloper: true,
            globalToggles: [{ id: '1', name: 'Beta', enabled: false }],
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.getByTestId('global-toggles')).toBeInTheDocument()
    })

    test('hides global toggles for non-developers', () => {
        mockGuildStore()
        mockFeatures({ isDeveloper: false })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.queryByTestId('global-toggles')).not.toBeInTheDocument()
    })

    test('shows actionable error state when feature load fails', () => {
        const retryLoad = vi.fn()
        mockGuildStore()
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Discord API unavailable',
                scope: 'server',
                status: 502,
            },
            retryLoad,
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )

        expect(
            screen.getByText('Unable to load feature data'),
        ).toBeInTheDocument()
        expect(screen.getByText('Discord API unavailable')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Retry' }),
        ).toBeInTheDocument()
    })

    test('triggers retry action from error state', async () => {
        const user = userEvent.setup()
        const retryLoad = vi.fn()
        mockGuildStore()
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Discord API unavailable',
                scope: 'server',
                status: 502,
            },
            retryLoad,
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )

        await user.click(screen.getByRole('button', { name: 'Retry' }))
        expect(retryLoad).toHaveBeenCalledTimes(1)
    })

    test('shows re-authenticate action on auth failure', () => {
        mockGuildStore()
        mockFeatures({
            loadError: {
                kind: 'auth',
                message: 'Session expired',
                scope: 'global',
                status: 401,
            },
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )

        expect(screen.getByText('Re-authenticate')).toBeInTheDocument()
    })

    test('selects guild from server toggles callback', async () => {
        const user = userEvent.setup()
        const selectGuild = vi.fn()
        mockGuildStore({
            guilds: [
                { id: 'guild-1', name: 'One' },
                { id: 'guild-2', name: 'Two' },
            ],
            selectGuild,
        })
        mockFeatures()
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )

        await user.click(screen.getByRole('button', { name: 'Select Guild' }))
        expect(selectGuild).toHaveBeenCalledWith({ id: 'guild-2', name: 'Two' })
    })
})
