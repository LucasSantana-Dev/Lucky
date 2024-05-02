import { Collection } from 'discord.js';
import commands from '../commands.js';

export const executeCommand = async ({ interaction, client }) => {
  try {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute({ client, interaction });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: "Ocorreu um erro ao realizar o comando." });
    }
  } catch (err) {
    console.error('Error executing command:', err);
  }
};

export const setCommands = async ({ client }) => {
  client.commands = new Collection();

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
};