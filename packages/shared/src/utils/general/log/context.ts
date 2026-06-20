import { AsyncLocalStorage } from 'node:async_hooks'

export type LogContext = {
    correlationId?: string
    guildId?: string
    userId?: string
}

const store = new AsyncLocalStorage<LogContext>()

/**
 * Seeds a log context that propagates automatically through all async continuations.
 * Every log call within `fn` will include the context fields without manual threading.
 */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
    return store.run(ctx, fn)
}

export function getLogContext(): LogContext | undefined {
    return store.getStore()
}
