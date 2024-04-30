import { SlashCommandBuilder } from '@discordjs/builders'
import { EmbedBuilder } from "discord.js"
import { Command } from '../../utils/Command.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("☝️ Mostra as comandos do bot."),
    execute: async ({ client, interaction }) => {
        const commandsString = client.commands.map(command => {
            return `**/${command.data.name}** - ${command.data.description}`
        }).join('\n');

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(commandsString)
            ]
        })
    }
})