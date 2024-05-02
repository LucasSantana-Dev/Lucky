import { executeCommand } from "./createCommands.js";

export const handleInteractions = async ({ client }) => {
  try {
    await client.on("interactionCreate", async interaction => executeCommand({ interaction, client }));
  } catch (err) {
    console.error('Error handling interaction:', err);
  }
}