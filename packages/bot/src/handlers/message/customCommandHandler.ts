import type { Message } from 'discord.js'
import { customCommandService } from '@lucky/shared/services'
import {
    errorLog,
    getPrismaClient,
    detectVagaRoleTags,
} from '@lucky/shared/utils'
import type { CustomCommandModel } from '@lucky/shared/generated/prisma/models/CustomCommand'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

const DISCORD_CONTENT_LIMIT = 2000

/** Loads the guild's reaction-role labels + roleIds for auto-tagging. */
async function loadRoleTags(
    guildId: string,
): Promise<{ label: string; roleId: string }[]> {
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

/**
 * Smart command: scans the text after the command name against the guild's
 * reaction-role labels, then posts `{response}\n\n{userText}\n\n{pings}` to the
 * command's target channel (or replies in place), pinging the matched roles.
 */
async function runSmartCommand(
    message: Message,
    guildId: string,
    cmd: CustomCommandModel,
): Promise<void> {
    const userText = message.content.slice(cmd.name.length).trim()
    const mappings = await loadRoleTags(guildId)
    const vagasRoleId = mappings.find((m) => /vagas?/i.test(m.label))?.roleId
    const tags = detectVagaRoleTags(userText, mappings, { vagasRoleId })
    const roleIds = tags.map((t) => t.roleId)
    const pings = roleIds.map((id) => `<@&${id}>`).join(' ')

    const content = [cmd.response ?? '', userText, pings]
        .filter((part) => part.length > 0)
        .join('\n\n')

    if (content.length > DISCORD_CONTENT_LIMIT) {
        await message.reply({
            content: `⚠️ Conteúdo muito longo (${content.length}/${DISCORD_CONTENT_LIMIT}).`,
            allowedMentions: { repliedUser: false },
        })
        return
    }

    const target =
        cmd.targetChannelId && message.guild
            ? await message.guild.channels
                  .fetch(cmd.targetChannelId)
                  .catch(() => null)
            : null

    if (target?.isTextBased()) {
        await target.send({ content, allowedMentions: { roles: roleIds } })
        await message.reply({
            content: `✅ Publicado em <#${target.id}>.`,
            allowedMentions: { repliedUser: false },
        })
    } else {
        await message.reply({
            content,
            allowedMentions: { roles: roleIds, repliedUser: false },
        })
    }
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

            if (matchedCommand.smartTags) {
                await runSmartCommand(message, context.guild.id, matchedCommand)
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
