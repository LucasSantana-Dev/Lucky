const getGeneralCommands = require("./general/commands/index.js");
const getMusicCommands = require("./music/commands/index.js");

const groupCommands = async () => {
  const generalCommands = await getGeneralCommands();
  const musicCommands = await getMusicCommands();

  const commands = [...generalCommands, ...musicCommands];

  return commands;
}

(async () => {
  const commands = await groupCommands();
  module.exports = { commands };
})();