import {
    useState,
    useEffect,
    useLayoutEffect,
    useCallback,
    useMemo,
    useRef,
} from 'react'
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
    const guildToken = useMemo(() => Symbol('guild'), [guildId])
    const activeGuildTokenRef = useRef<symbol | null>(null)
    const commandIdRef = useRef(0)
    const activeCommandsRef = useRef(
        new Map<number, { guildToken: symbol; actionKey?: string }>(),
    )

    useLayoutEffect(() => {
        activeGuildTokenRef.current = guildToken
        activeCommandsRef.current.clear()
        setState(EMPTY_STATE)
        setError(null)
        setPendingAction(null)
        setIsLoading(false)

        return () => {
            if (activeGuildTokenRef.current === guildToken) {
                activeGuildTokenRef.current = null
            }
        }
    }, [guildToken])

    useEffect(() => {
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
            if (!guildId || activeGuildTokenRef.current !== guildToken) return

            const commandId = ++commandIdRef.current
            const isCurrentGuild = () =>
                activeGuildTokenRef.current === guildToken

            activeCommandsRef.current.set(commandId, { guildToken, actionKey })
            setIsLoading(true)
            if (actionKey) setPendingAction(actionKey)
            setError(null)

            if (optimistic) {
                setState((prev) => ({ ...prev, ...optimistic }))
            }

            try {
                await action()
            } catch (err) {
                if (!isCurrentGuild()) return

                const base =
                    err instanceof Error ? err.message : 'Command failed'
                const commandError = actionKey ? `${actionKey}: ${base}` : base

                if (optimistic) {
                    try {
                        const response = await api.music.getState(guildId)
                        if (isCurrentGuild()) setState(response.data)
                    } catch (refreshError) {
                        if (!isCurrentGuild()) return
                        const refreshMessage =
                            refreshError instanceof Error
                                ? refreshError.message
                                : 'Unknown error'
                        setError(
                            `${commandError}. Queue refresh failed: ${refreshMessage}`,
                        )
                        return
                    }
                }

                if (isCurrentGuild()) setError(commandError)
            } finally {
                activeCommandsRef.current.delete(commandId)
                if (isCurrentGuild()) {
                    const activeCommands = Array.from(
                        activeCommandsRef.current.values(),
                    ).filter((command) => command.guildToken === guildToken)
                    const pendingCommand = activeCommands
                        .slice()
                        .reverse()
                        .find((command) => command.actionKey)
                    setIsLoading(activeCommands.length > 0)
                    setPendingAction(pendingCommand?.actionKey ?? null)
                }
            }
        },
        [guildId, guildToken],
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
