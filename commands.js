import generalCommands from "./general/commands/index.js";
import musicCommands from "./music/commands/index.js";

const commands = [...musicCommands, ...generalCommands]

export default commands;