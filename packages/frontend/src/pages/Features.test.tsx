import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FeaturesPage from './Features'
import { useGuildStore } from '@/stores/guildStore'
import { useFeatures } from '@/hooks/useFeatures'

vi.mock('@/stores/guildStore')
vi.mock('@/hooks/useFeatures')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Features/GlobalTogglesSection', () => ({
    default: ({ toggles }: any) => (
        <div data-testid='global-toggles'>
            GlobalToggles ({toggles?.length || 0})
        </div>
    ),
}))
vi.mock('@/components/Features/ServerTogglesSection', () => ({
    default: ({ toggles }: any) => (
        <div data-testid='server-toggles'>
            ServerToggles ({toggles?.length || 0})
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
        serverToggles: [],
        isLoading: false,
        isDeveloper: false,
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
})
