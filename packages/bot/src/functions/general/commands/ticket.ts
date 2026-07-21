import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type Guild,
    type OverwriteResolvable,
    type TextChannel,
} from 'discord.js'
import Command from '../../../models/Command'
import {
    guildSettingsService,
    supportSessionService,
} from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

// Tickets auto-close 24h after opening (swept by supportSessionScheduler).
const TICKET_TTL_MS = 24 * 60 * 60 * 1000

// Discord REST error code: the channel truly no longer exists.
const UNKNOWN_CHANNEL = 10003

async function handleOpen(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
): Promise<void> {
    const settings = await guildSettingsService.getGuildSettings(guild.id)
    const categoryId = settings?.supportCategoryId
    const agentRoleId = settings?.supportAgentRoleId
    if (!categoryId || !agentRoleId) {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ Tickets are not configured. An admin must run `/ticket-setup set` first.',
            },
        })
        return
    }

    const existing = await supportSessionService.getActiveForUser(
        guild.id,
        interaction.user.id,
    )
    if (existing) {
        // Only reopen if the channel is CONFIRMED gone (10003). A transient
        // fetch error must not close a live ticket and let a duplicate open —
        // treat "not confirmed gone" as still-open and block.
        let channelGone = false
        try {
            await guild.channels.fetch(existing.channelId)
        } catch (err) {
            channelGone = (err as { code?: number })?.code === UNKNOWN_CHANNEL
        }
        if (!channelGone) {
            await interactionReply({
                interaction,
                content: {
                    content: `❌ You already have an open ticket: <#${existing.channelId}>. Close it before opening another.`,
                },
            })
            return
        }
        // Channel was deleted out-of-band — close the orphan row and continue.
        await supportSessionService.close(existing.id).catch(() => {})
    }

    let channel: TextChannel
    try {
        channel = (await guild.channels.create({
            name: `ticket-${interaction.user.username}`.slice(0, 90),
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: buildTicketOverwrites(
                guild,
                interaction.user.id,
                agentRoleId,
            ),
            reason: `Support ticket opened by ${interaction.user.tag}`,
        })) as TextChannel
    } catch (error) {
        errorLog({ message: 'Failed to create ticket channel', error })
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ Could not create the ticket channel. Check the bot has Manage Channels in the support category.',
            },
        })
        return
    }

    try {
        await supportSessionService.open({
            guildId: guild.id,
            channelId: channel.id,
            requestorId: interaction.user.id,
            expiresAt: new Date(Date.now() + TICKET_TTL_MS),
        })
    } catch (error) {
        // Roll the channel back so a failed — or race-lost (P2002 on the
        // one-open-per-user unique index) — record never orphans a channel. If
        // the rollback delete itself fails, surface it (the sweep can't help —
        // there's no session row to expire).
        await channel.delete('Ticket record failed').catch((delErr) =>
            errorLog({
                message: `Failed to roll back orphaned ticket channel ${channel.id}`,
                error: delErr,
            }),
        )
        const raced = (error as { code?: string })?.code === 'P2002'
        errorLog({ message: 'Failed to record ticket session', error })
        await interactionReply({
            interaction,
            content: {
                content: raced
                    ? '❌ You already have an open ticket (opened moments ago).'
                    : '❌ Could not open the ticket. Please try again.',
            },
        })
        return
    }

    // Welcome message is best-effort — a send failure must not tear down an
    // already-valid ticket.
    const reason = interaction.options.getString('reason')
    await channel
        .send({
            content: `👋 <@${interaction.user.id}> — a support agent (<@&${agentRoleId}>) will be with you.${
                reason ? `\n**Reason:** ${reason}` : ''
            }\n\nThis ticket auto-closes in 24h, or use \`/ticket close\`.`,
            // Scope mentions to the intended targets only, so a `reason`
            // containing @everyone / a role mention can't ping the server.
            allowedMentions: {
                users: [interaction.user.id],
                roles: [agentRoleId],
            },
        })
        .catch((error) =>
            errorLog({ message: 'Ticket welcome message failed', error }),
        )

    await interactionReply({
        interaction,
        content: { content: `✅ Ticket opened: <#${channel.id}>` },
    })
    infoLog({
        message: 'Support ticket opened',
        data: { guildId: guild.id, channelId: channel.id },
    })
}

/** @everyone denied; the requestor and every support agent (via the persistent
 * role) get access — no per-session role is minted (avoids the 500-role cap). */
function buildTicketOverwrites(
    guild: Guild,
    requestorId: string,
    agentRoleId: string,
): OverwriteResolvable[] {
    const allow = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
    ]
    return [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        { id: requestorId, allow },
        { id: agentRoleId, allow },
    ]
}

async function handleClose(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
): Promise<void> {
    const channelId = interaction.channelId
    const session = await supportSessionService.getByChannel(channelId)
    if (!session || session.status !== 'open') {
        await interactionReply({
            interaction,
            content: {
                content: '❌ This is not an open ticket channel.',
            },
        })
        return
    }

    // Requestor, a support agent, or a channel manager may close.
    const member = await guild.members
        .fetch(interaction.user.id)
        .catch(() => null)
    const settings = await guildSettingsService.getGuildSettings(guild.id)
    const isRequestor = session.requestorId === interaction.user.id
    const isAgent = settings?.supportAgentRoleId
        ? (member?.roles.cache.has(settings.supportAgentRoleId) ?? false)
        : false
    const canManage =
        member?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false
    if (!isRequestor && !isAgent && !canManage) {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ Only the ticket opener or a support agent can close this ticket.',
            },
        })
        return
    }

    // Reply before the delete — an ephemeral interaction reply survives the
    // channel being removed, whereas a message in the channel would not.
    await interactionReply({
        interaction,
        content: { content: '✅ Closing this ticket…' },
    })

    await teardownClosedTicket(guild, channelId, session.id)
}

/**
 * Delete the ticket channel and close the record — but close ONLY when the
 * channel is confirmed gone (successful delete or 10003). A 50013/transient
 * delete failure keeps the session OPEN so the expiry sweep retries, rather
 * than orphaning a still-live channel with no tracking row.
 */
async function teardownClosedTicket(
    guild: Guild,
    channelId: string,
    sessionId: string,
): Promise<void> {
    const channel = await guild.channels.fetch(channelId).catch(() => null)
    if (!channel) {
        await supportSessionService.close(sessionId).catch(() => {})
        return
    }
    try {
        await channel.delete('Support ticket closed')
        await supportSessionService.close(sessionId).catch(() => {})
    } catch (error) {
        if ((error as { code?: number })?.code === UNKNOWN_CHANNEL) {
            await supportSessionService.close(sessionId).catch(() => {})
            return
        }
        errorLog({
            message: `Failed to delete ticket channel ${channelId}; leaving session open for the sweep`,
            error,
        })
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Open or close a temporary support ticket channel')
        .addSubcommand((sub) =>
            sub
                .setName('open')
                .setDescription('Open a private support ticket')
                .addStringOption((opt) =>
                    opt
                        .setName('reason')
                        .setDescription('What do you need help with?')
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('close')
                .setDescription('Close the ticket in this channel'),
        ),
    category: 'general',
    execute: async ({
        interaction,
    }: {
        interaction: ChatInputCommandInteraction
    }) => {
        const guild = interaction.guild
        if (!guild) {
            await interactionReply({
                interaction,
                content: { content: '❌ This command must be run in a guild.' },
            })
            return
        }

        if (interaction.options.getSubcommand() === 'open') {
            await handleOpen(interaction, guild)
        } else {
            await handleClose(interaction, guild)
        }
    },
})
