const { getGeneralCommands } = require("./general/commands");
const { getMusicCommands } = require("./music/commands");

const groupCommands = async () => {
  const generalCommands = await getGeneralCommands();
  const musicCommands = await getMusicCommands();

  const commands = [...generalCommands, ...musicCommands];

  return commands;
}

module.exports = { groupCommands }