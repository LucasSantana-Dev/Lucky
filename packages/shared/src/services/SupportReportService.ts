import { getPrismaClient } from '../utils/database/prismaClient.js'
import { validateSupportImage } from '../utils/support/supportImageValidation.js'

/**
 * Represents a support report record.
 */
export type SupportReport = {
    id: string
    createdAt: Date
    context: string
    image: unknown // Prisma Bytes field; can be Uint8Array or Buffer
    imageMimeType: string | null
    correlationId: string | null
    guildId: string | null
    surface: string
    errorCategory: string | null
    status: string
    rateLimitKey: string | null
}

/**
 * A support report summary as returned by list queries — image bytes omitted.
 */
export type SupportReportListItem = Omit<SupportReport, 'image'>

/**
 * Input payload for creating a new support report.
 */
export interface CreateReportInput {
    context: string // required: user-provided context
    image?: Uint8Array | Buffer | null // optional: image bytes
    imageMimeType?: string // optional: MIME type if image present
    correlationId?: string // optional: correlation ID from error
    guildId?: string // optional: guild that submitted
    surface: 'bot' | 'web' // required: where the error occurred
    errorCategory?: string // optional: light categorization hint
    rateLimitKey?: string // optional: opaque rate-limit key (no raw PII)
}

/**
 * List filter options for support reports.
 */
export interface ListReportsFilter {
    take?: number // max records to return (bounded to 100)
    cursor?: string // pagination cursor (report id)
    status?: string // optional: filter by status
}

/**
 * Service for managing support reports.
 * Owns the SupportReport Prisma model; handles creation, retrieval, listing.
 */
export class SupportReportService {
    /**
     * Creates a new support report and persists it.
     * Returns the created report's id.
     *
     * @param input Create input with context, optional image, correlationId, etc.
     * @returns Promise with { id }
     */
    async create(input: CreateReportInput): Promise<{ id: string }> {
        // Defense-in-depth: reject malformed image payloads before persisting,
        // even though the public route is the primary validation point.
        if (input.image) {
            const validation = validateSupportImage({
                size: input.image.byteLength,
                mimetype: input.imageMimeType,
            })
            if (!validation.valid) {
                throw new Error(`Invalid support image: ${validation.error}`)
            }
        }

        const prisma = getPrismaClient()

        const report = await prisma.supportReport.create({
            data: {
                context: input.context,
                image: (input.image ?? null) as any,
                imageMimeType: input.imageMimeType || null,
                correlationId: input.correlationId || null,
                guildId: input.guildId || null,
                surface: input.surface,
                errorCategory: input.errorCategory || null,
                status: 'new',
                rateLimitKey: input.rateLimitKey || null,
            },
        })

        return { id: report.id }
    }

    /**
     * Retrieves a single support report by id.
     *
     * @param id Report id (cuid)
     * @returns Promise with full SupportReport or null if not found
     */
    async get(id: string): Promise<SupportReport | null> {
        const prisma = getPrismaClient()

        const report = await prisma.supportReport.findUnique({
            where: { id },
        })

        return report || null
    }

    /**
     * Lists support reports with optional filtering and pagination.
     * The image bytes are omitted from list rows (fetch them via {@link get});
     * imageMimeType is kept so callers can show an attachment indicator.
     *
     * @param filter List options: take (bounded to 100), cursor, status
     * @returns Promise with array of SupportReport summaries (no image bytes)
     */
    async list(filter: ListReportsFilter = {}): Promise<SupportReportListItem[]> {
        const prisma = getPrismaClient()

        // Clamp take to a positive integer in [1, 100]; guard NaN/Infinity/<=0.
        const requested = Number.isFinite(filter.take)
            ? Math.floor(filter.take as number)
            : 20
        const take = Math.min(Math.max(requested, 1), 100)

        const reports = await prisma.supportReport.findMany({
            where: filter.status ? { status: filter.status } : undefined,
            take,
            skip: filter.cursor ? 1 : 0,
            cursor: filter.cursor ? { id: filter.cursor } : undefined,
            // createdAt is non-unique; the id tiebreaker keeps cursor pages stable.
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            omit: { image: true },
        })

        return reports
    }
}
