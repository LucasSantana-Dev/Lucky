import { warnLog } from '@lucky/shared/utils'

/**
 * The commands a new server sees in the picker of the hosted bot
 * (decisions/2026-10-18-music-first-business-review-amendments.md amendment
 * 1, #2736). About 90 global commands and pt-BR `/vaga` in the picker were
 * part of why 28% of adds left within 5 minutes.
 *
 * Music playback, the weekly recap, account linking, and the three support
 * commands (`/help`, `/invite` that the now-playing footer advertises,
 * `/feedback` that error replies point to). A command reaches the hosted
 * picker only by being added here.
 */
export const HOSTED_COMMAND_NAMES: ReadonlySet<string> = new Set([
    'play',
    'pause',
    'skip',
    'stop',
    'leave',
    'queue',
    'nowplaying',
    'shuffle',
    'repeat',
    'volume',
    'autoplay',
    'lyrics',
    'recap',
    'spotify',
    'lastfm',
    'help',
    'invite',
    'feedback',
])

const DISABLED_VALUES = new Set(['false', '0'])
const RECOGNIZED_VALUES = new Set(['false', '0', 'true', '1'])
const SNOWFLAKE = /^\d{17,20}$/

let loggedUnrecognizedValue = false

// Test-only: resets the log-once dedup below.
export function __resetHostedCommandsWarnStateForTests(): void {
    loggedUnrecognizedValue = false
}

/**
 * Whether global registration is limited to `HOSTED_COMMAND_NAMES`. On by
 * default, so the hosted bot needs no env change; a self-hosted copy sets
 * `HOSTED_MUSIC_ONLY_COMMANDS=false` (or `0`) to register every command
 * globally. An unrecognized value logs one warning and keeps the music-only
 * set. Re-reads `process.env` on every call.
 */
export function isHostedMusicOnlyCommands(): boolean {
    const raw = process.env.HOSTED_MUSIC_ONLY_COMMANDS
    if (raw === undefined) return true

    const normalized = raw.trim().toLowerCase()
    if (DISABLED_VALUES.has(normalized)) return false

    if (!RECOGNIZED_VALUES.has(normalized) && !loggedUnrecognizedValue) {
        loggedUnrecognizedValue = true
        warnLog({
            message:
                'HOSTED_MUSIC_ONLY_COMMANDS has an unrecognized value, keeping music-only registration',
            data: { value: raw },
        })
    }

    return true
}

/**
 * Guilds that also get every other command, registered guild-scoped, so the
 * operator's own servers keep moderation, `/vaga` and the rest. Read from
 * `FULL_COMMANDS_GUILD_IDS` (comma separated); entries that are not guild ids
 * are dropped.
 */
export function getFullCommandsGuildIds(): string[] {
    const raw = process.env.FULL_COMMANDS_GUILD_IDS ?? ''
    return [
        ...new Set(
            raw
                .split(',')
                .map((id) => id.trim())
                .filter((id) => SNOWFLAKE.test(id)),
        ),
    ]
}

type NamedCommand = { name: string }

/**
 * Split command payloads into the global set and the set registered only in
 * `getFullCommandsGuildIds()`. With music-only off, everything is global.
 */
export function splitCommandsForRegistration<T extends NamedCommand>(
    commands: T[],
): { global: T[]; guildOnly: T[] } {
    if (!isHostedMusicOnlyCommands()) return { global: commands, guildOnly: [] }

    const global: T[] = []
    const guildOnly: T[] = []
    for (const command of commands) {
        if (HOSTED_COMMAND_NAMES.has(command.name)) global.push(command)
        else guildOnly.push(command)
    }
    return { global, guildOnly }
}

/** Whether a command is in the picker of the given guild. */
export function isCommandAvailableInGuild(
    commandName: string,
    guildId: string | null | undefined,
): boolean {
    if (!isHostedMusicOnlyCommands()) return true
    if (HOSTED_COMMAND_NAMES.has(commandName)) return true
    return guildId != null && getFullCommandsGuildIds().includes(guildId)
}
