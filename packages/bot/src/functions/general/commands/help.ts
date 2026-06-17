import { SlashCommandBuilder } from '@discordjs/builders'
import {
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type Client,
} from 'discord.js'
import Command from '../../../models/Command'
import { debugLog, infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    getCommandCategory,
    getAllCategories,
} from '../../../utils/command/commandCategory'
import { EMBED_COLORS } from '../../../utils/general/embeds'

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

/**
 * Build the help into one or more embeds. Discord caps a single embed field
 * value at 1024 chars, an embed at 25 fields, and a whole message at 6000
 * chars across all embeds — so large categories are split across fields and
 * the fields are paged into multiple embeds (sent as follow-up messages)
 * rather than overflowing a single response, which throws.
 */
function createHelpEmbeds(
    categoryCommands: Record<string, string[]>,
    client: Client,
    interaction: ChatInputCommandInteraction,
): EmbedBuilder[] {
    const categories = getAllCategories()
    const totalCommands = Object.values(categoryCommands).reduce(
        (sum, cmds) => sum + cmds.length,
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
            fields.push({ name, value: `​\n${chunk}` })
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
                    'All available slash commands grouped by category. Use `/` to start any command.',
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
// Leave headroom for the `​\n` prefix added to each field value.
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
            )

            debugLog({ message: 'Help command: Sending embed response' })
            // interactionReply edits the deferred reply on the first call and
            // routes subsequent calls to followUp (interaction.replied), so
            // each page lands as its own message within Discord's 6000 cap.
            for (const embed of embeds) {
                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })
            }
            infoLog({ message: 'Help command: Successfully sent response' })
        } catch (error) {
            await handleHelpError(error, interaction)
        }
    },
})
