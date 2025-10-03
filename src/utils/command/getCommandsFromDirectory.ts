import fs from "fs"
import path from "path"
import { errorLog, debugLog } from "../general/log"
import type Command from "../../models/Command"
import { config } from "../../config/config"

type GetCommandsParams = {
    url: string
    category?: string
}

export const getCommandsFromDirectory = async ({
    url,
    category,
}: GetCommandsParams): Promise<Command[]> => {
    try {
        // Defensive: If category is disabled, return [] immediately
        if (category) {
            const { COMMAND_CATEGORIES_DISABLED } = config()
            if (COMMAND_CATEGORIES_DISABLED.includes(category)) {
                debugLog({
                    message: `Category '${category}' is disabled via config. Skipping load.`,
                })
                return []
            }
        }

        // Ensure the path is absolute
        const absolutePath = path.isAbsolute(url) ? url : path.resolve(url)
        // Removed detailed path logging

        // Check if directory exists
        if (!fs.existsSync(absolutePath)) {
            errorLog({ message: `Directory does not exist: ${absolutePath}` })
            return []
        }

        // Get all JavaScript or TypeScript files in the directory (support dev and prod)
        const commandFiles = fs
            .readdirSync(absolutePath)
            .filter(
                (file) =>
                    (file.endsWith(".js") || file.endsWith(".ts")) &&
                    !file.endsWith(".d.ts"),
            )

        // Filter out index files (index.ts, index.js, etc.)
        const filteredCommandFiles = commandFiles.filter(
            (file) => !file.startsWith("index."),
        )

        // Load commands using dynamic imports
        const commands: Command[] = []
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file)
                // Removed detailed logging for each file

                // Convert file path to URL for dynamic import
                const fileUrl = `file://${filePath}`

                // Use dynamic import for ESM modules
                const commandModule = await import(fileUrl)

                // Try to get the command from either default export or named export
                const command = commandModule.default ?? commandModule.command

                if (
                    command &&
                    typeof command === "object" &&
                    typeof command.data === "object" &&
                    typeof command.execute === "function"
                ) {
                    // Don't log each command load to reduce log spam
                    commands.push(command)
                } else {
                    errorLog({
                        message: `Command in ${file} is not a valid Command instance`,
                    })
                }
            } catch (error) {
                errorLog({
                    message: `Error loading command from ${file}:`,
                    error,
                })
            }
        }

        debugLog({
            message: `Successfully loaded ${commands.length} commands from ${absolutePath}`,
        })
        // Filter out disabled commands by name
        const { COMMANDS_DISABLED } = config()
        const filteredCommands = commands.filter(
            (cmd) => !COMMANDS_DISABLED.includes(cmd.data.name),
        )
        if (filteredCommands.length !== commands.length) {
            debugLog({
                message: `Filtered out ${commands.length - filteredCommands.length} disabled commands from ${absolutePath}`,
            })
        }
        return filteredCommands
    } catch (error) {
        errorLog({ message: "Error getting commands from directory:", error })
        return []
    }
}
