import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import Command from '../../../models/Command';
import { debugLog, infoLog } from '../../../utils/general/log';
import { interactionReply } from 'src/utils/general/interactionReply';

export default new Command({
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("📚 Mostra todos os comandos disponíveis."),
    execute: async ({ client, interaction }) => {
        try {
            // Prepare categories
            const categories = [
                { key: 'general', label: '⚙️ Geral' },
                { key: 'music', label: '🎵 Música' },
                { key: 'download', label: '⬇️ Download' },
            ];
            const categoryCommands: Record<string, string[]> = {
                music: [],
                download: [],
                general: []
            };

            // Assign commands to categories
            Array.from(client.commands.values()).forEach(command => {
                const name = command.data.name.toLowerCase();
                let category = 'general';
                if (name.startsWith('play') || name.startsWith('queue') || name.startsWith('skip') || name.startsWith('pause') || name.startsWith('resume') || name.startsWith('remove') || name.startsWith('repeat') || name.startsWith('seek') || name.startsWith('shuffle') || name.startsWith('lyrics') || name.startsWith('songinfo') || name.startsWith('history') || name.startsWith('jump') || name.startsWith('clear') || name.startsWith('autoplay') || name.startsWith('move') || name.startsWith('volume')) {
                    category = 'music';
                } else if (name.startsWith('download')) {
                    category = 'download';
                }
                categoryCommands[category].push(`**/${command.data.name}** - ${command.data.description}`);
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📚 Ajuda do Bot — Comandos por Categoria')
                .setDescription('Comandos disponíveis do LukBot.')
                .setThumbnail(client.user?.displayAvatarURL() || '')
                .setTimestamp()
                .setFooter({
                    text: `Solicitado por ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add each category as a field, wrapping the whole list in a single spoiler
            for (const { key, label } of categories) {
                if (categoryCommands[key].length > 0) {
                    embed.addFields({
                        name: label,
                        value: `\u200B\n${categoryCommands[key].join('\n')}`,
                        inline: false
                    });
                }
            }

            debugLog({ message: 'Help command: Sending embed response' });
            interactionReply({ interaction, content: { embeds: [embed] } });
            infoLog({ message: 'Help command: Successfully sent response' });
        } catch (error) {
            try {
                interactionReply({ interaction, content: { content: '❌ Ocorreu um erro ao exibir os comandos de ajuda.' } });
            } catch (editError) {
                console.error('Failed to send error message:', editError);
            }
            console.error('Help command error:', error);
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