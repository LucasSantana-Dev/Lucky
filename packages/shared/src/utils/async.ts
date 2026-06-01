/**
 * Async timeout helpers — bound external/IO calls so a hung promise surfaces as
 * a logged, recoverable error instead of an invisible forever-pending operation
 * (the failure mode behind the Musical-Taste Discover hang and the Discord-429
 * guild-context stalls).
 */

/** Rejection produced when a {@link withTimeout} deadline fires first. */
export class TimeoutError extends Error {
    readonly label: string
    readonly timeoutMs: number

    constructor(label: string, timeoutMs: number) {
        super(`Operation "${label}" timed out after ${timeoutMs}ms`)
        this.name = 'TimeoutError'
        this.label = label
        this.timeoutMs = timeoutMs
    }
}

/**
 * Race `promise` against a deadline. If `promise` settles first its result (or
 * rejection) is returned unchanged; if the deadline fires first the returned
 * promise rejects with a {@link TimeoutError} carrying `label`. The timer is
 * always cleared once the race settles, so no handle leaks.
 *
 * Note: the underlying operation is NOT cancelled — JS promises aren't
 * cancellable, so `withTimeout` only stops the CALLER from waiting. Pair it with
 * an `AbortSignal` at the fetch layer when the work itself must be aborted.
 *
 * @param promise   the operation to bound
 * @param timeoutMs deadline in milliseconds
 * @param label     human-readable name for the operation (used in the error)
 */
export const withTimeout = <T>(
    promise: PromiseLike<T>,
    timeoutMs: number,
    label: string,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new TimeoutError(label, timeoutMs)),
            timeoutMs,
        )
    })

    return Promise.race([promise, deadline]).finally(() => {
        if (timer !== undefined) {
            clearTimeout(timer)
        }
    }) as Promise<T>
}
