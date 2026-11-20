import type { ChatInputCommandInteraction } from 'discord.js'
import type { CustomClient } from '../../../src/types/CustomClient.js'

/**
 * Typed fixture factories for command specs. Specs only populate the fields
 * the command under test reads, so the single widening cast lives here and
 * call sites receive the real discord.js type instead of `as never`.
 */
export function createMockInteraction(
    overrides: object = {},
): ChatInputCommandInteraction {
    return { ...overrides } as unknown as ChatInputCommandInteraction
}

export function createMockClient(overrides: object = {}): CustomClient {
    return { ...overrides } as unknown as CustomClient
}

/**
 * Identity-preserving cast for specs that keep asserting on the same object
 * they pass in (or whose mock has getters), where the spread copy made by
 * `createMockInteraction` would change behavior. Defaults to a slash-command
 * interaction; pass a type argument for other interaction kinds.
 */
export function asInteraction<T = ChatInputCommandInteraction>(
    mock: object,
): T {
    return mock as unknown as T
}
