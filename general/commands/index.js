import { getCommandsFromDirectory } from "../../utils/getCommandsFromDirectory.js";

const generalCommands = await getCommandsFromDirectory({ url: import.meta.url });

export { generalCommands };