import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import Command from '../../../models/Command';
import { infoLog, errorLog } from '../../../utils/log';

interface CustomClient extends Client {
    commands: Map<string, Command>;
}

interface CommandExecuteParams {
    client: CustomClient;
    interaction: ChatInputCommandInteraction;
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("☝️ Mostra as comandos do bot."),
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        try {
            // Defer the reply immediately
            await interaction.deferReply();
            infoLog({ message: 'Help command: Deferred reply' });

            // Group commands by category
            const commandCategories = new Map<string, string[]>();
            
            Array.from(client.commands.values()).forEach(command => {
                const category = command.data.name.split('/')[0] || 'General';
                if (!commandCategories.has(category)) {
                    commandCategories.set(category, []);
                }
                commandCategories.get(category)?.push(`**/${command.data.name}** - ${command.data.description}`);
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🤖 LukBot Commands')
                .setDescription('Here are all the available commands:')
                .setThumbnail(client.user?.displayAvatarURL() || '')
                .setTimestamp()
                .setFooter({ 
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add each category to the embed
            commandCategories.forEach((commands, category) => {
                const categoryEmoji = getCategoryEmoji(category);
                embed.addFields({
                    name: `${categoryEmoji} ${category.charAt(0).toUpperCase() + category.slice(1)}`,
                    value: commands.join('\n'),
                    inline: false
                });
            });

            infoLog({ message: 'Help command: Sending embed response' });
            await interaction.editReply({ embeds: [embed] });
            infoLog({ message: 'Help command: Successfully sent response' });
        } catch (error) {
            errorLog({ message: 'Help command: Error occurred', error });
            
            // Only try to send an error message if the interaction hasn't been acknowledged yet
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: '❌ An error occurred while fetching the help information.',
                        ephemeral: true 
                    });
                } catch (replyError) {
                    errorLog({ message: 'Help command: Failed to send error reply', error: replyError });
                }
            } else {
                try {
                    await interaction.editReply({ 
                        content: '❌ An error occurred while fetching the help information.'
                    });
                } catch (editError) {
                    errorLog({ message: 'Help command: Failed to edit error reply', error: editError });
                }
            }
        }
    }
});

function getCategoryEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
        'general': '⚙️',
        'music': '🎵',
        'download': '⬇️',
        'default': '📋'
    };
    return emojiMap[category.toLowerCase()] || emojiMap.default;
} 