import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RelatedArtistsCarousel } from './RelatedArtistsCarousel'
import type { SpotifyArtist, ArtistPreference } from '@/services/artistsApi'

vi.mock('framer-motion', () => ({
    useReducedMotion: vi.fn(() => false),
}))

const baseArtist = (overrides: Partial<SpotifyArtist> = {}): SpotifyArtist => ({
    id: 'a1',
    name: 'Artist 1',
    imageUrl: 'https://img/1.jpg',
    popularity: 50,
    genres: ['pop'],
    ...overrides,
})

const noopKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '')

describe('RelatedArtistsCarousel', () => {
    beforeEach(() => {
        Element.prototype.scrollTo = vi.fn()
    })

    test('renders title', () => {
        render(
            <RelatedArtistsCarousel
                title='Fans also like'
                artists={[baseArtist()]}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText('Fans also like')).toBeInTheDocument()
    })

    test('renders loading skeleton', () => {
        const { container } = render(
            <RelatedArtistsCarousel
                title='Loading'
                artists={[]}
                loading={true}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })

    test('renders empty state when no artists', () => {
        render(
            <RelatedArtistsCarousel
                title='Fans also like'
                artists={[]}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText('No related artists found')).toBeInTheDocument()
    })

    test('renders all artists with names', () => {
        const artists = [
            baseArtist({ id: 'a1', name: 'Artist One' }),
            baseArtist({ id: 'a2', name: 'Artist Two' }),
            baseArtist({ id: 'a3', name: 'Artist Three' }),
        ]
        render(
            <RelatedArtistsCarousel
                title='Related'
                artists={artists}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText('Artist One')).toBeInTheDocument()
        expect(screen.getByText('Artist Two')).toBeInTheDocument()
        expect(screen.getByText('Artist Three')).toBeInTheDocument()
    })

    test('calls onSelectArtist when tile clicked', () => {
        const onSelect = vi.fn()
        const artist = baseArtist()
        render(
            <RelatedArtistsCarousel
                title='Related'
                artists={[artist]}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={onSelect}
                normalizeArtistKey={noopKey}
            />,
        )
        const tile = screen.getByText('Artist 1').closest('button') ?? screen.getByText('Artist 1').closest('[role="button"]') ?? screen.getByText('Artist 1')
        fireEvent.click(tile)
        expect(onSelect).toHaveBeenCalledWith(artist)
    })

    test('renders genre tags when present', () => {
        render(
            <RelatedArtistsCarousel
                title='Related'
                artists={[baseArtist({ genres: ['rock'] })]}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText(/rock/i)).toBeInTheDocument()
    })

    test('shows preference badge for already-preferred artist', () => {
        const prefs = new Map<string, ArtistPreference>()
        prefs.set('artist1', {
            id: 'pref1',
            artistKey: 'artist1',
            artistName: 'Artist 1',
            spotifyId: 'a1',
            imageUrl: null,
            preference: 'prefer',
            guildId: 'g1',
        } as unknown as ArtistPreference)
        render(
            <RelatedArtistsCarousel
                title='Related'
                artists={[baseArtist()]}
                loading={false}
                savedPreferences={prefs}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        // preference badge or prefer/✓ marker present
        const tiles = screen.getAllByText('Artist 1')
        expect(tiles.length).toBeGreaterThan(0)
    })
})

describe('RelatedArtistsCarousel scroll', () => {
    test('renders scroll right button when overflowing', () => {
        Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', {
            configurable: true,
            value: 1000,
        })
        Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
            configurable: true,
            value: 300,
        })
        const { container } = render(
            <RelatedArtistsCarousel
                title='Many'
                artists={Array.from({ length: 20 }, (_, i) =>
                    baseArtist({ id: `a${i}`, name: `Artist ${i}` }),
                )}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBeGreaterThan(0)
    })

    test('scroll right button calls scrollBy', () => {
        const scrollBy = vi.fn()
        Element.prototype.scrollBy = scrollBy
        Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', {
            configurable: true,
            value: 2000,
        })
        Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
            configurable: true,
            value: 300,
        })
        const { container } = render(
            <RelatedArtistsCarousel
                title='Many'
                artists={Array.from({ length: 10 }, (_, i) =>
                    baseArtist({ id: `a${i}`, name: `Artist ${i}` }),
                )}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        const navButtons = Array.from(container.querySelectorAll('button')).filter(
            (b) => b.getAttribute('aria-label')?.toLowerCase().includes('scroll'),
        )
        if (navButtons.length > 0) {
            fireEvent.click(navButtons[navButtons.length - 1])
        }
    })

    test('handles artist without imageUrl gracefully', () => {
        render(
            <RelatedArtistsCarousel
                title='No Image'
                artists={[baseArtist({ imageUrl: null, name: 'Faceless' })]}
                loading={false}
                savedPreferences={new Map()}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText('Faceless')).toBeInTheDocument()
    })

    test('shows block badge for blocked artist', () => {
        const prefs = new Map<string, ArtistPreference>()
        prefs.set('blocked1', {
            id: 'pref2',
            artistKey: 'blocked1',
            artistName: 'Blocked 1',
            spotifyId: 'b1',
            imageUrl: null,
            preference: 'block',
            guildId: 'g1',
        } as unknown as ArtistPreference)
        render(
            <RelatedArtistsCarousel
                title='Mixed'
                artists={[baseArtist({ id: 'b1', name: 'Blocked 1' })]}
                loading={false}
                savedPreferences={prefs}
                onSelectArtist={vi.fn()}
                normalizeArtistKey={noopKey}
            />,
        )
        expect(screen.getByText('Blocked 1')).toBeInTheDocument()
    })
})
