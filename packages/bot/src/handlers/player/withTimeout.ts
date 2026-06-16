/**
 * Races a promise against a timeout so an unbounded hang (e.g. an unmaintained
 * dependency's network call) cannot stall a sequential init chain. On timeout
 * the returned promise rejects with a labelled error; otherwise it settles with
 * the underlying promise's value or rejection.
 */
export const withTimeout = async <T>(
    promise: Promise<T>,
    ms: number,
    label: string,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${ms}ms`)),
            ms,
        )
    })
    try {
        return await Promise.race([promise, timeout])
    } finally {
        // `timer` is always assigned: the Promise executor above runs
        // synchronously during construction, before this finally can run.
        // clearTimeout tolerates undefined regardless, so no guard is needed.
        clearTimeout(timer)
    }
}
