const intervals: ReturnType<typeof setInterval>[] = []
const timeouts: ReturnType<typeof setTimeout>[] = []

export function safeSetInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = setInterval(fn, ms)
    intervals.push(id)
    return id
}

export function safeSetTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(fn, ms)
    timeouts.push(id)
    return id
}

export function clearAllTimers() {
    intervals.forEach(clearInterval)
    timeouts.forEach(clearTimeout)
    intervals.length = 0
    timeouts.length = 0
}
