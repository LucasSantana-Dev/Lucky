import type {
    ChatInputCommandInteraction,
    MessageContextMenuCommandInteraction,
} from 'discord.js'
import { warnLog } from '@lucky/shared/utils'
import { commandDurationSeconds, commandsTotal } from './prometheus'
import { getCommandEventBuffer } from './commandEventBuffer'
import type { CommandKind, CommandOutcome } from './commandOutcome'

const UNKNOWN_COMMAND = 'unknown'
const WARN_INTERVAL_MS = 60_000
let lastWarnAt = Number.NEGATIVE_INFINITY

export type RecordCommandEventParams = {
    interaction:
        ChatInputCommandInteraction | MessageContextMenuCommandInteraction
    kind: CommandKind
    outcome: CommandOutcome
    startedAt: number
    /** False when the command was not registered: the label becomes "unknown". */
    known: boolean
    errorClass?: string
}

const readSubcommand = (
    interaction: RecordCommandEventParams['interaction'],
): string | null => {
    const options = (interaction as ChatInputCommandInteraction).options
    return options?.getSubcommand?.(false) ?? null
}

/**
 * Records one command event (buffer row + Prometheus). Never throws and never
 * alters the interaction reply: any failure is counted nowhere else, so it is
 * surfaced through a rate-limited warnLog.
 */
export function recordCommandEvent(params: RecordCommandEventParams): void {
    try {
        const { interaction, kind, outcome, startedAt, known, errorClass } =
            params
        const command = known ? interaction.commandName : UNKNOWN_COMMAND
        const latencyMs = Math.max(0, Date.now() - startedAt)

        commandsTotal.inc({ command, kind, outcome })
        commandDurationSeconds.observe({ command }, latencyMs / 1000)

        getCommandEventBuffer().push({
            occurredAt: new Date(),
            guildId: interaction.guild?.id ?? null,
            userId: interaction.user.id,
            command,
            subcommand: known ? readSubcommand(interaction) : null,
            kind,
            outcome,
            latencyMs: Math.round(latencyMs),
            errorClass: errorClass ?? null,
            shardId:
                interaction.guild?.shardId ??
                interaction.client?.shard?.ids?.[0] ??
                0,
        })
    } catch (error) {
        const now = Date.now()
        if (now - lastWarnAt < WARN_INTERVAL_MS) return
        lastWarnAt = now
        warnLog({
            message: 'Failed to record command event',
            error,
        })
    }
}
