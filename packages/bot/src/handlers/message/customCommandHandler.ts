import { PermissionFlagsBits, type Message } from 'discord.js'
import { customCommandService } from '@lucky/shared/services'
import {
    errorLog,
    getPrismaClient,
    detectRolesFromText,
    JOB_ALIASES,
    type RoleTag,
} from '@lucky/shared/utils'
import type { CustomCommandModel } from '@lucky/shared/generated/prisma/models/CustomCommand'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

const DISCORD_CONTENT_LIMIT = 2000

interface JobPostConfig {
    targetChannelId?: string | null
    notifyRoleLabel?: string
}

/** Loads the guild's reaction-role labels + roleIds for auto-tagging. */
async function loadRoleTags(guildId: string): Promise<RoleTag[]> {
    const prisma = getPrismaClient()
    const messages = await prisma.reactionRoleMessage.findMany({
        where: { guildId },
        include: { mappings: true },
    })
    return messages.flatMap((msg) =>
        msg.mappings
            .filter((m) => m.label)
            .map((m) => ({ label: m.label as string, roleId: m.roleId })),
    )
}

const reply = (message: Message, content: string) =>
    message.reply({ content, allowedMentions: { repliedUser: false } })

/**
 * job_post smart command: scans the text after the command name against the
 * guild's reaction-role labels (JOB_ALIASES vocabulary) and posts
 * `{response}\n\n{userText}\n\n{pings}` to the configured target channel (or
 * replies in place), pinging the matched roles. Fails loud when the guild has
 * no reaction roles or the bot can't post to the target.
 */
async function runJobPost(
    message: Message,
    guildId: string,
    cmd: CustomCommandModel,
): Promise<void> {
    const mappings = await loadRoleTags(guildId)
    if (mappings.length === 0) {
        await reply(
            message,
            '⚠️ Nenhum cargo de reação configurado neste servidor — configure os reaction roles primeiro.',
        )
        return
    }

    const config = (cmd.config ?? {}) as JobPostConfig
    const notifyLabel = config.notifyRoleLabel ?? 'Vagas'
    const notifyRoleId = mappings.find(
        (m) => m.label.toLowerCase() === notifyLabel.toLowerCase(),
    )?.roleId

    const userText = message.content.slice(cmd.name.length).trim()
    const tags = detectRolesFromText(userText, mappings, {
        aliases: JOB_ALIASES,
        notifyRoleId,
    })
    const roleIds = tags.map((t) => t.roleId)
    const pings = roleIds.map((id) => `<@&${id}>`).join(' ')

    const content = [cmd.response ?? '', userText, pings]
        .filter((part) => part.length > 0)
        .join('\n\n')

    if (content.length > DISCORD_CONTENT_LIMIT) {
        await reply(
            message,
            `⚠️ Conteúdo muito longo (${content.length}/${DISCORD_CONTENT_LIMIT}). Encurte o texto.`,
        )
        return
    }

    if (config.targetChannelId && message.guild) {
        const channel = await message.guild.channels
            .fetch(config.targetChannelId)
            .catch(() => null)
        if (!channel?.isTextBased()) {
            await reply(message, '⚠️ Canal de destino inválido ou removido.')
            return
        }
        const me = message.guild.members.me
        const canPost = me
            ? (channel
                  .permissionsFor(me)
                  ?.has(PermissionFlagsBits.SendMessages) ?? false)
            : false
        if (!canPost) {
            await reply(
                message,
                '⚠️ Sem permissão para postar no canal de destino.',
            )
            return
        }
        await channel.send({ content, allowedMentions: { roles: roleIds } })
        await reply(
            message,
            `✅ Publicado em <#${channel.id}> (${roleIds.length} cargo(s) marcado(s)).`,
        )
        return
    }

    await message.reply({
        content,
        allowedMentions: { roles: roleIds, repliedUser: false },
    })
}

export const customCommandHandler: MessageHandler = {
    name: 'CustomCommand',

    async canHandle(
        message: Message,
        context: MessageContext,
    ): Promise<boolean> {
        return (
            context.featureToggles['CUSTOM_COMMANDS'] === true &&
            !message.author.bot
        )
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const commands = await customCommandService.listCommands(
                context.guild.id,
            )
            if (!commands || commands.length === 0) {
                return { stop: false }
            }

            const matchedCommand = commands.find((cmd: CustomCommandModel) => {
                return (
                    message.content === cmd.name ||
                    message.content.startsWith(cmd.name + ' ')
                )
            })

            if (!matchedCommand) {
                return { stop: false }
            }

            // Enforce per-command allowedRoles/allowedChannels BEFORE acting —
            // a smart command can ping roles / post to another channel, so an
            // ungated trigger would be a privilege-escalation vector (ADR
            // 2026-07-03). Denied triggers are ignored silently.
            const userRoles = message.member?.roles.cache.map((r) => r.id) ?? []
            if (
                !customCommandService.canUseCommand(
                    matchedCommand,
                    userRoles,
                    message.channelId,
                )
            ) {
                return { stop: false }
            }

            if (matchedCommand.commandKind === 'job_post') {
                await runJobPost(message, context.guild.id, matchedCommand)
            } else {
                await message.reply({
                    content: matchedCommand.response ?? '',
                    allowedMentions: { repliedUser: false },
                })
            }

            await customCommandService.incrementUsage(
                context.guild.id,
                matchedCommand.name,
            )

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling custom command:',
                error,
            })
            return { stop: false }
        }
    },
}
