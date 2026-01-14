import { SlashCommandBuilder } from '@discordjs/builders'
import {
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type Client,
} from 'discord.js'
import Command from '../../../models/Command'
import { debugLog, infoLog, errorLog } from '@lukbot/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    getCommandCategory,
    getAllCategories,
} from '../../../utils/command/commandCategory'

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
            `**/${commandData.name}** - ${commandData.description}`,
        )
    })

    return categoryCommands
}

function createHelpEmbed(
    categoryCommands: Record<string, string[]>,
    client: Client,
    interaction: ChatInputCommandInteraction,
): EmbedBuilder {
    const categories = getAllCategories()
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📚 Bot Help — Commands by Category')
        .setDescription('Available DiscordBot commands.')
        .setThumbnail(client.user?.displayAvatarURL() ?? '')
        .setTimestamp()
        .setFooter({
            text: `Requested by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL(),
        })

    for (const { key, label } of categories) {
        if (categoryCommands[key].length > 0) {
            embed.addFields({
                name: label,
                value: `\u200B\n${categoryCommands[key].join('\n')}`,
                inline: false,
            })
        }
    }

    return embed
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
            const embed = createHelpEmbed(categoryCommands, client, interaction)

            debugLog({ message: 'Help command: Sending embed response' })
            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })
            infoLog({ message: 'Help command: Successfully sent response' })
        } catch (error) {
            await handleHelpError(error, interaction)
        }
    },
})
