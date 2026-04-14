import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMusicPlayer } from './useMusicPlayer'

const mockCreateSSEConnection = vi.fn()
const mockGetState = vi.fn()
const mockMusicCommands = {
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    shuffle: vi.fn(),
    setRepeatMode: vi.fn(),
    seek: vi.fn(),
    removeTrack: vi.fn(),
    moveTrack: vi.fn(),
    clearQueue: vi.fn(),
    importPlaylist: vi.fn(),
}

vi.mock('@/services/api', () => ({
    api: {
        music: {
            createSSEConnection: (...args: unknown[]) =>
                mockCreateSSEConnection(...args),
            getState: (...args: unknown[]) => mockGetState(...args),
        },
    },
}))

vi.mock('./useMusicCommands', () => ({
    useMusicCommands: () => mockMusicCommands,
}))

function makeMockSSE() {
    const listeners: {
        onopen?: () => void
        onmessage?: (e: { data: string }) => void
        onerror?: () => void
    } = {}
    const sse = {
        close: vi.fn(),
        set onopen(fn: (() => void) | null) {
            if (fn) listeners.onopen = fn
        },
        set onmessage(fn: ((e: { data: string }) => void) | null) {
            if (fn) listeners.onmessage = fn
        },
        set onerror(fn: (() => void) | null) {
            if (fn) listeners.onerror = fn
        },
        trigger: listeners,
    }
    return { sse, listeners }
}

describe('useMusicPlayer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetState.mockResolvedValue({ data: { guildId: 'g1', isPlaying: false, tracks: [], currentTrack: null, isPaused: false, volume: 50, repeatMode: 'off', shuffled: false, position: 0, voiceChannelId: null, voiceChannelName: null, timestamp: 0 } })
    })

    test('returns empty state when guildId is undefined', () => {
        mockCreateSSEConnection.mockReturnValue({ close: vi.fn(), onopen: null, onmessage: null, onerror: null })
        const { result } = renderHook(() => useMusicPlayer(undefined))
        expect(result.current.state.guildId).toBe('')
        expect(result.current.isConnected).toBe(false)
    })

    test('creates SSE connection when guildId is provided', () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        renderHook(() => useMusicPlayer('guild-1'))

        expect(mockCreateSSEConnection).toHaveBeenCalledWith('guild-1')
    })

    test('sets isConnected true when SSE opens', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        act(() => {
            listeners.onopen?.()
        })

        await waitFor(() => {
            expect(result.current.isConnected).toBe(true)
        })
    })

    test('updates state when SSE message received', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)
        const newState = { guildId: 'guild-1', isPlaying: true, tracks: [], currentTrack: null, isPaused: false, volume: 80, repeatMode: 'off', shuffled: false, position: 0, voiceChannelId: null, voiceChannelName: null, timestamp: 1 }

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        act(() => {
            listeners.onmessage?.({ data: JSON.stringify(newState) })
        })

        await waitFor(() => {
            expect(result.current.state.volume).toBe(80)
        })
    })

    test('ignores malformed SSE messages gracefully', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result } = renderHook(() => useMusicPlayer('guild-1'))
        const volumeBefore = result.current.state.volume

        act(() => {
            listeners.onmessage?.({ data: ': heartbeat' })
        })

        expect(result.current.state.volume).toBe(volumeBefore)
    })

    test('sets isConnected false and schedules reconnect on SSE error', async () => {
        vi.useFakeTimers()
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        act(() => {
            listeners.onopen?.()
        })

        act(() => {
            listeners.onerror?.()
        })

        await waitFor(() => {
            expect(result.current.isConnected).toBe(false)
        })
        expect(sse.close).toHaveBeenCalled()

        vi.useRealTimers()
    })

    test('does not update state after unmount (cancelled flag)', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result, unmount } = renderHook(() => useMusicPlayer('guild-1'))

        unmount()

        act(() => {
            listeners.onopen?.()
        })

        expect(result.current.isConnected).toBe(false)
    })

    test('does not process SSE message after unmount', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result, unmount } = renderHook(() => useMusicPlayer('guild-1'))
        const stateBefore = result.current.state

        unmount()

        act(() => {
            listeners.onmessage?.({ data: JSON.stringify({ ...stateBefore, volume: 99 }) })
        })

        expect(result.current.state.volume).not.toBe(99)
    })

    test('closes SSE connection on unmount', () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { unmount } = renderHook(() => useMusicPlayer('guild-1'))

        unmount()

        expect(sse.close).toHaveBeenCalled()
    })

    test('fetches initial state via REST on mount', async () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)
        const restState = { guildId: 'guild-1', isPlaying: true, tracks: [], currentTrack: null, isPaused: false, volume: 60, repeatMode: 'off', shuffled: false, position: 0, voiceChannelId: null, voiceChannelName: null, timestamp: 0 }
        mockGetState.mockResolvedValue({ data: restState })

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        await waitFor(() => {
            expect(result.current.state.volume).toBe(60)
        })
    })
})
