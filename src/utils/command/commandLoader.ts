import fs from "fs"
import path from "path"
import { errorLog, infoLog, debugLog } from "../general/log"
import Command from "../../models/Command"

export async function loadCommandsFromDir(
    directoryPath: string,
): Promise<Command[]> {
    try {
        debugLog({ message: `Reading directory: ${directoryPath}` })

        // Ensure the path is absolute
        const absolutePath = path.isAbsolute(directoryPath)
            ? directoryPath
            : path.resolve(directoryPath)
        debugLog({ message: `Absolute path: ${absolutePath}` })

        // Check if directory exists
        if (!fs.existsSync(absolutePath)) {
            errorLog({ message: `Directory does not exist: ${absolutePath}` })
            return []
        }

        // Get all JavaScript or TypeScript files in the directory, but ignore .d.ts files
        const commandFiles = fs
            .readdirSync(absolutePath)
            .filter(
                (file) =>
                    (file.endsWith(".js") || file.endsWith(".ts")) &&
                    !file.endsWith(".d.ts"),
            )

        debugLog({
            message: `Found ${commandFiles.length} command files in ${absolutePath}`,
        })

        // Filter out index files
        const filteredCommandFiles = commandFiles.filter(
            (file) => file !== "index.ts" && file !== "index",
        )

        debugLog({
            message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)`,
        })

        // Load commands using dynamic import
        const commands: Command[] = []
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file)
                debugLog({ message: `Loading command from: ${filePath}` })

                // Use dynamic import for ESM modules
                const commandModule = await import(filePath)

                // Try to get the command from either default export or named export
                const command = commandModule.default ?? commandModule.command

                if (command instanceof Command) {
                    debugLog({
                        message: `Successfully loaded command: ${command.data.name} from ${file}`,
                    })
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

        infoLog({
            message: `Successfully loaded ${commands.length} commands from ${absolutePath}`,
        })
        return commands
    } catch (error) {
        errorLog({ message: "Error getting commands from directory:", error })
        return []
    }
}
