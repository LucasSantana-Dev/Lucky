// Centralized timer manager for intervals and timeouts
const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];

export function safeSetInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const id = setInterval(fn, ms);
    intervals.push(id);
    return id;
}

export function safeSetTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const id = setTimeout(fn, ms);
    timeouts.push(id);
    return id;
}

export function clearAllTimers() {
    intervals.forEach(clearInterval);
    timeouts.forEach(clearTimeout);
    intervals.length = 0;
    timeouts.length = 0;
} 