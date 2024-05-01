const { Collection } = require('discord.js');
const { groupCommands } = require('../commands.js');

const executeCommand = async ({ interaction, client }) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute({ client, interaction });
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: "Ocorreu um erro ao realizar o comando." });
  }
};

const setCommands = async ({ client }) => {
  client.commands = new Collection();

  const commands = await groupCommands()

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
};

module.exports = {
  executeCommand,
  setCommands,
};