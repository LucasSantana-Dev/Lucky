import type { Readable } from 'node:stream'
import { QueryType, type Player, type Track } from 'discord-player'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { runAsPlayProbe } from '../../handlers/player/probeContext'
import { SOUNDCLOUD_FALLBACK_BLOCKED_EXTRACTORS } from '../../functions/music/commands/play/handlers/resolveProvider'
import {
    playProbeConsecutiveFailures,
    playProbeDurationSeconds,
    playProbeSuccess,
} from '../../utils/monitoring/prometheus'

/**
 * Synthetic play probe (#2920). Runs inside the bot process on its own
 * `Player`, so it needs no second Discord login and joins no voice channel:
 * it resolves each fixed case the way /play does (`player.search`) and reads
 * the first bytes of the stream the track's extractor returns (for YouTube,
 * the resilient stream bridge). Everything runs under `runAsPlayProbe`, which
 * keeps it out of the play metrics, the yt-dlp block breaker, Sentry and
 * `command_events`.
 */

export type ProbeCaseId =
    | 'youtube_watch'
    | 'youtube_music'
    | 'youtu_be'
    | 'youtube_playlist'
    | 'soundcloud_text'

export interface ProbeCase {
    id: ProbeCaseId
    query: string
    kind: 'url' | 'text'
}

export type ProbeStage = 'resolve' | 'first_byte'

export interface ProbeResult {
    id: ProbeCaseId
    ok: boolean
    failedStage?: ProbeStage
    error?: string
    resolveMs?: number
    firstByteMs?: number
}

export const PROBE_INTERVAL_MS = 15 * 60_000
// The bot registers its extractors after ready; the first run after a deploy
// waits for that, then serves as the post-deploy check.
export const PROBE_FIRST_RUN_DELAY_MS = 2 * 60_000
const STAGE_TIMEOUT_MS = 30_000

// "Me at the zoo", the first YouTube upload: public, short and stable.
const DEFAULT_VIDEO_ID = 'jNQXAC9IVRw'
const DEFAULT_TEXT_QUERY = 'lofi hip hop'

/**
 * The fixed cases, from env with stable defaults. The playlist case runs only
 * when `PLAY_PROBE_PLAYLIST_URL` is set: there is no playlist whose
 * permanence we control, so it is the operator's pick.
 */
export function probeCasesFromEnv(env = process.env): ProbeCase[] {
    const videoId = env.PLAY_PROBE_VIDEO_ID?.trim() || DEFAULT_VIDEO_ID
    const cases: ProbeCase[] = [
        {
            id: 'youtube_watch',
            query: `https://www.youtube.com/watch?v=${videoId}`,
            kind: 'url',
        },
        {
            id: 'youtube_music',
            query: `https://music.youtube.com/watch?v=${videoId}`,
            kind: 'url',
        },
        {
            id: 'youtu_be',
            query: `https://youtu.be/${videoId}?si=lucky-probe`,
            kind: 'url',
        },
    ]
    const playlist = env.PLAY_PROBE_PLAYLIST_URL?.trim()
    if (playlist) {
        cases.push({ id: 'youtube_playlist', query: playlist, kind: 'url' })
    }
    cases.push({
        id: 'soundcloud_text',
        query: env.PLAY_PROBE_TEXT_QUERY?.trim() || DEFAULT_TEXT_QUERY,
        kind: 'text',
    })
    return cases
}

export function isPlayProbeEnabled(env = process.env): boolean {
    const raw = env.PLAY_PROBE_ENABLED?.trim().toLowerCase()
    return raw !== 'false' && raw !== '0'
}

// Rejects after `ms` and aborts `controller`, so the losing operation is
// cancelled, not just abandoned: a stream that arrives late is destroyed and
// an HTTP read is aborted (#2920 review). `player.search` takes no signal;
// its extractors run under their own request timeouts.
function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
    controller?: AbortController,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller?.abort()
            reject(new Error(`${label} timed out after ${ms}ms`))
        }, ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function searchOptions(probeCase: ProbeCase) {
    // Same arms /play uses: a URL goes to auto-detection, plain text to the
    // SoundCloud fallback with the extractors that would steal it blocked.
    return probeCase.kind === 'url'
        ? { searchEngine: QueryType.AUTO }
        : {
              searchEngine: QueryType.SOUNDCLOUD_SEARCH,
              blockExtractors: SOUNDCLOUD_FALLBACK_BLOCKED_EXTRACTORS,
          }
}

function readFirstChunk(stream: Readable, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            stream.off('data', onData)
            stream.off('error', onError)
            stream.off('end', onEnd)
            signal.removeEventListener('abort', onAbort)
        }
        const onData = () => {
            cleanup()
            resolve()
        }
        const onError = (error: unknown) => {
            cleanup()
            reject(error instanceof Error ? error : new Error(String(error)))
        }
        const onEnd = () => {
            cleanup()
            reject(new Error('stream ended before the first byte'))
        }
        const onAbort = () => {
            cleanup()
            reject(new Error('aborted'))
        }
        if (signal.aborted) {
            onAbort()
            return
        }
        stream.on('data', onData)
        stream.once('error', onError)
        stream.once('end', onEnd)
        signal.addEventListener('abort', onAbort, { once: true })
    }).finally(() => {
        // Destroying the bridge stream also stops its yt-dlp process.
        stream.destroy()
    })
}

async function readFirstHttpChunk(
    url: string,
    signal: AbortSignal,
): Promise<void> {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok || !response.body) {
            throw new Error(`stream URL answered HTTP ${response.status}`)
        }
        const { done } = await response.body.getReader().read()
        if (done) throw new Error('stream URL returned no bytes')
    } finally {
        signal.removeEventListener('abort', onAbort)
        controller.abort()
    }
}

async function firstByte(track: Track, signal: AbortSignal): Promise<void> {
    const extractor = track.extractor
    if (!extractor) throw new Error('resolved track has no extractor')
    const source = await extractor.stream(track)
    if (typeof source === 'string') return readFirstHttpChunk(source, signal)
    if ('stream' in source && '$fmt' in source) {
        return readFirstChunk(source.stream, signal)
    }
    return readFirstChunk(source as Readable, signal)
}

export async function runProbeCase(
    player: Pick<Player, 'search'>,
    probeCase: ProbeCase,
    timeoutMs = STAGE_TIMEOUT_MS,
): Promise<ProbeResult> {
    return runAsPlayProbe(async () => {
        const resolveStart = Date.now()
        let track: Track | undefined
        try {
            const result = await withTimeout(
                player.search(probeCase.query, searchOptions(probeCase)),
                timeoutMs,
                'resolve',
            )
            track = result.tracks[0]
            if (!track) throw new Error('search returned no tracks')
        } catch (error) {
            return {
                id: probeCase.id,
                ok: false,
                failedStage: 'resolve',
                error: (error as Error).message,
                resolveMs: Date.now() - resolveStart,
            }
        }
        const resolveMs = Date.now() - resolveStart

        const streamStart = Date.now()
        const controller = new AbortController()
        try {
            await withTimeout(
                firstByte(track, controller.signal),
                timeoutMs,
                'first byte',
                controller,
            )
        } catch (error) {
            return {
                id: probeCase.id,
                ok: false,
                failedStage: 'first_byte',
                error: (error as Error).message,
                resolveMs,
                firstByteMs: Date.now() - streamStart,
            }
        }
        return {
            id: probeCase.id,
            ok: true,
            resolveMs,
            firstByteMs: Date.now() - streamStart,
        }
    })
}

const consecutiveFailures = new Map<ProbeCaseId, number>()

function publish(result: ProbeResult): void {
    playProbeSuccess.set({ case: result.id }, result.ok ? 1 : 0)
    if (result.resolveMs !== undefined) {
        playProbeDurationSeconds.set(
            { case: result.id, stage: 'resolve' },
            result.resolveMs / 1000,
        )
    }
    if (result.firstByteMs === undefined) {
        // Failed at resolve: drop the previous run's value instead of
        // showing it as this run's (#2920 review).
        playProbeDurationSeconds.remove({
            case: result.id,
            stage: 'first_byte',
        })
    } else {
        playProbeDurationSeconds.set(
            { case: result.id, stage: 'first_byte' },
            result.firstByteMs / 1000,
        )
    }
    const failures = result.ok
        ? 0
        : (consecutiveFailures.get(result.id) ?? 0) + 1
    consecutiveFailures.set(result.id, failures)
    playProbeConsecutiveFailures.set({ case: result.id }, failures)
}

/** Runs every case one after another (no burst against YouTube). */
export async function runPlayProbe(
    player: Pick<Player, 'search'>,
    cases: ProbeCase[] = probeCasesFromEnv(),
    timeoutMs = STAGE_TIMEOUT_MS,
): Promise<ProbeResult[]> {
    const results: ProbeResult[] = []
    for (const probeCase of cases) {
        // Sequential on purpose: one case at a time, no burst against YouTube.
        const result = await runProbeCase(player, probeCase, timeoutMs) // NOSONAR
        publish(result)
        results.push(result)
        if (!result.ok) {
            warnLog({
                message: 'play probe: case failed',
                data: {
                    case: result.id,
                    stage: result.failedStage,
                    error: result.error,
                    consecutiveFailures: consecutiveFailures.get(result.id),
                },
            })
        }
    }
    infoLog({
        message: 'play probe: run',
        data: {
            ok: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).map((r) => r.id),
        },
    })
    return results
}

// Test-only.
export function __resetPlayProbeStateForTests(): void {
    consecutiveFailures.clear()
}

export class PlayProbeScheduler {
    private firstRun: ReturnType<typeof setTimeout> | undefined
    private interval: ReturnType<typeof setInterval> | undefined
    private running = false

    start(player: Pick<Player, 'search'>): void {
        if (this.firstRun || this.interval) return
        if (!isPlayProbeEnabled()) {
            infoLog({ message: 'play probe: disabled by PLAY_PROBE_ENABLED' })
            return
        }
        const tick = () => {
            if (this.running) return
            this.running = true
            runPlayProbe(player)
                .catch((error) => {
                    warnLog({ message: 'play probe: run crashed', error })
                })
                .finally(() => {
                    this.running = false
                })
        }
        this.firstRun = setTimeout(tick, PROBE_FIRST_RUN_DELAY_MS)
        this.firstRun.unref?.()
        this.interval = setInterval(tick, PROBE_INTERVAL_MS)
        this.interval.unref?.()
        infoLog({
            message: 'play probe: scheduled',
            data: { intervalMs: PROBE_INTERVAL_MS },
        })
    }

    stop(): void {
        clearTimeout(this.firstRun)
        clearInterval(this.interval)
        this.firstRun = undefined
        this.interval = undefined
    }
}

export const playProbeScheduler = new PlayProbeScheduler()
