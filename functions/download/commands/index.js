import { getCommandsFromDirectory } from "../../../utils/getCommandsFromDirectory.js";

const downloadCommands = await getCommandsFromDirectory({ url: import.meta.url });

export default downloadCommands;