import chalk from 'chalk'
import { readdirSync } from 'fs'
import { join } from 'path'
import type { CustomClient } from '../../types'
import { infoLog, errorLog } from '../general/log'

function getEventFiles(): string[] {
    const eventsPath = join(process.cwd(), 'src', 'events')
    return readdirSync(eventsPath).filter((file) => file.endsWith('.ts'))
}

function validateEvent(event: unknown, filePath: string): boolean {
    const eventObj = event as { name?: string; execute?: Function }
    if (!eventObj.name || !eventObj.execute) {
        errorLog({
            message: `Event at ${filePath} is missing required properties (name or execute)`,
        })
        return false
    }
    return true
}

async function loadEventFromFile(filePath: string): Promise<unknown | null> {
    try {
        const event = await import(filePath) as { name?: string; execute?: Function }

        if (!validateEvent(event, filePath)) {
            return null
        }

        return event
    } catch (error) {
        errorLog({
            message: `Error loading event from ${filePath}:`,
            error,
        })
        return null
    }
}

function createEventHandler(event: unknown): (...args: unknown[]) => void {
    const eventObj = event as { name: string; execute: (...args: unknown[]) => unknown }
    return (...args: unknown[]) => {
        try {
            if (eventObj.name === 'interactionCreate' && args[0]) {
                return eventObj.execute(args[0])
            }
            return eventObj.execute(...args)
        } catch (error) {
            errorLog({
                message: `Error executing event ${eventObj.name}:`,
                error,
            })
        }
    }
}

function registerEvent(client: CustomClient, event: unknown): void {
    const eventObj = event as { name: string; once?: boolean }
    const handler = createEventHandler(event)

    if (eventObj.once) {
        client.once(eventObj.name, handler)
    } else {
        client.on(eventObj.name, handler)
    }
}

export async function loadEvents(client: CustomClient): Promise<void> {
    try {
        const eventFiles = getEventFiles()

        for (const file of eventFiles) {
            const filePath = join(process.cwd(), 'src', 'events', file)
            const event = await loadEventFromFile(filePath)

            if (event) {
                registerEvent(client, event)
                infoLog({
                    message: `Loaded event: ${chalk.white((event as { name: string }).name)}`,
                })
            }
        }
    } catch (error) {
        errorLog({ message: 'Error loading events:', error })
    }
}
