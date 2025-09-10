import fs from "fs"
import path from "path"
import { errorLog, infoLog, debugLog } from "../general/log"
import type Command from "../../models/Command"

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

        // Get all JavaScript files in the directory (ignore .d.ts and other files)
        const commandFiles = fs
            .readdirSync(absolutePath)
            .filter((file) => file.endsWith(".js"))

        debugLog({
            message: `Found ${commandFiles.length} command files in ${absolutePath}`,
        })

        // Filter out index files
        const filteredCommandFiles = commandFiles.filter(
            (file) => file !== "index.js" && file !== "index",
        )

        debugLog({
            message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)`,
        })

        // Load commands synchronously
        const commands: Command[] = []
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file)
                debugLog({ message: `Loading command from: ${filePath}` })

                debugLog({ message: `About to import: ${filePath}` })

                const commandModule = await import(filePath)

                debugLog({
                    message: "Imported command module",
                    data: commandModule,
                })
                const command = commandModule.default ?? commandModule.command
                debugLog({ message: "Extracted command", data: command })

                if (
                    command &&
                    typeof command === "object" &&
                    typeof command.data === "object" &&
                    typeof command.execute === "function"
                ) {
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
                    data: error,
                })
            }
        }

        infoLog({
            message: `Successfully loaded ${commands.length} commands from ${absolutePath}`,
        })
        return commands
    } catch (error) {
        errorLog({
            message: `Error loading commands from directory ${directoryPath}:`,
            error,
        })
        return []
    }
}
