import { Events } from 'discord.js';
import { errorLog, debugLog } from '../utils/log';
import { executeCommand } from './commandsHandler';
export const handleInteractions = async ({ client }) => {
    try {
        client.on(Events.InteractionCreate, async (interaction) => {
            if (interaction.isChatInputCommand()) {
                await handleInteraction(interaction, client);
            }
        });
    }
    catch (error) {
        errorLog({ message: 'Error handling interaction:', error });
    }
};
export const interactionReply = async ({ interaction, content }) => {
    try {
        await interaction.reply(content);
    }
    catch (error) {
        errorLog({ message: 'Error replying to interaction:', error });
    }
};
export const interactionGetAllOptions = async ({ interaction }) => {
    try {
        return interaction.options;
    }
    catch (error) {
        errorLog({ message: 'Error getting interaction options:', error });
        throw error;
    }
};
export const interactionGetOption = async ({ interaction, optionName }) => {
    try {
        return interaction.options.get(optionName);
    }
    catch (error) {
        errorLog({ message: 'Error getting interaction option:', error });
        throw error;
    }
};
export const interactionGetSubcommand = async ({ interaction }) => {
    try {
        return interaction.options.getSubcommand();
    }
    catch (error) {
        errorLog({ message: 'Error getting interaction subcommand:', error });
        throw error;
    }
};
export async function handleInteraction(interaction, client) {
    try {
        debugLog({ message: `Processing command: ${interaction.commandName}` });
        await executeCommand({ interaction, client });
    }
    catch (error) {
        errorLog({ message: 'Error in interaction handler:', error });
        throw error; // Re-throw to be handled by the event handler
    }
}
//# sourceMappingURL=interactionHandler.js.map