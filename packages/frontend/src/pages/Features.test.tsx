import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FeaturesPage from './Features'
import { useFeatures } from '@/hooks/useFeatures'
import { useFeaturesStore } from '@/stores/featuresStore'

vi.mock('@/hooks/useFeatures')
vi.mock('@/stores/featuresStore')
vi.mock('@/services/api', () => ({
    api: {
        auth: {
            getDiscordLoginUrl: vi.fn(() => '/api/auth/discord'),
        },
    },
}))
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))

function mockFeatures(overrides: any = {}) {
    vi.mocked(useFeatures).mockReturnValue({
        globalToggles: {},
        globalToggleProvider: 'environment',
        globalTogglesWritable: false,
        isLoading: false,
        loadError: null,
        isDeveloper: false,
        retryLoad: vi.fn(),
        handleGlobalToggle: vi.fn(),
        ...overrides,
    })
}

function mockFeaturesStore(overrides: any = {}) {
    vi.mocked(useFeaturesStore).mockImplementation((selector?: any) => {
        const state = { features: [], ...overrides }
        return typeof selector === 'function' ? selector(state) : state
    })
}

describe('FeaturesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading skeletons when loading', () => {
        mockFeaturesStore()
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
        mockFeaturesStore()
        mockFeatures()
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Features')).toBeInTheDocument()
    })

    test('renders available features list', () => {
        mockFeaturesStore({
            features: [
                { name: 'MUSIC_RECOMMENDATIONS', description: 'Music recs', isGlobal: false },
            ],
        })
        mockFeatures({ globalToggles: { MUSIC_RECOMMENDATIONS: true } })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Available Features')).toBeInTheDocument()
    })

    test('shows actionable error state when feature load fails', () => {
        const retryLoad = vi.fn()
        mockFeaturesStore()
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Discord API unavailable',
                scope: 'catalog',
                status: 502,
            },
            retryLoad,
        })
        render(
            <MemoryRouter>
                <FeaturesPage />
            </MemoryRouter>,
        )

        expect(screen.getByText('Unable to load feature data')).toBeInTheDocument()
        expect(screen.getByText('Discord API unavailable')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    test('triggers retry action from error state', async () => {
        const user = userEvent.setup()
        const retryLoad = vi.fn()
        mockFeaturesStore()
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Discord API unavailable',
                scope: 'catalog',
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
        mockFeaturesStore()
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
})
