import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import Command from '../../../models/Command';
import { CustomClient } from '../../../types';
import { errorLog, infoLog } from '../../../utils/log';
import { errorEmbed, musicEmbed } from '../../../utils/embeds';
import { interactionReply } from '../../../utils/interactionReply';
import { getGuildHistory } from '../../../utils/trackManagement';

const command = new Command({
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('📜 Lista as músicas que foram tocadas recentemente'),
    execute: async ({ interaction }: { client: CustomClient; interaction: ChatInputCommandInteraction }): Promise<void> => {
        try {
            if (!interaction.guildId) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em um servidor!')],
                        ephemeral: true
                    }
                });
                return;
            }

            const guildId = interaction.guildId;
            const { history: guildHistory, lastTrack } = getGuildHistory(guildId);

            if (!guildHistory || guildHistory.length === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [errorEmbed('Histórico vazio', 'Não há músicas no histórico!')],
                        ephemeral: true
                    }
                });
                return;
            }

            // Create embed with history
            const embed = musicEmbed('Histórico de Músicas');

            // Add last played track if available
            if (lastTrack) {
                embed.addFields({
                    name: '▶️ Tocando Agora',
                    value: `**${lastTrack.title}** por **${lastTrack.author}**`
                });
            }

            // Add history entries
            const historyEntries = guildHistory.map((entry, index) => {
                return `${index + 1}. **${entry.title}** por **${entry.author}**`;
            }).join('\n\n');

            embed.addFields({
                name: '📑 Histórico',
                value: historyEntries
            });

            await interactionReply({
                interaction,
                content: {
                    embeds: [embed]
                }
            });

            infoLog({ message: `History command executed in guild ${guildId}` });
        } catch (error) {
            errorLog({ message: 'Error in history command:', error });
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Erro', 'Ocorreu um erro ao executar o comando!')],
                    ephemeral: true
                }
            });
        }
    }
});

export default command; 