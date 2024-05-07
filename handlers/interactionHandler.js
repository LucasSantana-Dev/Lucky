import { errorLog } from "../utils/log.js";
import { executeCommand } from "./commandsHandler.js";

export const handleInteractions = async ({ client }) => {
  try {
    await client.on("interactionCreate", async interaction => executeCommand({ interaction, client }));
  } catch (err) {
    errorLog('Error handling interaction:', err);
  }
}

export const interactionReply = async ({ interaction, content }) => {
  try {
    await interaction.reply(content);
  } catch (err) {
    errorLog('Error replying to interaction:', err);
  }
}

export const interactionGetAllOptions = async ({ interaction }) => {
  try {
    return interaction.options;
  } catch (err) {
    errorLog('Error getting interaction options:', err);
  }
}

export const interactionGetOption = async ({ interaction, optionName }) => {
  try {
    return interaction.options.get(optionName);
  } catch (err) {
    errorLog('Error getting interaction option:', err);
  }
}

export const interactionGetSubcommand = async ({ interaction }) => {
  try {
    return interaction.options.getSubcommand();
  } catch (err) {
    errorLog('Error getting interaction subcommand:', err);
  }
}