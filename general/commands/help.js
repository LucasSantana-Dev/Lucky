const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require("discord.js");
const { Command } = require('../../utils/Command.js');

module.exports = new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("☝️ Mostra as comandos do bot."),
    execute: async ({ client, interaction }) => {
        const commandsString = client.commands.map(command => {
            return `**/${command.data.name}** - ${command.data.description}`;
        }).join('\n');

        await interaction.reply({
            embeds: [
                new MessageEmbed()
                    .setDescription(commandsString)
            ]
        });
    }
});
