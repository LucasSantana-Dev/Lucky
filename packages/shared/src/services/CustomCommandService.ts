import { getPrismaClient } from '../utils/database/prismaClient.js'
import type { EmbedData } from './EmbedBuilderService.js'

const prisma = getPrismaClient()

export class CustomCommandService {
    /**
     * Create a custom command
     */
    async createCommand(
        guildId: string,
        name: string,
        response: string,
        options?: {
            description?: string
            embedData?: EmbedData
            allowedRoles?: string[]
            allowedChannels?: string[]
            createdBy?: string
        },
    ) {
        return await prisma.customCommand.create({
            data: {
                guildId,
                name: name.toLowerCase(),
                description: options?.description,
                response,
                embedData: options?.embedData
                    ? JSON.stringify(options.embedData)
                    : null,
                allowedRoles: options?.allowedRoles || [],
                allowedChannels: options?.allowedChannels || [],
                createdBy: options?.createdBy || 'unknown',
            },
        })
    }

    /**
     * Get a command by name
     */
    async getCommand(guildId: string, name: string) {
        const command = await prisma.customCommand.findUnique({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
        })

        if (!command) return null

        return {
            ...command,
            embedData: command.embedData
                ? (JSON.parse(command.embedData) as EmbedData)
                : null,
        }
    }

    /**
     * List all commands for a guild
     */
    async listCommands(guildId: string) {
        return await prisma.customCommand.findMany({
            where: { guildId },
            orderBy: { useCount: 'desc' },
        })
    }

    /**
     * Update a command
     */
    async updateCommand(
        guildId: string,
        name: string,
        data: Partial<{
            response: string
            description: string | null
            embedData: string | null
            allowedRoles: string[]
            allowedChannels: string[]
        }>,
    ) {
        return await prisma.customCommand.update({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
            data,
        })
    }

    /**
     * Delete a command
     */
    async deleteCommand(guildId: string, name: string) {
        return await prisma.customCommand.delete({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
        })
    }

    /**
     * Increment command usage
     */
    async incrementUsage(guildId: string, name: string) {
        return await prisma.customCommand.update({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
            data: {
                useCount: {
                    increment: 1,
                },
                lastUsed: new Date(),
            },
        })
    }

    /**
     * Check if user can use command
     */
    canUseCommand(
        command: {
            allowedRoles: string[]
            allowedChannels: string[]
        },
        userRoles: string[],
        channelId: string,
    ): boolean {
        // If no restrictions, anyone can use
        if (
            command.allowedRoles.length === 0 &&
            command.allowedChannels.length === 0
        ) {
            return true
        }

        // Check channel restriction
        if (
            command.allowedChannels.length > 0 &&
            !command.allowedChannels.includes(channelId)
        ) {
            return false
        }

        // Check role restriction
        if (command.allowedRoles.length > 0) {
            const hasRole = userRoles.some((roleId) =>
                command.allowedRoles.includes(roleId),
            )
            if (!hasRole) return false
        }

        return true
    }

    /**
     * Get command statistics
     */
    async getStats(guildId: string) {
        const commands = await this.listCommands(guildId)

        return {
            totalCommands: commands.length,
            totalUses: commands.reduce((sum, cmd) => sum + cmd.useCount, 0),
            mostUsed: commands[0] || null,
            recentlyAdded:
                commands.sort(
                    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                )[0] || null,
        }
    }
}

export const customCommandService = new CustomCommandService()
