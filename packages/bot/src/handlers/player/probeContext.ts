import { AsyncLocalStorage } from 'node:async_hooks'

const probeScope = new AsyncLocalStorage<true>()

/**
 * Runs `fn` as a synthetic play probe (#2920). Code reached from inside it
 * (the stream bridge, the yt-dlp block breaker) reads `isPlayProbe()` and
 * leaves out everything that describes real users: play metrics, the
 * breaker state that gates real plays, Sentry events and the
 * "all stages exhausted" log line.
 */
export function runAsPlayProbe<T>(fn: () => Promise<T>): Promise<T> {
    return probeScope.run(true, fn)
}

export function isPlayProbe(): boolean {
    return probeScope.getStore() === true
}
