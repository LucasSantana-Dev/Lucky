import {
    useState,
    useEffect,
    useLayoutEffect,
    useCallback,
    useRef,
} from 'react'
import { api } from '@/services/api'
import { useMusicCommands, type MusicActionKey } from './useMusicCommands'
import type { QueueState } from '@/types'

export type { MusicActionKey }

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
    // Global lockout key while any command is in flight (spinner is per-action;
    // disabling is intentionally all-or-nothing so concurrent mutations cannot
    // race on the same queue).
    const [pendingAction, setPendingAction] = useState<MusicActionKey | null>(
        null,
    )
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /**
     * Wall-clock ms of the last state payload (SSE or REST), OR of a failed
     * initial-load attempt. Stays null only while the first attempt for the
     * current guild is still in flight — the UI treats null as "loading"
     * and non-null as "done, render what we have" (state, or an error).
     */
    const [lastStateUpdate, setLastStateUpdate] = useState<number | null>(null)
    const sseRef = useRef<EventSource | null>(null)
    const retryRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Tracks the selected guild for UI resets. Command validity uses the
    // activeCommands map (cleared on every guild change), not guild id alone,
    // so a navigate-away-and-back cannot revive a stale in-flight command.
    const guildRef = useRef(guildId)
    const commandIdRef = useRef(0)
    const activeCommandsRef = useRef(
        new Map<
            number,
            { guildId: string | undefined; actionKey?: MusicActionKey }
        >(),
    )
    // True only while `error` holds the "initial load failed" message (set
    // below) and no live signal has arrived since. Scopes the auto-clear to
    // that one message so a real command-failure error (set elsewhere) is
    // never silently cleared by an unrelated heartbeat or state payload.
    const initialLoadFailedRef = useRef(false)

    useLayoutEffect(() => {
        guildRef.current = guildId
        activeCommandsRef.current.clear()
        setState(EMPTY_STATE)
        setError(null)
        setPendingAction(null)
        setIsLoading(false)
        initialLoadFailedRef.current = false
        // Without this, switching from guild A (which already has a
        // timestamp) straight to guild B renders the freshly-reset
        // EMPTY_STATE as "loaded" (lastStateUpdate !== null) instead of
        // showing the loading skeleton while B's first payload is in flight.
        setLastStateUpdate(null)
    }, [guildId])

    const clearInitialLoadFailure = useCallback(() => {
        if (!initialLoadFailedRef.current) return
        initialLoadFailedRef.current = false
        setError(null)
    }, [])

    const applyState = useCallback(
        (next: QueueState) => {
            setState(next)
            setLastStateUpdate(Date.now())
            clearInitialLoadFailure()
        },
        [clearInitialLoadFailure],
    )

    useEffect(() => {
        if (!guildId) {
            setState(EMPTY_STATE)
            setIsConnected(false)
            setLastStateUpdate(null)
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
                    const payload = JSON.parse(event.data) as {
                        type?: string
                    } & QueueState
                    // Heartbeat is liveness only; do not clobber queue state.
                    if (payload?.type === 'heartbeat') {
                        setLastStateUpdate(Date.now())
                        clearInitialLoadFailure()
                        return
                    }
                    applyState(payload)
                } catch {
                    /* malformed data */
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
                if (!cancelled) applyState(res.data)
            })
            .catch(() => {
                if (cancelled) return
                // SSE alone can't be trusted to ever open (API down, 403,
                // etc.), so a swallowed failure here previously left
                // lastStateUpdate null forever: the hero and queue skeletons
                // never resolved and nothing told the user why. Recording
                // the failure the same way a successful load is recorded
                // (stamping lastStateUpdate) lets the existing "no track" /
                // "empty queue" UI take over instead of a stuck skeleton,
                // and setError surfaces the reason via the existing error
                // banner. initialLoadFailedRef marks this specific error so
                // it clears itself the moment SSE actually delivers
                // something (state or heartbeat) instead of outliving a
                // recovered connection.
                setLastStateUpdate(Date.now())
                initialLoadFailedRef.current = true
                setError(
                    'Could not load the music player. Check your connection and try refreshing the page.',
                )
            })

        return () => {
            cancelled = true
            sseRef.current?.close()
            sseRef.current = null
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
            setIsConnected(false)
        }
    }, [guildId, applyState, clearInitialLoadFailure])

    const sendCommand = useCallback(
        async (
            action: () => Promise<unknown>,
            optimistic?: Partial<QueueState>,
            actionKey?: MusicActionKey,
        ) => {
            const commandGuildId = guildId
            if (!commandGuildId || guildRef.current !== commandGuildId) return

            const commandId = ++commandIdRef.current
            // Membership in activeCommands means "issued during the current visit".
            // The map is cleared on every guildId change, so A→B→A cannot revive a
            // command from the first visit to A (guild-id equality alone would).
            const isLiveCommand = () => activeCommandsRef.current.has(commandId)

            activeCommandsRef.current.set(commandId, {
                guildId: commandGuildId,
                actionKey,
            })
            setIsLoading(true)
            if (actionKey) setPendingAction(actionKey)
            setError(null)

            if (optimistic) {
                setState((prev) => ({ ...prev, ...optimistic }))
            }

            try {
                await action()
            } catch (err) {
                if (!isLiveCommand()) return

                const base =
                    err instanceof Error ? err.message : 'Command failed'
                const commandError = actionKey ? `${actionKey}: ${base}` : base

                if (optimistic) {
                    try {
                        const response =
                            await api.music.getState(commandGuildId)
                        // applyState (not setState) so the rollback refresh
                        // also stamps liveness for the stale-progress logic.
                        if (isLiveCommand()) applyState(response.data)
                    } catch (refreshError) {
                        if (!isLiveCommand()) return
                        const refreshMessage =
                            refreshError instanceof Error
                                ? refreshError.message
                                : 'Unknown error'
                        // A command error now owns `error`; if an initial-load
                        // failure set it first, invalidate that marker so the
                        // next heartbeat/state doesn't wipe out this newer,
                        // unrelated error thinking it's still the old one.
                        initialLoadFailedRef.current = false
                        setError(
                            `${commandError}. Queue refresh failed: ${refreshMessage}`,
                        )
                        return
                    }
                }

                if (isLiveCommand()) {
                    initialLoadFailedRef.current = false
                    setError(commandError)
                }
            } finally {
                const wasLive = activeCommandsRef.current.has(commandId)
                activeCommandsRef.current.delete(commandId)
                if (wasLive) {
                    const activeCommands = Array.from(
                        activeCommandsRef.current.values(),
                    )
                    // FIFO: show spinner on the oldest in-flight actionKey.
                    const pendingCommand = activeCommands.find(
                        (command) => command.actionKey,
                    )
                    setIsLoading(activeCommands.length > 0)
                    setPendingAction(pendingCommand?.actionKey ?? null)
                }
            }
        },
        [guildId, applyState],
    )

    const clearError = useCallback(() => setError(null), [])

    const commands = useMusicCommands(guildId, sendCommand, state.tracks)

    return {
        state,
        isLoading,
        pendingAction,
        isConnected,
        error,
        lastStateUpdate,
        clearError,
        ...commands,
    }
}
