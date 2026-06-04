import { getPrismaClient } from '../utils/database/prismaClient.js'
import { Prisma } from '../generated/prisma/client.js'
import type { EmbedData } from './embedValidation.js'
import { embedDataSchema } from './embedValidation.js'
import { ValidationError } from '../errors/ValidationError.js'

const prisma = getPrismaClient()

/** Manages guild-specific custom commands with permissions. */
export class CustomCommandService {
    /**
     * Validates embedData against the schema.
     * Throws a ValidationError if the shape is invalid.
     */
    private validateEmbedData(embedData: unknown): EmbedData {
        const result = embedDataSchema.safeParse(embedData)
        if (!result.success) {
            const errors = result.error.issues.map((e) => ({
                field: e.path.join('.') || 'root',
                message: e.message,
            }))
            throw new ValidationError('Invalid embed data', errors)
        }
        return result.data
    }

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
        // Validate embedData if provided
        let validatedEmbedData: EmbedData | null = null
        if (options?.embedData !== undefined && options?.embedData !== null) {
            // Reject primitive embedData
            if (typeof options.embedData !== 'object') {
                throw new ValidationError('Invalid embed data', [
                    {
                        field: 'embedData',
                        message: 'embedData must be an object or null',
                    },
                ])
            }
            validatedEmbedData = this.validateEmbedData(options.embedData)
        }

        const result = await prisma.customCommand.create({
            data: {
                guildId,
                name: name.toLowerCase(),
                description: options?.description,
                response,
                embedData: validatedEmbedData
                    ? JSON.stringify(validatedEmbedData)
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
        // Validate embedData if provided
        let validatedEmbedData: EmbedData | null = null
        if (options?.embedData !== undefined && options?.embedData !== null) {
            // Reject primitive embedData
            if (typeof options.embedData !== 'object') {
                throw new ValidationError('Invalid embed data', [
                    {
                        field: 'embedData',
                        message: 'embedData must be an object or null',
                    },
                ])
            }
            validatedEmbedData = this.validateEmbedData(options.embedData)
        }

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
                        embedData: validatedEmbedData
                            ? JSON.stringify(validatedEmbedData)
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
                    embedData: validatedEmbedData
                        ? JSON.stringify(validatedEmbedData)
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
        // Validate embedData if provided in the update (and not explicitly clearing it)
        if (
            data.embedData !== undefined &&
            data.embedData !== null &&
            data.embedData !== Prisma.JsonNull &&
            data.embedData !== Prisma.DbNull
        ) {
            // embedData is being set to a new value
            if (typeof data.embedData === 'object') {
                // Object embedData: validate and stringify
                const validatedEmbedData = this.validateEmbedData(
                    data.embedData,
                )
                data = {
                    ...data,
                    embedData: JSON.stringify(validatedEmbedData),
                }
            } else {
                // Primitive embedData (string, number, etc.) is not allowed
                throw new ValidationError('Invalid embed data', [
                    {
                        field: 'embedData',
                        message: 'embedData must be an object or null',
                    },
                ])
            }
        }
        // If embedData is null or Prisma.JsonNull, leave it as-is (clearing the embed)

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
