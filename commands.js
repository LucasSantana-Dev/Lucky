import downloadCommands from "./download/commands/index.js";
import generalCommands from "./general/commands/index.js";
import musicCommands from "./music/commands/index.js";

const commands = [...musicCommands, ...generalCommands, ...downloadCommands]

export default commands;