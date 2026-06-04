import type {
    Interaction,
    ChatInputCommandInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
    UserSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    RoleSelectMenuInteraction,
    MentionableSelectMenuInteraction,
    InteractionReplyOptions as DjsInteractionReplyOptions,
    APIEmbed,
    JSONEncodable,
} from 'discord.js'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
import { errorEmbed, infoEmbed } from './embeds'

// Type for interactions that support reply methods
export type ReplyableInteraction =
    | ChatInputCommandInteraction
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | UserSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction
    | MentionableSelectMenuInteraction

type InteractionReplyOptions = {
    interaction: Interaction
    content: Omit<DjsInteractionReplyOptions, 'flags'> & { ephemeral?: boolean }
}

function stripFlags<T extends object>(obj: T): Omit<T, 'flags'> {
    const { flags: _flags, ...rest } = obj as {
        flags?: unknown
        [key: string]: unknown
    }
    return rest as Omit<T, 'flags'>
}

/**
 * Convert plain text content to embed if needed
 */
function convertTextToEmbed(content: {
    content?: string
    embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[]
    ephemeral?: boolean
}): { content?: string; embeds: APIEmbed[]; ephemeral?: boolean } {
    if (
        content.content !== undefined &&
        content.content !== '' &&
        (content.embeds === undefined || content.embeds.length === 0)
    ) {
        // Create appropriate embed based on content
        const embed = content.content.toLowerCase().includes('error')
            ? errorEmbed('Error', content.content)
            : infoEmbed('Info', content.content)

        return {
            ...content,
            embeds: [embed.toJSON()],
            content: '', // Clear the content since we're using an embed
        }
    }
    return {
        ...content,
        embeds: content.embeds
            ? (content.embeds.map((embed) =>
                  'toJSON' in embed ? embed.toJSON() : embed,
              ) as APIEmbed[])
            : [],
    }
}

/**
 * Handle chat input command interaction
 */
async function handleChatInputCommand(
    interaction: ChatInputCommandInteraction,
    content: { content?: string; embeds?: APIEmbed[]; ephemeral?: boolean },
): Promise<void> {
    const processedContent = convertTextToEmbed(content)

    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply({
                flags: processedContent.ephemeral ? 64 : undefined,
            })
        } catch {
            // Defer failure is typically transient (interaction expired);
            // allow it to propagate to outer handler for Sentry capture
            throw new Error('Failed to defer interaction reply', {
                cause: arguments,
            })
        }
    }
    try {
        if (interaction.replied) {
            await interaction.followUp(stripFlags(processedContent))
        } else {
            await interaction.editReply(stripFlags(processedContent))
        }
    } catch (error) {
        // Reply failure (expired interaction) should propagate for Sentry capture
        throw error
    }
}

/**
 * Handle other interaction types
 */
async function handleOtherInteraction(
    interaction: ReplyableInteraction,
    content: {
        content?: string
        embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[]
        ephemeral?: boolean
    },
): Promise<void> {
    const processedContent = convertTextToEmbed(content)

    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply({
                flags: processedContent.ephemeral ? 64 : undefined,
            })
        } catch {
            // Defer failure is typically transient (interaction expired);
            // allow it to propagate to outer handler for Sentry capture
            throw new Error('Failed to defer interaction reply', {
                cause: arguments,
            })
        }
    }
    try {
        if (interaction.replied) {
            await interaction.followUp(stripFlags(processedContent))
        } else {
            await interaction.editReply(stripFlags(processedContent))
        }
    } catch (error) {
        // Reply failure (expired interaction) should propagate for Sentry capture
        throw error
    }
}

export const interactionReply = async ({
    interaction,
    content,
}: InteractionReplyOptions): Promise<void> => {
    try {
        if (!isReplyableInteraction(interaction)) {
            debugLog({ message: 'Interaction does not support reply methods' })
            return
        }

        // Convert plain text content to embed if needed
        const processedContent = convertTextToEmbed(content)

        // Handle different interaction types
        if (
            'isChatInputCommand' in interaction &&
            interaction.isChatInputCommand()
        ) {
            await handleChatInputCommand(interaction, processedContent)
        } else {
            await handleOtherInteraction(interaction, processedContent)
        }
    } catch (error) {
        errorLog({ message: 'Error sending interaction reply:', error })

        // Capture reply failure to Sentry with interaction context
        const extras: Record<string, unknown> = {
            context: 'interaction-reply-failure',
        }

        // Add context from ChatInputCommandInteraction if available
        if ('commandName' in interaction) {
            extras.command = interaction.commandName
        }
        if ('guildId' in interaction) {
            extras.guildId = interaction.guildId ?? undefined
        }
        if ('user' in interaction && interaction.user) {
            extras.userId = interaction.user.id
        }

        // Normalize error for Sentry (ensure it's an Error instance)
        const sentryError =
            error instanceof Error
                ? error
                : new Error(String(error), { cause: error })

        captureException(sentryError, extras)
    }
}

function isReplyableInteraction(
    interaction: Interaction,
): interaction is ReplyableInteraction {
    return (
        interaction.isChatInputCommand() ||
        interaction.isButton() ||
        interaction.isModalSubmit() ||
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isMentionableSelectMenu()
    )
}
