import chalk from "chalk"
import { readdirSync } from "fs"
import { join } from "path"
import type { CustomClient } from "../../types"
import { infoLog, errorLog } from "../general/log"

export async function loadEvents(client: CustomClient): Promise<void> {
    try {
        const eventsPath = join(process.cwd(), "src", "events")
        const eventFiles = readdirSync(eventsPath).filter((file) =>
            file.endsWith(".ts"),
        )

        for (const file of eventFiles) {
            try {
                const filePath = join(eventsPath, file)
                const event = await import(filePath)

                if (!event.name || !event.execute) {
                    errorLog({
                        message: `Event at ${filePath} is missing required properties (name or execute)`,
                    })
                    continue
                }

                if (event.once) {
                    client.once(event.name, (...args: unknown[]) => {
                        try {
                            if (event.name === "interactionCreate" && args[0]) {
                                return event.execute(args[0])
                            }
                            return event.execute(...args)
                        } catch (error) {
                            errorLog({
                                message: `Error executing event ${event.name}:`,
                                error,
                            })
                        }
                    })
                } else {
                    client.on(event.name, (...args: unknown[]) => {
                        try {
                            if (event.name === "interactionCreate" && args[0]) {
                                return event.execute(args[0])
                            }
                            return event.execute(...args)
                        } catch (error) {
                            errorLog({
                                message: `Error executing event ${event.name}:`,
                                error,
                            })
                        }
                    })
                }

                infoLog({ message: `Loaded event: ${chalk.white(event.name)}` })
            } catch (error) {
                errorLog({
                    message: `Error loading event from ${file}:`,
                    error,
                })
                // Continue loading other events
            }
        }
    } catch (error) {
        errorLog({ message: "Error loading events:", error })
        // Don't throw the error, just log it and continue
    }
}
