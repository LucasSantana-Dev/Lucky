const { pathToFileURL } = require('url');
const { getCommandsFromDirectory } = require("../../utils/getCommandsFromDirectory.js");

const getGeneralCommands = async () => {
  return generalCommands = await getCommandsFromDirectory({ url: pathToFileURL(__dirname).href });
}

module.exports = { getGeneralCommands };