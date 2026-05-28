import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MusicPage from './Music'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/useMusicPlayer')
vi.mock('@/components/Music/SearchBar', () => ({
    default: () => <div data-testid='search-bar'>SearchBar</div>,
}))
vi.mock('@/components/Music/ImportPlaylist', () => ({
    default: () => <div data-testid='import-playlist'>ImportPlaylist</div>,
}))
vi.mock('@/components/Music/QueueList', () => ({
    default: () => <div data-testid='queue-list'>QueueList</div>,
}))
vi.mock('@/components/Music/AutoplayGenres', () => ({
    default: () => <div data-testid='autoplay-genres'>AutoplayGenres</div>,
}))

const mockGuild = { id: '123', name: 'Test Guild' }

const mockTrack = {
    id: '1',
    title: 'Test Song',
    author: 'Test Artist',
    url: 'https://youtube.com/watch?v=test',
    thumbnail: 'https://example.com/thumb.jpg',
    duration: 180,
    durationFormatted: '3:00',
    requestedBy: 'User',
    source: 'youtube' as const,
}

const mockPlayer = {
    state: {
        isPlaying: false,
        isPaused: false,
        repeatMode: 'off' as const,
        voiceChannelName: null,
        tracks: [],
        position: 0,
        volume: 50,
        shuffled: false,
        guildId: '123',
        currentTrack: null,
        voiceChannelId: null,
        timestamp: Date.now(),
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
        expect(screen.getByText('Nothing playing')).toBeInTheDocument()
        expect(screen.getByTestId('search-bar')).toBeInTheDocument()
        expect(screen.getByTestId('import-playlist')).toBeInTheDocument()
        expect(screen.getByTestId('queue-list')).toBeInTheDocument()
        expect(screen.getByTestId('autoplay-genres')).toBeInTheDocument()
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

    test('renders now playing hero when track is in queue', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, tracks: [mockTrack] },
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Test Song')).toBeInTheDocument()
        expect(screen.getByText('Test Artist')).toBeInTheDocument()
        expect(screen.getByText('Now Playing')).toBeInTheDocument()
    })

    test('shows track thumbnail when available', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, tracks: [mockTrack] },
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        const img = screen.getByRole('img', { name: 'Test Song' })
        expect(img).toHaveAttribute('src', mockTrack.thumbnail)
    })

    test('shows pause button when track is playing', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                isPlaying: true,
            },
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByRole('button', { name: 'Pause' }),
        ).toBeInTheDocument()
    })

    test('shows play button when track is paused', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                isPlaying: false,
            },
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    })

    test('calls resume when play button clicked while paused', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockResume = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                isPlaying: false,
            },
            resume: mockResume,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Play' }))
        expect(mockResume).toHaveBeenCalledOnce()
    })

    test('calls pause when pause button clicked while playing', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockPause = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                isPlaying: true,
            },
            pause: mockPause,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
        expect(mockPause).toHaveBeenCalledOnce()
    })

    test('calls skip when next track button clicked', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockSkip = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, tracks: [mockTrack] },
            skip: mockSkip,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Next track' }))
        expect(mockSkip).toHaveBeenCalledOnce()
    })

    test('calls shuffle when shuffle button clicked', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockShuffle = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, tracks: [mockTrack] },
            shuffle: mockShuffle,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
        expect(mockShuffle).toHaveBeenCalledOnce()
    })

    test('calls setRepeatMode when repeat button clicked', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockSetRepeatMode = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                repeatMode: 'off',
            },
            setRepeatMode: mockSetRepeatMode,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: /Repeat: off/ }))
        expect(mockSetRepeatMode).toHaveBeenCalledWith('track')
    })

    test('cycles repeat mode from track to queue', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockSetRepeatMode = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                repeatMode: 'track',
            },
            setRepeatMode: mockSetRepeatMode,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByRole('button', { name: /Repeat: track/ }))
        expect(mockSetRepeatMode).toHaveBeenCalledWith('queue')
    })

    test('calls setVolume when volume slider changes', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        const mockSetVolume = vi.fn()
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: { ...mockPlayer.state, tracks: [mockTrack], volume: 50 },
            setVolume: mockSetVolume,
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), {
            target: { value: '80' },
        })
        expect(mockSetVolume).toHaveBeenCalledWith(80)
    })

    test('formats track position and duration', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(useMusicPlayer).mockReturnValue({
            ...mockPlayer,
            state: {
                ...mockPlayer.state,
                tracks: [mockTrack],
                position: 65,
            },
        } as any)
        render(
            <MemoryRouter>
                <MusicPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('1:05')).toBeInTheDocument()
        expect(screen.getByText('3:00')).toBeInTheDocument()
    })
})
