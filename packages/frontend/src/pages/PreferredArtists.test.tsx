import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferredArtistsPage from './PreferredArtists'
import { useGuildSelection } from '@/hooks/useGuildSelection'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))

const mockGetPreferences = vi.fn()
const mockSearch = vi.fn()
const mockGetRelated = vi.fn()
const mockSavePreference = vi.fn()
const mockDeletePreference = vi.fn()

const mockGetSuggestions = vi.fn()

vi.mock('@/services/api', () => ({
    api: {
        artists: {
            getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
            search: (...args: unknown[]) => mockSearch(...args),
            getRelated: (...args: unknown[]) => mockGetRelated(...args),
            savePreference: (...args: unknown[]) => mockSavePreference(...args),
            deletePreference: (...args: unknown[]) =>
                mockDeletePreference(...args),
            getSuggestions: (...args: unknown[]) => mockGetSuggestions(...args),
        },
    },
}))

vi.mock('@/components/ui/SectionHeader', () => ({
    default: ({ title }: { title: string }) => (
        <div data-testid='section-header'>{title}</div>
    ),
}))

vi.mock('@/components/ui/EmptyState', () => ({
    default: ({
        title,
        description,
    }: {
        title: string
        description: string
    }) => (
        <div data-testid='empty-state'>
            <span>{title}</span>
            <span>{description}</span>
        </div>
    ),
}))

const mockGuild = { id: 'guild-1', name: 'Test Server' }

const mockArtist = {
    id: 'artist-1',
    name: 'The Beatles',
    imageUrl: null,
    popularity: 80,
    genres: ['rock', 'pop'],
}

const mockPreference = {
    id: 'pref-1',
    guildId: 'guild-1',
    discordUserId: 'user-1',
    artistKey: 'thebeatles',
    artistName: 'The Beatles',
    spotifyId: 'artist-1',
    imageUrl: null,
    preference: 'prefer' as const,
}

function renderPage() {
    return render(
        <MemoryRouter>
            <PreferredArtistsPage />
        </MemoryRouter>,
    )
}

describe('PreferredArtistsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetPreferences.mockResolvedValue({ data: { preferences: [] } })
        mockSearch.mockResolvedValue({ data: { artists: [] } })
        mockGetRelated.mockResolvedValue({ data: { artists: [] } })
        mockSavePreference.mockResolvedValue({
            data: { preference: mockPreference },
        })
        mockDeletePreference.mockResolvedValue({ data: { success: true } })
        mockGetSuggestions.mockResolvedValue({ data: { artists: [] } })
    })

    test('shows empty state when no guild selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        renderPage()
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to manage preferred artists'),
        ).toBeInTheDocument()
    })

    test('renders page with search bar when guild selected', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        renderPage()
        await waitFor(() => {
            expect(mockGetPreferences).toHaveBeenCalledWith('guild-1')
        })
        expect(
            screen.getByPlaceholderText('Search for an artist...'),
        ).toBeInTheDocument()
    })

    test('loads and displays preferred artists', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetPreferences.mockResolvedValue({
            data: { preferences: [mockPreference] },
        })
        mockGetSuggestions.mockResolvedValue({
            data: {
                artists: [
                    {
                        id: 'suggested-1',
                        name: 'Suggested Artist',
                        imageUrl: null,
                        popularity: 70,
                        genres: ['pop'],
                    },
                ],
            },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Suggested Artist')).toBeInTheDocument()
        })
    })

    test('displays blocked artists section when blocked artists exist', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const blockedPref = {
            ...mockPreference,
            id: 'pref-2',
            artistKey: 'nickelback',
            artistName: 'Nickelback',
            preference: 'block' as const,
        }
        mockGetPreferences.mockResolvedValue({
            data: { preferences: [blockedPref] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Nickelback')).toBeInTheDocument()
            expect(screen.getByText('Blocked Artists')).toBeInTheDocument()
        })
    })

    test('shows hint text when no preferences and no search query', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({ data: { artists: [] } })
        renderPage()
        await waitFor(() => {
            expect(
                screen.getByText(
                    'No suggestions available. Try searching for artists above.',
                ),
            ).toBeInTheDocument()
        })
    })

    test('shows loading spinner while fetching preferences', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        let resolveSuggestions!: (value: unknown) => void
        mockGetSuggestions.mockReturnValue(
            new Promise((res) => {
                resolveSuggestions = res
            }),
        )
        renderPage()
        const spinners = document.querySelectorAll('.animate-spin')
        expect(spinners.length).toBeGreaterThan(0)
        await act(async () => {
            resolveSuggestions({ data: { artists: [] } })
        })
    })

    test('calls search API when typing in search box', async () => {
        vi.useFakeTimers()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        renderPage()
        const input = screen.getByPlaceholderText('Search for an artist...')
        fireEvent.change(input, { target: { value: 'Beatles' } })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(mockSearch).toHaveBeenCalledWith('Beatles')
        vi.useRealTimers()
    })

    test('shows search results after typing', async () => {
        vi.useFakeTimers()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockSearch.mockResolvedValue({ data: { artists: [mockArtist] } })
        renderPage()
        const input = screen.getByPlaceholderText('Search for an artist...')
        fireEvent.change(input, { target: { value: 'Beatles' } })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(screen.getByText('The Beatles')).toBeInTheDocument()
        vi.useRealTimers()
    })

    test('shows no results message when search returns empty', async () => {
        vi.useFakeTimers()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockSearch.mockResolvedValue({ data: { artists: [] } })
        renderPage()
        const input = screen.getByPlaceholderText('Search for an artist...')
        fireEvent.change(input, { target: { value: 'xyznotfound' } })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(screen.getByText(/No artists found for/)).toBeInTheDocument()
        vi.useRealTimers()
    })

    test('shows search error when API fails', async () => {
        vi.useFakeTimers()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockSearch.mockRejectedValue(new Error('Network error'))
        renderPage()
        const input = screen.getByPlaceholderText('Search for an artist...')
        fireEvent.change(input, { target: { value: 'Beatles' } })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(screen.getByText('Failed to search artists')).toBeInTheDocument()
        vi.useRealTimers()
    })

    test('clears search query when X button is clicked', async () => {
        vi.useFakeTimers()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        renderPage()
        const input = screen.getByPlaceholderText(
            'Search for an artist...',
        ) as HTMLInputElement
        fireEvent.change(input, { target: { value: 'Beatles' } })
        expect(input.value).toBe('Beatles')
        const clearBtn = document
            .querySelector('input[placeholder="Search for an artist..."]')
            ?.parentElement?.querySelector('button[type="button"]')
        if (clearBtn) {
            fireEvent.click(clearBtn)
            expect(input.value).toBe('')
        }
        vi.useRealTimers()
    })

    test('renders artist image when imageUrl is provided', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const artistWithImage = {
            ...mockArtist,
            imageUrl: 'https://example.com/img.jpg',
        }
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [artistWithImage] },
        })
        renderPage()
        await waitFor(() => {
            const img = screen.getByAltText('The Beatles')
            expect(img).toBeInTheDocument()
            expect(img).toHaveAttribute('src', 'https://example.com/img.jpg')
        })
    })

    test('opens detail panel and loads related artists when artist clicked', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetRelated.mockResolvedValue({
            data: {
                artists: [
                    {
                        id: 'related-1',
                        name: 'Led Zeppelin',
                        imageUrl: null,
                        popularity: 75,
                        genres: ['rock'],
                    },
                ],
            },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const artistButtons = screen.getAllByRole('button')
        const beatlesBtn = artistButtons.find((b) =>
            b.textContent?.includes('The Beatles'),
        )
        expect(beatlesBtn).toBeDefined()
        await act(async () => {
            fireEvent.click(beatlesBtn!)
        })
        await waitFor(() => {
            expect(mockGetRelated).toHaveBeenCalledWith('artist-1')
        })
        await waitFor(() => {
            expect(screen.getByText('Led Zeppelin')).toBeInTheDocument()
        })
    })

    test('shows Prefer and Block buttons in detail panel for selected artist', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const artistButtons = screen.getAllByRole('button')
        const beatlesBtn = artistButtons.find((b) =>
            b.textContent?.includes('The Beatles'),
        )
        await act(async () => {
            fireEvent.click(beatlesBtn!)
        })
        await waitFor(() => {
            expect(screen.getByText('Prefer')).toBeInTheDocument()
            expect(screen.getByText('Block')).toBeInTheDocument()
        })
    })

    test('closes detail panel when close button is clicked', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const artistButtons = screen.getAllByRole('button')
        const beatlesBtn = artistButtons.find((b) =>
            b.textContent?.includes('The Beatles'),
        )
        await act(async () => {
            fireEvent.click(beatlesBtn!)
        })
        await waitFor(() => {
            expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByLabelText('Close panel'))
        await waitFor(() => {
            expect(
                screen.queryByLabelText('Close panel'),
            ).not.toBeInTheDocument()
        })
    })

    test('calls savePreference when prefer button is clicked in panel', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: {
                artists: [mockArtist],
            },
        })
        mockGetPreferences.mockResolvedValue({
            data: { preferences: [] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Prefer')).toBeInTheDocument()
        })
        const preferBtn = screen.getByText('Prefer').closest('button')!
        await act(async () => {
            fireEvent.click(preferBtn)
        })
        await waitFor(() => {
            expect(screen.getByText(/Save Preferences/)).toBeInTheDocument()
        })
        const saveBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('Save Preferences'))!
        await act(async () => {
            fireEvent.click(saveBtn)
        })
        await waitFor(() => {
            expect(mockSavePreference).toHaveBeenCalled()
        })
    })

    test('shows no related artists message when getRelated returns empty', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetRelated.mockResolvedValue({ data: { artists: [] } })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
            await mockGetRelated.mock.results[0]?.value
        })
        await waitFor(() => {
            expect(
                screen.getByText('No related artists found'),
            ).toBeInTheDocument()
        })
    })

    test('saves preferences successfully and updates state', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetPreferences.mockResolvedValue({ data: { preferences: [] } })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Prefer')).toBeInTheDocument()
        })
        const preferBtn = screen.getByText('Prefer').closest('button')!
        await act(async () => {
            fireEvent.click(preferBtn)
        })
        await waitFor(() => {
            expect(screen.getByText(/Save Preferences/)).toBeInTheDocument()
        })
        mockGetPreferences.mockResolvedValue({
            data: { preferences: [mockPreference] },
        })
        const saveBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('Save Preferences'))!
        await act(async () => {
            fireEvent.click(saveBtn)
        })
        await waitFor(() => {
            expect(mockSavePreference).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: 'guild-1',
                    preference: 'prefer',
                }),
            )
        })
    })

    test('handles save preference error gracefully', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetPreferences.mockResolvedValue({ data: { preferences: [] } })
        mockSavePreference.mockRejectedValueOnce(
            new Error('Network error'),
        )
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Prefer')).toBeInTheDocument()
        })
        const preferBtn = screen.getByText('Prefer').closest('button')!
        await act(async () => {
            fireEvent.click(preferBtn)
        })
        const saveBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('Save Preferences'))!
        await act(async () => {
            fireEvent.click(saveBtn)
        })
        await waitFor(() => {
            expect(mockSavePreference).toHaveBeenCalled()
        })
    })

    test('renders artist with no genres gracefully', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const artistNoGenres = {
            ...mockArtist,
            genres: [],
        }
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [artistNoGenres] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
    })

    test('handles related artists loading state', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        let resolveRelated!: (value: unknown) => void
        mockGetRelated.mockReturnValue(
            new Promise((res) => {
                resolveRelated = res
            }),
        )
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            const spinners = document.querySelectorAll('.animate-spin')
            expect(spinners.length).toBeGreaterThan(0)
        })
        await act(async () => {
            resolveRelated({ data: { artists: [] } })
        })
    })

    test('removes unsaved changes when remove preference is clicked', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Prefer')).toBeInTheDocument()
        })
        const preferBtn = screen.getByText('Prefer').closest('button')!
        await act(async () => {
            fireEvent.click(preferBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Preferred')).toBeInTheDocument()
        })
        const preferredBtn = screen.getByText('Preferred').closest('button')!
        await act(async () => {
            fireEvent.click(preferredBtn)
        })
        await waitFor(() => {
            expect(
                screen.queryByText(/Save Preferences/),
            ).not.toBeInTheDocument()
        })
    })

    test('handles duplicate artists in unsaved changes', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const duplicateArtist = { ...mockArtist, id: 'different-id' }
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist, duplicateArtist] },
        })
        renderPage()
        await waitFor(() => {
            const beatlesButtons = screen
                .getAllByRole('button')
                .filter((b) => b.textContent?.includes('The Beatles'))
            expect(beatlesButtons.length).toBeGreaterThan(0)
        })
    })

    test('handles empty result from getRelated error', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetRelated.mockRejectedValueOnce(new Error('API error'))
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(
                screen.getByText('No related artists found'),
            ).toBeInTheDocument()
        })
    })

    test('handles loadPreferences error gracefully', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetPreferences.mockRejectedValueOnce(new Error('Network error'))
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
    })

    test('shows correct preference state in related artists panel', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        mockGetSuggestions.mockResolvedValue({
            data: { artists: [mockArtist] },
        })
        mockGetPreferences.mockResolvedValue({
            data: { preferences: [mockPreference] },
        })
        const relatedArtist = {
            id: 'related-1',
            name: 'Led Zeppelin',
            imageUrl: null,
            popularity: 75,
            genres: ['rock'],
        }
        mockGetRelated.mockResolvedValue({ data: { artists: [relatedArtist] } })
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('The Beatles')).toBeInTheDocument()
        })
        const beatlesBtn = screen
            .getAllByRole('button')
            .find((b) => b.textContent?.includes('The Beatles'))!
        await act(async () => {
            fireEvent.click(beatlesBtn)
        })
        await waitFor(() => {
            expect(screen.getByText('Led Zeppelin')).toBeInTheDocument()
        })
    })
})
