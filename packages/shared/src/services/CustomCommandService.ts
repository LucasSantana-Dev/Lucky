import { getPrismaClient } from '../utils/database/prismaClient.js'
import { Prisma } from '../generated/prisma/client.js'
import type { EmbedData } from './embedValidation.js'

const prisma = getPrismaClient()

/** Manages guild-specific custom commands with permissions. */
export class CustomCommandService {
    /** Creates a new custom command for a guild. */
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
        const result = await prisma.customCommand.create({
            data: {
                guildId,
                name: name.toLowerCase(),
                description: options?.description,
                response,
                embedData: options?.embedData
                    ? JSON.stringify(options.embedData)
                    : Prisma.JsonNull,
                allowedRoles: options?.allowedRoles || [],
                allowedChannels: options?.allowedChannels || [],
                createdBy: options?.createdBy || 'unknown',
            },
        })
        return result
    }

    /** Creates or updates a custom command with transactional locking. */
    async upsertCommand(
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
    ): Promise<'created' | 'updated'> {
        const normalizedName = name.toLowerCase()
        const lockKey = `custom-command:${guildId}:${normalizedName}`

        const state = await prisma.$transaction(async (tx) => {
            // Transaction lock for consistent read-modify-write semantics, not cache coherence
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

            const existing = await tx.customCommand.findUnique({
                where: {
                    guildId_name: {
                        guildId,
                        name: normalizedName,
                    },
                },
                select: { id: true },
            })

            if (!existing) {
                await tx.customCommand.create({
                    data: {
                        guildId,
                        name: normalizedName,
                        description: options?.description,
                        response,
                        embedData: options?.embedData
                            ? JSON.stringify(options.embedData)
                            : Prisma.JsonNull,
                        allowedRoles: options?.allowedRoles || [],
                        allowedChannels: options?.allowedChannels || [],
                        createdBy: options?.createdBy || 'unknown',
                    },
                })
                return 'created'
            }

            await tx.customCommand.update({
                where: { id: existing.id },
                data: {
                    description: options?.description ?? null,
                    response,
                    embedData: options?.embedData
                        ? JSON.stringify(options.embedData)
                        : Prisma.JsonNull,
                    allowedRoles: options?.allowedRoles || [],
                    allowedChannels: options?.allowedChannels || [],
                    enabled: true,
                },
            })
            return 'updated'
        })

        return state
    }

    /** Retrieves a custom command by name. */
    async getCommand(guildId: string, name: string) {
        const command = await prisma.customCommand.findUnique({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
        })

        const result = command
            ? {
                  ...command,
                  embedData: command.embedData
                      ? ((typeof command.embedData === 'string'
                            ? JSON.parse(command.embedData)
                            : command.embedData) as EmbedData)
                      : null,
              }
            : null

        return result
    }

    /** Lists all custom commands for a guild. */
    async listCommands(guildId: string) {
        return await prisma.customCommand.findMany({
            where: { guildId },
            orderBy: { useCount: 'desc' },
        })
    }

    /** Updates a custom command. */
    async updateCommand(
        guildId: string,
        name: string,
        data: Prisma.CustomCommandUpdateInput,
    ) {
        const result = await prisma.customCommand.update({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
            data,
        })
        return result
    }

    /** Deletes a custom command. */
    async deleteCommand(guildId: string, name: string) {
        const result = await prisma.customCommand.delete({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
        })
        return result
    }

    /** Increments command usage counter and updates last used timestamp. */
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

    /** Checks if a user can execute a command based on role and channel permissions. */
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

    /** Generates statistics about custom commands in a guild. */
    async getStats(guildId: string) {
        const commands = await this.listCommands(guildId)

        return {
            totalCommands: commands.length,
            totalUses: commands.reduce((sum, cmd) => sum + cmd.useCount, 0),
            mostUsed: commands.sort((a, b) => b.useCount - a.useCount)[0],
            recentlyCreated: commands.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            )[0],
        }
    }
}

/** Singleton instance of CustomCommandService. */
export const customCommandService = new CustomCommandService()
