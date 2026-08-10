/**
 * Provider interface for skip state in autoplay.
 * Injected to break circular dependency between replenisher and trackHandlers.
 */

export type SkipStateProvider = () => number
