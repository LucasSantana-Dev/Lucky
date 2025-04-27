import { SlashCommandBuilder } from '@discordjs/builders';
import Command from '../../../models/Command';
import { infoLog } from '../../../utils/log';
const command = new Command({
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    execute: async ({ interaction, client }) => {
        infoLog({ message: `Executing ping command for ${interaction.user.tag}` });
        await interaction.reply({ content: 'Pong!', ephemeral: true });
    }
});
export default command;
//# sourceMappingURL=ping.js.map