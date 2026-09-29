import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferredArtistsPage from './PreferredArtists'
import { useGuildSelection } from '@/hooks/useGuildSelection'

// Dedicated heading-structure check that renders the real SectionHeader /
// EmptyState components (PreferredArtists.test.tsx mocks both out for its
// interaction tests), so the single-h1 assertion is genuine.

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/services/api', () => ({
    api: {
        artists: {
            getPreferences: vi.fn().mockResolvedValue({
                data: { preferences: [] },
            }),
            getSuggestions: vi.fn().mockResolvedValue({
                data: { artists: [] },
            }),
            search: vi.fn().mockResolvedValue({ data: { artists: [] } }),
        },
    },
}))

const mockGuild = { id: 'guild-1', name: 'Test Server' }

function renderPage() {
    return render(
        <MemoryRouter>
            <PreferredArtistsPage />
        </MemoryRouter>,
    )
}

describe('PreferredArtistsPage heading structure', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders exactly one h1 with no server selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        renderPage()
        expect(document.querySelectorAll('h1')).toHaveLength(1)
    })

    test('renders exactly one h1 with a server selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        renderPage()
        expect(document.querySelectorAll('h1')).toHaveLength(1)
    })
})
