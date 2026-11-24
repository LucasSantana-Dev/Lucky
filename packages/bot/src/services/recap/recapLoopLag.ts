import { monitorEventLoopDelay } from 'node:perf_hooks'

/** Event-loop lag over a window, in whole milliseconds. */
export type LoopLag = {
    maxMs: number
    p99Ms: number
    meanMs: number
}

const DEFAULT_RESOLUTION_MS = 20

/**
 * Starts sampling event-loop lag; the returned function stops sampling and
 * reads it. A blocked loop fires every timer late, including the cover
 * timeouts, so a stalled cover phase with a high max here points at the bot
 * and not at the CDN (#3309).
 *
 * The histogram records the whole interval between samples, so the
 * resolution is subtracted to leave only the delay. A window shorter than one
 * sample reads as zero.
 */
export function startLoopLagProbe(
    resolutionMs = DEFAULT_RESOLUTION_MS,
): () => LoopLag {
    const histogram = monitorEventLoopDelay({ resolution: resolutionMs })
    histogram.enable()
    return () => {
        histogram.disable()
        if (histogram.count === 0) return { maxMs: 0, p99Ms: 0, meanMs: 0 }
        const lagMs = (ns: number) =>
            Math.max(0, Math.round(ns / 1e6 - resolutionMs))
        return {
            maxMs: lagMs(histogram.max),
            p99Ms: lagMs(histogram.percentile(99)),
            meanMs: lagMs(histogram.mean),
        }
    }
}
