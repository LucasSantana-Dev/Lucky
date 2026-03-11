import { getPrismaClient } from '../utils/database/prismaClient.js'
import { Prisma } from '../generated/prisma/client.js'
import { redisClient } from './redis/index.js'
import { errorLog } from '../utils/general/log.js'
import type { EmbedData } from './embedValidation.js'

const prisma = getPrismaClient()
const CACHE_TTL = 300
const CACHE_PREFIX = 'cmd:'

export class CustomCommandService {
    private cacheKey(guildId: string, name: string): string {
        return `${CACHE_PREFIX}${guildId}:${name.toLowerCase()}`
    }

    private invalidateCommand(guildId: string, name: string): void {
        if (redisClient.isHealthy()) {
            redisClient.del(this.cacheKey(guildId, name)).catch(() => {})
        }
    }

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
        this.invalidateCommand(guildId, name)
        return result
    }

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

        this.invalidateCommand(guildId, normalizedName)
        return state
    }

    async getCommand(guildId: string, name: string) {
        const key = this.cacheKey(guildId, name)

        if (redisClient.isHealthy()) {
            try {
                const cached = await redisClient.get(key)
                if (cached) {
                    const parsed = JSON.parse(cached)
                    if (parsed === null) return null
                    return parsed
                }
            } catch (err) {
                errorLog({ message: 'Command cache read error', error: err })
            }
        }

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

        if (redisClient.isHealthy()) {
            redisClient
                .setex(key, CACHE_TTL, JSON.stringify(result))
                .catch(() => {})
        }

        return result
    }

    async listCommands(guildId: string) {
        return await prisma.customCommand.findMany({
            where: { guildId },
            orderBy: { useCount: 'desc' },
        })
    }

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
        this.invalidateCommand(guildId, name)
        return result
    }

    async deleteCommand(guildId: string, name: string) {
        const result = await prisma.customCommand.delete({
            where: {
                guildId_name: {
                    guildId,
                    name: name.toLowerCase(),
                },
            },
        })
        this.invalidateCommand(guildId, name)
        return result
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
            mostUsed: commands.sort((a, b) => b.useCount - a.useCount)[0],
            recentlyCreated: commands.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            )[0],
        }
    }
}

export const customCommandService = new CustomCommandService()
