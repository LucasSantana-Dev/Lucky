import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/services/api'
import { useMusicCommands } from './useMusicCommands'
import type { QueueState } from '@/types'

const EMPTY_STATE: QueueState = {
    guildId: '',
    currentTrack: null,
    tracks: [],
    isPlaying: false,
    isPaused: false,
    volume: 50,
    repeatMode: 'off',
    shuffled: false,
    position: 0,
    voiceChannelId: null,
    voiceChannelName: null,
    timestamp: Date.now(),
}

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000

export function useMusicPlayer(guildId: string | undefined) {
    const [state, setState] = useState<QueueState>(EMPTY_STATE)
    const [isLoading, setIsLoading] = useState(false)
    const [pendingAction, setPendingAction] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const sseRef = useRef<EventSource | null>(null)
    const retryRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        // Drop guild-scoped UI state so an error/pending from guild A never
        // sticks around after switching to guild B (or deselecting).
        setError(null)
        setPendingAction(null)
        setIsLoading(false)

        if (!guildId) {
            setState(EMPTY_STATE)
            setIsConnected(false)
            return
        }

        let cancelled = false

        function connect() {
            if (cancelled) return

            const sse = api.music.createSSEConnection(guildId!)
            sseRef.current = sse

            sse.onopen = () => {
                if (cancelled) return
                retryRef.current = 0
                setIsConnected(true)
            }

            sse.onmessage = (event) => {
                if (cancelled) return
                try {
                    setState(JSON.parse(event.data))
                } catch {
                    /* heartbeat or malformed data */
                }
            }

            sse.onerror = () => {
                if (cancelled) return

                sse.close()
                sseRef.current = null
                setIsConnected(false)

                const delay = Math.min(
                    BASE_RECONNECT_DELAY * 2 ** retryRef.current,
                    MAX_RECONNECT_DELAY,
                )
                retryRef.current++
                retryTimerRef.current = setTimeout(connect, delay)
            }
        }

        connect()

        api.music
            .getState(guildId)
            .then((res) => {
                if (!cancelled) setState(res.data)
            })
            .catch(() => {})

        return () => {
            cancelled = true
            sseRef.current?.close()
            sseRef.current = null
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
            setIsConnected(false)
        }
    }, [guildId])

    const sendCommand = useCallback(
        async (
            action: () => Promise<unknown>,
            optimistic?: Partial<QueueState>,
            actionKey?: string,
        ) => {
            if (!guildId) return
            setIsLoading(true)
            if (actionKey) setPendingAction(actionKey)
            setError(null)

            if (optimistic) {
                setState((prev) => ({ ...prev, ...optimistic }))
            }

            try {
                await action()
            } catch (err) {
                if (optimistic) {
                    api.music
                        .getState(guildId)
                        .then((res) => setState(res.data))
                        .catch(() => {})
                }
                const base =
                    err instanceof Error ? err.message : 'Command failed'
                setError(actionKey ? `${actionKey}: ${base}` : base)
            } finally {
                setIsLoading(false)
                setPendingAction(null)
            }
        },
        [guildId],
    )

    const commands = useMusicCommands(guildId, sendCommand, state.tracks)

    return {
        state,
        isLoading,
        pendingAction,
        isConnected,
        error,
        clearError: () => setError(null),
        ...commands,
    }
}
