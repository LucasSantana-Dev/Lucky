import { MessageFlags, EmbedBuilder } from 'discord.js';
import { errorLog, infoLog } from '../utils/log';
export const name = 'interactionCreate';
export const once = false;
export async function execute(interaction) {
    infoLog({ message: `Interaction received: ${interaction.type} from ${interaction.user?.tag || 'unknown user'}` });
    // Only handle chat input commands
    if (!interaction.isChatInputCommand?.()) {
        infoLog({ message: `Ignoring non-chat input command interaction: ${interaction.type}` });
        return;
    }
    // Now we know it's a ChatInputCommandInteraction
    const chatInteraction = interaction;
    infoLog({ message: `Processing chat command: ${chatInteraction.commandName} from ${chatInteraction.user.tag} in ${chatInteraction.guild?.name || 'DM'}` });
    const client = interaction.client;
    const command = client.commands.get(chatInteraction.commandName);
    if (!command) {
        errorLog({ message: `No command matching ${chatInteraction.commandName} was found.` });
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Command Not Found')
                .setDescription(`The command \`/${chatInteraction.commandName}\` does not exist.`)
                .setTimestamp()
                .setFooter({
                text: `Requested by ${chatInteraction.user.tag}`,
                iconURL: chatInteraction.user.displayAvatarURL()
            });
            await chatInteraction.reply({
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral]
            });
        }
        catch (error) {
            errorLog({ message: 'Error sending command not found message', error });
        }
        return;
    }
    infoLog({ message: `Executing command: ${chatInteraction.commandName}` });
    try {
        // Let the command handle everything, including deferring if needed
        await command.execute({ client, interaction: chatInteraction });
        infoLog({ message: `Command ${chatInteraction.commandName} executed successfully` });
    }
    catch (error) {
        console.error(error);
        errorLog({ message: `Error executing command: '${chatInteraction.commandName}'. Error Info:`, error });
        // Only try to send an error message if the interaction hasn't been replied to yet
        if (!chatInteraction.replied && !chatInteraction.deferred) {
            try {
                const errorMessage = error instanceof Error ? error.message : 'There was an error while executing this command!';
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Command Error')
                    .setDescription(`An error occurred while executing the \`/${chatInteraction.commandName}\` command.`)
                    .addFields({ name: 'Error Details', value: `\`\`\`${errorMessage}\`\`\``, inline: false })
                    .setTimestamp()
                    .setFooter({
                    text: `Requested by ${chatInteraction.user.tag}`,
                    iconURL: chatInteraction.user.displayAvatarURL()
                });
                await chatInteraction.reply({
                    embeds: [errorEmbed],
                    flags: [MessageFlags.Ephemeral]
                });
            }
            catch (replyError) {
                errorLog({ message: 'Failed to send error message', error: replyError });
            }
        }
    }
}
//# sourceMappingURL=interactionCreate.js.map