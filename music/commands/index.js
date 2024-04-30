import { getCommandsFromDirectory } from "../../utils/getCommandsFromDirectory.js";

const musicCommands = await getCommandsFromDirectory({ url: import.meta.url });

export { musicCommands };