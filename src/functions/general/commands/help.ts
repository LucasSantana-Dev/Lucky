import { SlashCommandBuilder } from "@discordjs/builders"
import { EmbedBuilder } from "discord.js"
import Command from "../../../models/Command"
import { debugLog, infoLog, errorLog } from "../../../utils/general/log"
import { interactionReply } from "../../../utils/general/interactionReply"
import {
    getCommandCategory,
    getAllCategories,
} from "../../../utils/command/commandCategory"

export default new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("📚 Show all available commands."),
    category: "general",
    execute: async ({ client, interaction }) => {
        try {
            const categories = getAllCategories()

            const categoryCommands: Record<string, string[]> = {}
            categories.forEach(({ key }) => {
                categoryCommands[key] = []
            })

            Array.from(client.commands.values()).forEach((command) => {
                const category = getCommandCategory(command)
                categoryCommands[category].push(
                    `**/${command.data.name}** - ${command.data.description}`,
                )
            })

            const embed = new EmbedBuilder()
                .setColor("#0099ff")
                .setTitle("📚 Bot Help — Commands by Category")
                .setDescription("Available DiscordBot commands.")
                .setThumbnail(client.user?.displayAvatarURL() ?? "")
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                })

            for (const { key, label } of categories) {
                if (categoryCommands[key].length > 0) {
                    embed.addFields({
                        name: label,
                        value: `\u200B\n${categoryCommands[key].join("\n")}`,
                        inline: false,
                    })
                }
            }

            debugLog({ message: "Help command: Sending embed response" })
            interactionReply({ interaction, content: { embeds: [embed] } })
            infoLog({ message: "Help command: Successfully sent response" })
        } catch (error) {
            try {
                interactionReply({
                    interaction,
                    content: {
                        content:
                            "❌ An error occurred while displaying the help commands.",
                    },
                })
            } catch (editError) {
                errorLog({
                    message: "Failed to send error message:",
                    error: editError,
                })
            }
            errorLog({ message: "Help command error:", error })
        }
    },
})
