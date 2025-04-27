import { errorLog, infoLog, debugLog } from '../utils/log';
import { handleInteraction } from './interactionHandler';
export function setupEventHandlers(client) {
    // Client Ready Event
    client.once('ready', () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` });
        debugLog({ message: `Bot is ready with ${client.commands.size} commands loaded` });
    });
    // Interaction Create Event
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand())
            return;
        try {
            debugLog({ message: `Received command: ${interaction.commandName}` });
            await handleInteraction(interaction, client);
        }
        catch (error) {
            errorLog({ message: 'Error handling interaction:', error });
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                }).catch(console.error);
            }
            else {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    });
    // Error Event
    client.on('error', (error) => {
        errorLog({ message: 'Discord client error:', error });
    });
    // Warn Event
    client.on('warn', (warning) => {
        errorLog({ message: 'Discord client warning:', error: warning });
    });
    // Debug Event
    client.on('debug', (info) => {
        debugLog({ message: 'Discord client debug:', error: info });
    });
}
//# sourceMappingURL=eventHandler.js.map