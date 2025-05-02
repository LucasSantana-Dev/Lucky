import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { interactionReply } from '../../../utils/general/interactionReply';
import { errorEmbed, musicEmbed } from '../../../utils/general/embeds';
import { requireGuild } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { getGuildHistory } from '../../../utils/music/trackManagement';
import { infoLog } from '../../../utils/general/log';
import { messages } from '../../../utils/general/messages';

const command = new Command({
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('📜 Lista as músicas que foram tocadas recentemente'),
    execute: async ({ interaction }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return;

        const guildId = interaction.guildId!;
        const { history: guildHistory, lastTrack } = getGuildHistory(guildId);

        if (!guildHistory || guildHistory.length === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Histórico vazio', messages.error.noTrack)],
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
    }
});

export default command; 