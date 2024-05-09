import { errorLog } from "../utils/log.js";
import { executeCommand } from "./commandsHandler.js";

export const handleInteractions = async ({ client }) => {
  try {
    await client.on("interactionCreate", async interaction => executeCommand({ interaction, client }));
  } catch (error) {
    errorLog({ message: 'Error handling interaction:', error });
  }
}

export const interactionReply = async ({ interaction, content }) => {
  try {
    await interaction.reply(content);
  } catch (error) {
    errorLog({ message: 'Error replying to interaction:', error });
  }
}

export const interactionGetAllOptions = async ({ interaction }) => {
  try {
    return interaction.options;
  } catch (error) {
    errorLog({ message: 'Error getting interaction options:', error });
  }
}

export const interactionGetOption = async ({ interaction, optionName }) => {
  try {
    return interaction.options.get(optionName);
  } catch (error) {
    errorLog({ message: 'Error getting interaction option:', error });
  }
}

export const interactionGetSubcommand = async ({ interaction }) => {
  try {
    return interaction.options.getSubcommand();
  } catch (error) {
    errorLog({ message: 'Error getting interaction subcommand:', error });
  }
}