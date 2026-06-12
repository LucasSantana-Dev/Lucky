import { getPrismaClient } from '../utils/database/prismaClient.js'
import { Prisma } from '../generated/prisma/client.js'
import {
    validateEmbedData as _validateEmbedData,
    hexToDecimal as _hexToDecimal,
    decimalToHex as _decimalToHex,
    type EmbedData,
    type EmbedField,
} from './embedValidation.js'

const prisma = getPrismaClient()

/** Data structure representing a stored embed template. */
export type EmbedTemplate = {
    id: string
    guildId: string
    name: string
    title: string | null
    description: string | null
    color: string | null
    footer: string | null
    thumbnail: string | null
    image: string | null
    fields: unknown
    useCount: number
    createdBy: string
    createdAt: Date
    updatedAt: Date
}

/** Service for managing Discord embed templates with persistence and validation. */
export class EmbedBuilderService {
    /** Creates a new embed template with the given data. */
    async createTemplate(
        guildId: string,
        name: string,
        embedData: Partial<EmbedData>,
        description?: string,
        createdBy?: string,
    ): Promise<EmbedTemplate> {
        return await prisma.embedTemplate.create({
            data: {
                guildId,
                name: name.toLowerCase(),
                title: embedData.title ?? null,
                description: embedData.description ?? null,
                color: embedData.color ?? null,
                footer: embedData.footer ?? null,
                thumbnail: embedData.thumbnail ?? null,
                image: embedData.image ?? null,
                fields: embedData.fields
                    ? (embedData.fields as unknown as Prisma.InputJsonValue)
                    : undefined,
                createdBy: createdBy ?? 'unknown',
            },
        })
    }

    /** Creates or updates an embed template, returning whether it was created or updated. */
    async upsertTemplate(
        guildId: string,
        name: string,
        embedData: Partial<EmbedData>,
        createdBy = 'unknown',
    ): Promise<'created' | 'updated'> {
        const normalizedName = name.toLowerCase()
        const lockKey = `embed-template:${guildId}:${normalizedName}`

        return await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

            const existing = await tx.embedTemplate.findUnique({
                where: {
                    guildId_name: {
                        guildId,
                        name: normalizedName,
                    },
                },
                select: { id: true },
            })

            const payload = {
                title: embedData.title ?? null,
                description: embedData.description ?? null,
                color: embedData.color ?? null,
                footer: embedData.footer ?? null,
                thumbnail: embedData.thumbnail ?? null,
                image: embedData.image ?? null,
                fields: embedData.fields
                    ? (embedData.fields as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
            }

            if (!existing) {
                await tx.embedTemplate.create({
                    data: {
                        guildId,
                        name: normalizedName,
                        ...payload,
                        createdBy,
                    },
                })
                return 'created'
            }

            await tx.embedTemplate.update({
                where: { id: existing.id },
                data: payload,
            })

            return 'updated'
        })
    }

    /** Retrieves an embed template by guild and name, or null if not found. */
    async getTemplate(
        guildId: string,
        name: string,
    ): Promise<EmbedTemplate | null> {
        const normalizedName = name.toLowerCase()
        return await prisma.embedTemplate.findFirst({
            where: { guildId, name: normalizedName },
        })
    }

    /** Lists all embed templates for a guild, ordered by name. */
    async listTemplates(guildId: string): Promise<EmbedTemplate[]> {
        return await prisma.embedTemplate.findMany({
            where: { guildId },
            orderBy: { name: 'asc' },
        })
    }

    /** Updates an existing embed template with the provided data. */
    async updateTemplate(
        guildId: string,
        name: string,
        updates: Partial<EmbedData & { description: string }>,
    ): Promise<EmbedTemplate> {
        const normalizedName = name.toLowerCase()
        const { fields, ...rest } = updates

        try {
            // Single atomic update on the compound unique key: returns the
            // updated row without a separate read-back that could observe a
            // concurrent write or deletion.
            return await prisma.embedTemplate.update({
                where: { guildId_name: { guildId, name: normalizedName } },
                data: {
                    ...rest,
                    ...(fields && {
                        fields: fields as unknown as Prisma.InputJsonValue,
                    }),
                },
            })
        } catch (error) {
            const code =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof (error as { code?: unknown }).code === 'string'
                    ? (error as { code: string }).code
                    : null

            // Prisma P2025 = record not found
            if (code === 'P2025') {
                throw new Error(
                    `Template "${name}" not found in guild ${guildId}`,
                )
            }
            throw error
        }
    }

    /** Deletes an embed template from the database. */
    async deleteTemplate(guildId: string, name: string): Promise<void> {
        const normalizedName = name.toLowerCase()
        const result = await prisma.embedTemplate.deleteMany({
            where: { guildId, name: normalizedName },
        })
        if (result.count === 0) {
            throw new Error(`Template "${name}" not found in guild ${guildId}`)
        }
    }

    /** Increments the usage count of an embed template. */
    async incrementUsage(guildId: string, name: string): Promise<void> {
        const normalizedName = name.toLowerCase()
        await prisma.embedTemplate.updateMany({
            where: { guildId, name: normalizedName },
            data: { useCount: { increment: 1 } },
        })
    }

    /** Validates embed data and returns validation errors if any. */
    validateEmbedData(embedData: Partial<EmbedData>): {
        valid: boolean
        errors: string[]
    } {
        return _validateEmbedData(embedData)
    }

    /** Converts a hexadecimal color string to a decimal number. */
    hexToDecimal(hex: string): number {
        return _hexToDecimal(hex)
    }

    /** Converts a decimal color number to a hexadecimal string. */
    decimalToHex(decimal: number): string {
        return _decimalToHex(decimal)
    }
}

/** Global instance of the embed builder service. */

export const embedBuilderService = new EmbedBuilderService()
