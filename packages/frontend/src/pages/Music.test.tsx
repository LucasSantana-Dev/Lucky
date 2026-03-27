import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MusicPage from './Music'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/useMusicPlayer')
vi.mock('@/components/Music/NowPlaying', () => ({
    default: () => <div data-testid='now-playing'>NowPlaying</div>,
}))
vi.mock('@/components/Music/SearchBar', () => ({
    default: () => <div data-testid='search-bar'>SearchBar</div>,
}))
vi.mock('@/components/Music/ImportPlaylist', () => ({
    default: () => <div data-testid='import-playlist'>ImportPlaylist</div>,
}))
vi.mock('@/components/Music/QueueList', () => ({
    default: () => <div data-testid='queue-list'>QueueList</div>,
}))

const mockGuild = { id: '123', name: 'Test Guild' }

const mockPlayer = {
    state: {
        isPlaying: false,
        repeatMode: 'off' as const,
        voiceChannelName: null,
        tracks: [],
    },
    isConnected: false,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
    shuffle: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setRepeatMode: vi.fn(),
    removeTrack: vi.fn(),
    clearQueue: vi.fn(),
    importPlaylist: vi.fn(),
    moveTrack: vi.fn(),
}

describe('MusicPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useMusicPlayer).mockReturnValue(mockPlayer as any)
    })

    test('shows no server message when no guild', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('Select a server to control music playback'),
        ).toBeInTheDocument()
    })

    test('renders music player components when guild selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Music Player')).toBeInTheDocument()
        expect(screen.getByTestId('now-playing')).toBeInTheDocument()
        expect(screen.getByTestId('search-bar')).toBeInTheDocument()
        expect(screen.getByTestId('import-playlist')).toBeInTheDocument()
        expect(screen.getByTestId('queue-list')).toBeInTheDocument()
    })

    test('shows not connected message when no voice channel', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('Not connected to a voice channel'),
        ).toBeInTheDocument()
    })

    test('shows connected channel name', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, voiceChannelName: 'General' },
            isConnected: true,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByText(/Connected to General/)).toBeInTheDocument()
    })

    test('shows reconnecting badge when disconnected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByRole('status', { name: /Reconnecting/ }),
        ).toBeInTheDocument()
    })

    test('shows live badge when connected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            isConnected: true,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByRole('status', { name: /Connected/ }),
        ).toBeInTheDocument()
    })

    test('shows error message when player has error', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            error: 'Connection failed',
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
})
