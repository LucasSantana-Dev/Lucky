import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import Command from '@models/Command';
import { infoLog, errorLog } from '@utils/log';
import { CustomClient } from '@/types';

interface CommandExecuteParams {
    client: CustomClient;
    interaction: ChatInputCommandInteraction;
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("📚 Mostra todos os comandos disponíveis."),
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
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
            .setTitle('🎵 Comandos de Música')
            .setDescription('Aqui estão todos os comandos disponíveis:')
            .setThumbnail(client.user?.displayAvatarURL() || '')
            .setTimestamp()
            .setFooter({ 
                text: `Solicitado por ${interaction.user.tag}`,
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