import downloadCommands from "../functions/download/commands/index.js";
import generalCommands from "../functions/general/commands/index.js";
import { groupCommands } from "../handlers/commandsHandler.js";
import musicCommands from "../functions/music/commands/index.js";
import { errorLog } from "./log.js";

const commands = (async () => {
  try {
    return await groupCommands({
      commands: [
        ...downloadCommands,
        ...generalCommands,
        ...musicCommands
      ]
    })
  } catch (error) {
    errorLog({ message: 'Error grouping commands:', error });
  }
})();

export default commands;