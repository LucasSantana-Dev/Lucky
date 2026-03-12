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

export class EmbedBuilderService {
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

    async getTemplate(
        guildId: string,
        name: string,
    ): Promise<EmbedTemplate | null> {
        return await prisma.embedTemplate.findFirst({
            where: { guildId, name },
        })
    }

    async listTemplates(guildId: string): Promise<EmbedTemplate[]> {
        return await prisma.embedTemplate.findMany({
            where: { guildId },
            orderBy: { name: 'asc' },
        })
    }

    async updateTemplate(
        guildId: string,
        name: string,
        updates: Partial<EmbedData & { description: string }>,
    ): Promise<EmbedTemplate> {
        const existing = await prisma.embedTemplate.findFirst({
            where: { guildId, name },
        })
        if (!existing) {
            throw new Error(`Template "${name}" not found in guild ${guildId}`)
        }
        const { fields, ...rest } = updates
        return await prisma.embedTemplate.update({
            where: { id: existing.id },
            data: {
                ...rest,
                ...(fields && {
                    fields: fields as unknown as Prisma.InputJsonValue,
                }),
            },
        })
    }

    async deleteTemplate(guildId: string, name: string): Promise<void> {
        const existing = await prisma.embedTemplate.findFirst({
            where: { guildId, name },
        })
        if (!existing) {
            throw new Error(`Template "${name}" not found in guild ${guildId}`)
        }
        await prisma.embedTemplate.delete({
            where: { id: existing.id },
        })
    }

    async incrementUsage(guildId: string, name: string): Promise<void> {
        const existing = await prisma.embedTemplate.findFirst({
            where: { guildId, name },
        })
        if (!existing) return
        await prisma.embedTemplate.update({
            where: { id: existing.id },
            data: { useCount: { increment: 1 } },
        })
    }

    validateEmbedData(embedData: Partial<EmbedData>): {
        valid: boolean
        errors: string[]
    } {
        return _validateEmbedData(embedData)
    }

    hexToDecimal(hex: string): number {
        return _hexToDecimal(hex)
    }

    decimalToHex(decimal: number): string {
        return _decimalToHex(decimal)
    }
}

export const embedBuilderService = new EmbedBuilderService()
