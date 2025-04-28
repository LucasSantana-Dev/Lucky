import { Client, Events, Interaction } from 'discord.js';
import { errorLog, infoLog, debugLog } from '../utils/log';
import { CustomClient } from '../types';

export default function handleEvents(client: Client) {
    // Client Ready Event
    client.once('ready', () => {
        infoLog({ message: `Logged in as ${client.user?.tag}!` });
        debugLog({ message: `Bot is ready with ${(client as CustomClient).commands.size} commands loaded` });
    });

    // Interaction Create Event
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
        try {
            if (!interaction.isChatInputCommand()) return;

            const command = (client as CustomClient).commands.get(interaction.commandName);
            if (!command) {
                infoLog({ message: `Command ${interaction.commandName} not found` });
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'This command is not available.', 
                        ephemeral: true 
                    });
                }
                return;
            }

            await command.execute({ 
                client: client as CustomClient, 
                interaction 
            });
        } catch (error) {
            errorLog({ message: 'Error handling interaction:', error });
            try {
                if (!interaction.isChatInputCommand()) return;
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } else {
                    await interaction.followUp({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                }
            } catch (followUpError) {
                errorLog({ message: 'Error sending error message:', error: followUpError });
            }
        }
    });

    // Error Event
    client.on(Events.Error, (error) => {
        errorLog({ message: 'Discord client error:', error });
    });

    // Warn Event
    client.on(Events.Warn, (warning) => {
        infoLog({ message: 'Discord client warning:', data: warning });
    });

    // Debug Event
    client.on(Events.Debug, (debug) => {
        debugLog({ message: 'Discord client debug:', data: debug });
    });
} 