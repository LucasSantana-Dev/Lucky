/**
 * Command and event loading type definitions
 */

export interface CommandModule {
    default?: Command
    command?: Command
}

export interface EventModule {
    name?: string
    execute?: (...args: unknown[]) => unknown
    once?: boolean
}

export interface Command {
    data: {
        name: string
    }
}

export interface EventHandler {
    (...args: unknown[]): void
}

export interface ProcessHandlers {
    stdout?: {
        on: (event: string, callback: (data: Buffer) => void) => void
    }
    stderr?: {
        on: (event: string, callback: (data: Buffer) => void) => void
    }
    on: (event: string, callback: (code: number | null) => void) => void
    kill: () => void
}
