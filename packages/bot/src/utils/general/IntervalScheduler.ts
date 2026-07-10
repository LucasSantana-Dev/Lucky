import type { Client } from 'discord.js'
import { errorLog } from '@lucky/shared/utils'

/**
 * Base class for interval-based schedulers that run periodic tasks.
 *
 * Manages the common lifecycle: start (setup timer), stop (cleanup), and tick (execute with guards).
 * Subclasses implement the domain-specific logic in `execute()`.
 */
export abstract class IntervalScheduler {
    protected readonly tickIntervalMs: number
    protected timer: ReturnType<typeof setInterval> | null = null
    protected client: Client | null = null
    protected tickInProgress = false

    constructor(tickIntervalMs: number) {
        this.tickIntervalMs = tickIntervalMs
    }

    start(client: Client): void {
        if (this.timer) return
        this.client = client
        this.onStart()
        this.timer = setInterval(() => void this.tick(), this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    async tick(): Promise<void> {
        if (this.tickInProgress || !this.client) return
        this.tickInProgress = true
        try {
            await this.execute()
        } catch (error) {
            this.handleError(error)
        } finally {
            this.tickInProgress = false
        }
    }

    /**
     * Hook called when the scheduler starts, before the timer is set up.
     * Subclasses can override to run domain-specific initialization, e.g., running
     * tick immediately to handle startup boundary conditions.
     */
    protected onStart(): void {
        // Default: do nothing. Subclasses can override.
    }

    /**
     * Domain-specific tick logic. Implemented by subclasses.
     * Called periodically by the interval and protected from concurrent execution
     * by the tickInProgress guard.
     */
    protected abstract execute(): Promise<void>

    /**
     * Error handler for failures during execute(). Subclasses can override
     * for custom error handling.
     */
    protected handleError(error: unknown): void {
        errorLog({
            message: `${this.constructor.name} tick failed`,
            error: error as Error,
        })
    }
}
