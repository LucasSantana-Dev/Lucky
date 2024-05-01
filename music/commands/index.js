const { pathToFileURL } = require('url');
const { getCommandsFromDirectory } = require("../../utils/getCommandsFromDirectory.js");

const getMusicCommands = async () => {
  return musicCommands = await getCommandsFromDirectory({ url: pathToFileURL(__dirname).href });

}

module.exports = { getMusicCommands };