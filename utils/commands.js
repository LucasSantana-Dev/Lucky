import downloadCommands from "../download/commands/index.js";
import generalCommands from "../general/commands/index.js";
import { groupCommands } from "../handlers/commandsHandler.js";
import musicCommands from "../music/commands/index.js";

const commands = await groupCommands({
  commands: [
    ...downloadCommands,
    ...generalCommands,
    ...musicCommands
  ]
})

export default commands;