import { SlashCommandBuilder } from '@discordjs/builders'
import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction,
    type Client,
} from 'discord.js'
import Command from '../../../models/Command'
import type { CustomClient } from '../../../types'
import { debugLog, infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    getCommandCategory,
    getAllCategories,
} from '../../../utils/command/commandCategory'
import { EMBED_COLORS } from '../../../utils/general/embeds'

// The hosted bot leads with music (decisions/2026-09-27-music-first-
// positioning.md point 2): moderation, automod, giveaways, logs, Twitch and
// custom commands are still fully functional if invoked directly, just not
// surfaced by default here. The select menu below keeps every other
// category one click away.
const DEFAULT_HELP_CATEGORY = 'music'
export const HELP_CATEGORY_SELECT_ID = 'help_category_select'

function buildCategoryCommands(
    commands: Map<string, Command>,
): Record<string, string[]> {
    const categories = getAllCategories()
    const categoryCommands: Record<string, string[]> = {}

    categories.forEach(({ key }) => {
        categoryCommands[key] = []
    })

    Array.from(commands.values()).forEach((command: Command) => {
        const category = getCommandCategory(command)
        const commandData = command.data
        categoryCommands[category].push(
            `**/${commandData.name}** — ${commandData.description}`,
        )
    })

    return categoryCommands
}

type HelpField = { name: string; value: string }

/** The subset of an interaction createHelpEmbeds needs, shared by the
 * slash-command reply and the category-select follow-up. */
type HelpInteractionLike = {
    user: { tag: string; displayAvatarURL(): string }
}

/**
 * Build the help into one or more embeds. Discord caps a single embed field
 * value at 1024 chars, an embed at 25 fields, and a whole message at 6000
 * chars across all embeds — so large categories are split across fields and
 * the fields are paged into multiple embeds (sent as follow-up messages)
 * rather than overflowing a single response, which throws.
 *
 * `categoryKeys`, when given, limits the fields to those categories (the
 * default hosted-bot view shows only 'music'); omit it to list everything.
 */
function createHelpEmbeds(
    categoryCommands: Record<string, string[]>,
    client: Client,
    interaction: HelpInteractionLike,
    categoryKeys?: string[],
): EmbedBuilder[] {
    const allCategories = getAllCategories()
    const categories = categoryKeys
        ? allCategories.filter(({ key }) => categoryKeys.includes(key))
        : allCategories
    // Count only the categories actually shown on this page set, otherwise
    // a filtered view (e.g. music-only) would report the bot's full command
    // count in the footer while showing a fraction of them.
    const totalCommands = categories.reduce(
        (sum, { key }) => sum + (categoryCommands[key]?.length ?? 0),
        0,
    )

    const fields: HelpField[] = []
    for (const { key, label } of categories) {
        const commands = categoryCommands[key]
        if (commands.length === 0) {
            continue
        }
        const chunks = chunkByLength(commands)
        chunks.forEach((chunk, index) => {
            const name =
                index === 0
                    ? `${label} (${commands.length})`
                    : `${label} (cont.)`
            fields.push({ name, value: `\u200B\n${chunk}` })
        })
    }

    const pages: HelpField[][] = []
    let current: HelpField[] = []
    let currentChars = 0
    for (const field of fields) {
        const cost = field.name.length + field.value.length
        const overflows =
            current.length >= MAX_EMBED_FIELDS ||
            currentChars + cost > PAGE_CHAR_BUDGET
        if (overflows && current.length > 0) {
            pages.push(current)
            current = []
            currentChars = 0
        }
        current.push(field)
        currentChars += cost
    }
    if (current.length > 0) {
        pages.push(current)
    }
    if (pages.length === 0) {
        pages.push([])
    }

    const pageCount = pages.length
    return pages.map((pageFields, index) => {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS.INFO)
            .setTimestamp()
            .addFields(pageFields)

        if (index === 0) {
            embed
                .setTitle(
                    pageCount > 1
                        ? `📚 Lucky — Command Reference (1/${pageCount})`
                        : '📚 Lucky — Command Reference',
                )
                .setDescription(
                    categoryKeys
                        ? 'Use `/` to start any command. Browse other categories with the menu below.'
                        : 'All available slash commands grouped by category. Use `/` to start any command.',
                )
                .setThumbnail(client.user?.displayAvatarURL() ?? '')
                .setFooter({
                    text: `${totalCommands} commands · Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                })
        } else {
            embed.setTitle(`📚 Command Reference (${index + 1}/${pageCount})`)
        }

        return embed
    })
}

const MAX_FIELD_VALUE = 1024
const MAX_EMBED_FIELDS = 25
// Leave headroom for the zero-width-space + newline prefix on each field value.
const FIELD_VALUE_BUDGET = MAX_FIELD_VALUE - 8
// Discord caps a message at 6000 chars across all embeds; keep headroom for
// the first page's title, description and footer.
const PAGE_CHAR_BUDGET = 5500

/**
 * Pack lines into newline-joined chunks, each at or below the field-value
 * budget, never splitting a single line across chunks.
 */
function chunkByLength(lines: string[]): string[] {
    const chunks: string[] = []
    let current = ''

    for (const line of lines) {
        const candidate = current === '' ? line : `${current}\n${line}`
        if (candidate.length > FIELD_VALUE_BUDGET && current !== '') {
            chunks.push(current)
            current = line
        } else {
            current = candidate
        }
    }
    if (current !== '') {
        chunks.push(current)
    }

    return chunks
}

async function handleHelpError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ An error occurred while displaying the help commands.',
            },
        })
    } catch (editError) {
        errorLog({
            message: 'Failed to send error message:',
            error: editError,
        })
    }
    errorLog({ message: 'Help command error:', error })
}

/** One row letting the reader jump to any other command category. */
function buildCategorySelectRow(
    activeKey: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const select = new StringSelectMenuBuilder()
        .setCustomId(HELP_CATEGORY_SELECT_ID)
        .setPlaceholder('Browse another command category')
        .addOptions(
            getAllCategories().map(({ key, label }) => ({
                label,
                value: key,
                default: key === activeKey,
            })),
        )

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 Show all available commands.'),
    category: 'general',
    execute: async ({ client, interaction }) => {
        try {
            const categoryCommands = buildCategoryCommands(client.commands)
            const embeds = createHelpEmbeds(
                categoryCommands,
                client,
                interaction,
                [DEFAULT_HELP_CATEGORY],
            )
            const row = buildCategorySelectRow(DEFAULT_HELP_CATEGORY)

            debugLog({ message: 'Help command: Sending embed response' })
            // interactionReply edits the deferred reply on the first call and
            // routes subsequent calls to followUp (interaction.replied), so
            // each page lands as its own message within Discord's 6000 cap.
            for (const embed of embeds) {
                await interactionReply({
                    interaction,
                    content: { embeds: [embed], components: [row] },
                })
            }
            infoLog({ message: 'Help command: Successfully sent response' })
        } catch (error) {
            await handleHelpError(error, interaction)
        }
    },
})

/**
 * Category-picker follow-up for the /help select menu. Edits the help
 * message in place (`.update()`) rather than sending a new reply, so
 * re-browsing categories doesn't spam the channel with extra messages.
 */
export async function handleHelpCategorySelect(
    interaction: StringSelectMenuInteraction,
    client: CustomClient,
): Promise<void> {
    try {
        const selected = interaction.values[0]
        const categoryCommands = buildCategoryCommands(client.commands)
        const embeds = createHelpEmbeds(categoryCommands, client, interaction, [
            selected,
        ])
        const row = buildCategorySelectRow(selected)

        await interaction.update({
            embeds: [embeds[0]],
            components: [row],
        })

        // Extra pages are rare (only a very large category would need one);
        // send any beyond the first as plain follow-ups.
        for (const embed of embeds.slice(1)) {
            await interaction.followUp({ embeds: [embed], components: [row] })
        }
    } catch (error) {
        errorLog({ message: 'Help category select error:', error })
        try {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ An error occurred while displaying that category.',
                    ephemeral: true,
                },
            })
        } catch (replyError) {
            errorLog({
                message: 'Failed to send help category select error reply',
                error: replyError,
            })
        }
    }
}
