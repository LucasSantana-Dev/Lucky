import { Client, Events, Interaction } from 'discord.js';
import { errorLog, infoLog, debugLog } from '../utils/general/log';
import { CustomClient } from '../types';
import { interactionReply } from '../utils/general/interactionReply';

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
                    await interactionReply({ 
                        interaction,
                        content: {
                            content: 'This command is not available.', 
                            ephemeral: true 
                        }
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
                    await interactionReply({ 
                        interaction,
                        content: {
                            content: 'There was an error while executing this command!', 
                            ephemeral: true 
                        }
                    });
                } else {
                    await interactionReply({ 
                        interaction,
                        content: {
                            content: 'There was an error while executing this command!', 
                            ephemeral: true 
                        }
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

    // Guild Delete Event - clean up all per-guild caches to prevent memory leaks
    client.on(Events.GuildDelete, (guild) => {
        // Clean up music caches
        try {
            // Import here to avoid circular dependencies if needed
            const { clearHistory, clearAllGuildCaches } = require('../utils/music/duplicateDetection');
            clearHistory(guild.id);
            clearAllGuildCaches(guild.id);
        } catch (err) {
            errorLog({ message: 'Error clearing history on guild delete:', error: err });
        }
        // Add any other per-guild cache cleanup here
    });
} 