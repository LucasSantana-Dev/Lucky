import type { VoiceBasedChannel } from 'discord.js'
import type {
    CommandExecuteParams,
    CustomClient,
} from '../../../src/types/CommandData.js'

/**
 * Typed casts for music command specs. Specs only populate the fields the
 * command under test reads, so the widening lives here (identity casts, no
 * copies) and call sites get the real types instead of `as never`.
 */
export function asClient(mock: object): CustomClient {
    return mock as unknown as CustomClient
}

export function asVoiceChannel(mock: object = {}): VoiceBasedChannel {
    return mock as unknown as VoiceBasedChannel
}

/**
 * Builds the `{ client, interaction }` argument of `command.execute`. Keys
 * the spec omits stay absent, matching the previous `as never` literals.
 */
export function createCommandParams(parts: object): CommandExecuteParams {
    return parts as unknown as CommandExecuteParams
}
