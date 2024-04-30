import { generalCommands } from "./general/commands/index.js";
import { musicCommands } from "./music/commands/index.js";

export const commands = [...musicCommands, ...generalCommands];