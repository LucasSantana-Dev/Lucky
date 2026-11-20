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
