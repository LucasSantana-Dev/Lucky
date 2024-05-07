import { Collection } from 'discord.js';
import commands from '../utils/commands.js';
import { errorLog } from '../utils/log.js';

export const executeCommand = async ({ interaction, client }) => {
  try {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute({ client, interaction });
    } catch (error) {
      errorLog(error);
      await interaction.reply({ content: "Ocorreu um erro ao realizar o comando." });
    }
  } catch (err) {
    errorLog('Error executing command:', err);
  }
};

export const setCommands = async ({ client }) => {
  client.commands = new Collection();

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
};

export const groupCommands = ({ commands }) => {
  return [...commands]
}