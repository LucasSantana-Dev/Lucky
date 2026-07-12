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
                    '❌ Tickets are not configured. An admin must set the support category and support-agent role first.',
            },
        })
        return
    }

    const existing = await supportSessionService.getActiveForUser(
        guild.id,
        interaction.user.id,
    )
    if (existing) {
        // Only block if the channel still exists; if it was deleted out-of-band
        // (a human removed it), close the orphan row and let the user reopen
        // instead of stranding them until the 24h sweep.
        const stillThere = await guild.channels
            .fetch(existing.channelId)
            .catch(() => null)
        if (stillThere) {
            await interactionReply({
                interaction,
                content: {
                    content: `❌ You already have an open ticket: <#${existing.channelId}>. Close it before opening another.`,
                },
            })
            return
        }
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
        // one-open-per-user unique index) — record never orphans a channel.
        await channel.delete('Ticket record failed').catch(() => {})
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

    // Mark closed first so the channel delete (which ends this interaction) can't
    // leave an orphaned open record; the sweep is idempotent either way.
    await supportSessionService.close(session.id)
    await interactionReply({
        interaction,
        content: { content: '✅ Closing this ticket…' },
    })

    const channel = await guild.channels.fetch(channelId).catch(() => null)
    if (channel) {
        await channel.delete('Support ticket closed').catch((error) =>
            errorLog({
                message: `Failed to delete ticket channel ${channelId}`,
                error,
            }),
        )
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
