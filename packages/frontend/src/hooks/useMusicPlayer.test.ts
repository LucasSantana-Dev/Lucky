import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMusicPlayer } from './useMusicPlayer'
import type { QueueState } from '@/types'

type SendCommand = (
    action: () => Promise<unknown>,
    optimistic?: Partial<QueueState>,
    actionKey?: string,
) => Promise<void> | undefined

const mockCreateSSEConnection = vi.fn()
const mockGetState = vi.fn()
let sendCommand: SendCommand

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
    useMusicCommands: (
        _guildId: string | undefined,
        nextSendCommand: SendCommand,
    ) => {
        sendCommand = nextSendCommand
        return mockMusicCommands
    },
}))

function makeState(guildId: string, volume = 50): QueueState {
    return {
        guildId,
        currentTrack: null,
        tracks: [],
        isPlaying: false,
        isPaused: false,
        volume,
        repeatMode: 'off',
        shuffled: false,
        position: 0,
        voiceChannelId: null,
        voiceChannelName: null,
        timestamp: 0,
    }
}

function createDeferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

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
        vi.useRealTimers()
        mockGetState.mockReset()
        mockGetState.mockResolvedValue({ data: makeState('g1') })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    test('returns empty state when guildId is undefined', () => {
        mockCreateSSEConnection.mockReturnValue({
            close: vi.fn(),
            onopen: null,
            onmessage: null,
            onerror: null,
        })
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
        const newState = {
            guildId: 'guild-1',
            isPlaying: true,
            tracks: [],
            currentTrack: null,
            isPaused: false,
            volume: 80,
            repeatMode: 'off',
            shuffled: false,
            position: 0,
            voiceChannelId: null,
            voiceChannelName: null,
            timestamp: 1,
        }

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

    test('sets isConnected false and calls close on SSE error', async () => {
        const { sse, listeners } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        act(() => {
            listeners.onopen?.()
        })

        await waitFor(() => {
            expect(result.current.isConnected).toBe(true)
        })

        act(() => {
            listeners.onerror?.()
        })

        await waitFor(() => {
            expect(result.current.isConnected).toBe(false)
        })
        expect(sse.close).toHaveBeenCalled()
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
            listeners.onmessage?.({
                data: JSON.stringify({ ...stateBefore, volume: 99 }),
            })
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
        mockGetState.mockResolvedValue({ data: makeState('guild-1', 60) })

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        await waitFor(() => {
            expect(result.current.state.volume).toBe(60)
        })
    })

    test('does not let an old guild rollback update a new visit to that guild', async () => {
        const firstSSE = makeMockSSE()
        const secondSSE = makeMockSSE()
        const thirdSSE = makeMockSSE()
        mockCreateSSEConnection
            .mockReturnValueOnce(firstSSE.sse)
            .mockReturnValueOnce(secondSSE.sse)
            .mockReturnValueOnce(thirdSSE.sse)

        const rollback = createDeferred<{ data: QueueState }>()
        mockGetState
            .mockResolvedValueOnce({ data: makeState('guild-1') })
            .mockReturnValueOnce(rollback.promise)
            .mockResolvedValueOnce({ data: makeState('guild-2', 25) })
            .mockResolvedValueOnce({ data: makeState('guild-1', 35) })

        const { result, rerender } = renderHook(
            ({ guildId }) => useMusicPlayer(guildId),
            { initialProps: { guildId: 'guild-1' } },
        )
        const action = createDeferred<unknown>()
        let command: Promise<void> | undefined

        act(() => {
            command = sendCommand(
                () => action.promise,
                { volume: 75 },
                'volume',
            )
        })
        act(() => action.reject(new Error('command failed')))

        await waitFor(() => expect(mockGetState).toHaveBeenCalledTimes(2))

        rerender({ guildId: 'guild-2' })
        await waitFor(() =>
            expect(result.current.state.guildId).toBe('guild-2'),
        )
        rerender({ guildId: 'guild-1' })
        await waitFor(() => expect(result.current.state.volume).toBe(35))

        rollback.resolve({ data: makeState('guild-1', 99) })
        await act(async () => {
            await command
        })

        expect(result.current.state.guildId).toBe('guild-1')
        expect(result.current.state.volume).toBe(35)
        expect(result.current.error).toBeNull()
    })

    test('does not let a finishing command clear a newer pending action', async () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)
        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        const firstAction = createDeferred<unknown>()
        const secondAction = createDeferred<unknown>()
        let firstCommand: Promise<void> | undefined
        let secondCommand: Promise<void> | undefined

        act(() => {
            firstCommand = sendCommand(
                () => firstAction.promise,
                undefined,
                'pause',
            )
        })
        act(() => {
            secondCommand = sendCommand(
                () => secondAction.promise,
                undefined,
                'skip',
            )
        })

        expect(result.current.pendingAction).toBe('skip')
        expect(result.current.isLoading).toBe(true)

        firstAction.resolve(undefined)
        await act(async () => {
            await firstCommand
        })

        expect(result.current.pendingAction).toBe('skip')
        expect(result.current.isLoading).toBe(true)

        secondAction.resolve(undefined)
        await act(async () => {
            await secondCommand
        })

        expect(result.current.pendingAction).toBeNull()
        expect(result.current.isLoading).toBe(false)
    })

    test('keeps the older action pending when the newer action finishes first', async () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)
        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        const firstAction = createDeferred<unknown>()
        const secondAction = createDeferred<unknown>()
        let firstCommand: Promise<void> | undefined
        let secondCommand: Promise<void> | undefined

        act(() => {
            firstCommand = sendCommand(
                () => firstAction.promise,
                undefined,
                'pause',
            )
        })
        act(() => {
            secondCommand = sendCommand(
                () => secondAction.promise,
                undefined,
                'skip',
            )
        })

        expect(result.current.pendingAction).toBe('skip')
        expect(result.current.isLoading).toBe(true)

        secondAction.resolve(undefined)
        await act(async () => {
            await secondCommand
        })

        expect(result.current.pendingAction).toBe('pause')
        expect(result.current.isLoading).toBe(true)

        firstAction.resolve(undefined)
        await act(async () => {
            await firstCommand
        })

        expect(result.current.pendingAction).toBeNull()
        expect(result.current.isLoading).toBe(false)
    })

    test('surfaces a rollback queue refresh failure', async () => {
        const { sse } = makeMockSSE()
        mockCreateSSEConnection.mockReturnValue(sse)
        mockGetState
            .mockResolvedValueOnce({ data: makeState('guild-1') })
            .mockRejectedValueOnce(new Error('refresh unavailable'))

        const { result } = renderHook(() => useMusicPlayer('guild-1'))

        await act(async () => {
            await sendCommand(
                () => Promise.reject(new Error('command failed')),
                { volume: 75 },
                'volume',
            )
        })

        expect(result.current.error).toBe(
            'volume: command failed. Queue refresh failed: refresh unavailable',
        )
    })
})
