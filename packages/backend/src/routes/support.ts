import type { Express, Response, Request, NextFunction } from 'express'
import { createHash } from 'crypto'
import multer, { type Multer } from 'multer'
import { z } from 'zod'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { SupportReportService } from '@lucky/shared/services'
import { validateSupportImage } from '@lucky/shared/utils/support'
import { getSupportUrl } from '@lucky/shared/config/config'
import { errorLog, debugLog } from '@lucky/shared/utils'

// Snowflake ID validation (Discord snowflake: 17-20 digits)
const snowflakeId = z.string().regex(/^\d{17,20}$/)

// Configure multer for single file uploads with 5MB size limit
const upload: Multer = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
        files: 1,
    },
})

/**
 * Wraps multer's single-image parse so upload errors map to AppError statuses
 * (oversized → 413, other multer errors → 400) instead of leaking a raw
 * MulterError to the generic 500 handler. multer aborts >5MB uploads itself,
 * before validateSupportImage runs, so this is where the 413 originates.
 */
function uploadSingleImage(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    upload.single('image')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                next(AppError.payloadTooLarge('Image exceeds 5 MB limit'))
                return
            }
            next(AppError.badRequest(`Upload error: ${err.message}`))
            return
        }
        if (err) {
            next(err instanceof Error ? err : new Error(String(err)))
            return
        }
        next()
    })
}

const DISCORD_API = 'https://discord.com/api/v10'

/**
 * Hash the client IP into a non-reversible token for rate-limiting purposes.
 * Never store raw IPs per the SupportReport model.
 */
function hashClientIp(ip: string | undefined): string {
    const sanitized = ip ?? ''
    return createHash('sha256').update(sanitized).digest('hex').slice(0, 32)
}

/**
 * Attempt to notify a Discord staff channel about a new support report.
 * Wrapped in try/catch; failures do not fail the report submission.
 */
async function notifyStaffChannel(
    reportId: string,
    context: string,
): Promise<void> {
    const channelId = process.env.SUPPORT_STAFF_CHANNEL_ID
    const token = process.env.DISCORD_TOKEN

    if (!channelId || !token) {
        debugLog({
            message: 'support staff notification skipped',
            data: {
                reason: !channelId
                    ? 'SUPPORT_STAFF_CHANNEL_ID not configured'
                    : 'DISCORD_TOKEN not configured',
            },
        })
        return
    }

    try {
        const supportUrl = getSupportUrl()
        const adminLink = supportUrl
            ? `${supportUrl.replace(/\/$/, '')}/admin/support/${reportId}`
            : null

        const contextPreview =
            context.length > 100 ? `${context.slice(0, 97)}...` : context

        const content = [
            '📋 New Support Report',
            `ID: \`${reportId}\``,
            `Context: ${contextPreview}`,
            adminLink ? `[View in Dashboard](${adminLink})` : null,
        ]
            .filter(Boolean)
            .join('\n')

        const resp = await fetch(
            `${DISCORD_API}/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bot ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: content.slice(0, 1900),
                    // User-submitted context is untrusted: suppress all mentions
                    // so a report body can't ping @everyone/@here/roles in staff.
                    allowed_mentions: { parse: [] },
                }),
            },
        )

        if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            errorLog({
                message: 'support staff channel notification failed',
                data: { status: resp.status, reportId, text },
            })
        }
    } catch (err) {
        errorLog({
            message: 'support staff channel notification error',
            data: {
                reportId,
                error: err instanceof Error ? err.message : String(err),
            },
        })
    }
}

// Zod schema for POST /api/support body
const createSupportSchema = z.object({
    context: z.string().min(1, 'Context required'),
    cid: z.string().optional(), // correlationId
    guildId: snowflakeId.optional(),
    category: z.string().optional(), // errorCategory
    // Client-generated dedup key (#1319): same key → same report, one ping.
    sid: z
        .string()
        .min(8)
        .max(64)
        .regex(/^[\w-]+$/)
        .optional(),
})

// Zod schema for query params on GET list
const listSupportSchema = z.object({
    status: z.string().optional(),
    cursor: z.string().optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
})

// Zod schema for id param
const idParamSchema = z.object({
    id: z.string().min(1),
})

export function setupSupportRoutes(app: Express): void {
    const service = new SupportReportService()

    /**
     * POST /api/support — Create a support report (public, rate-limited)
     * Multipart form data: context (required), image (optional), cid, guildId, category
     */
    app.post(
        '/api/support',
        writeLimiter,
        uploadSingleImage,
        asyncHandler(async (req, res: Response) => {
            // Validate body fields
            const parseResult = createSupportSchema.safeParse(req.body)
            if (!parseResult.success) {
                throw AppError.badRequest('context is required')
            }

            const { context, cid, guildId, category, sid } = parseResult.data

            // Validate image if present
            if (req.file) {
                const validation = validateSupportImage({
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                })
                if (!validation.valid) {
                    // Map validation error to appropriate HTTP status
                    if (
                        validation.error?.includes('exceeds 5 MB') ||
                        validation.error?.includes('too large')
                    ) {
                        throw AppError.payloadTooLarge(
                            validation.error || 'File too large',
                        )
                    } else {
                        throw AppError.unsupportedMediaType(
                            validation.error || 'Invalid image',
                        )
                    }
                }
            }

            // Hash client IP for rate-limiting key
            const rateLimitKey = hashClientIp(req.ip)

            // Create the report
            const result = await service.create({
                context,
                image: req.file?.buffer ?? null,
                imageMimeType: req.file?.mimetype,
                correlationId: cid,
                guildId,
                surface: 'web',
                errorCategory: category,
                rateLimitKey,
                submissionKey: sid,
            })

            // Replayed submission (#1319): the original report already
            // pinged staff — return its id without a second notification.
            if (result.deduped) {
                res.json({ id: result.id })
                return
            }

            // Attempt staff notification (best-effort, never fails the request)
            notifyStaffChannel(result.id, context).catch(() => {
                // Already logged inside notifyStaffChannel
            })

            res.status(201).json({ id: result.id })
        }),
    )

    /**
     * GET /api/admin/support — List support reports (admin-gated)
     */
    app.get(
        '/api/admin/support',
        requireAuth,
        requireAdmin,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const parseResult = listSupportSchema.safeParse(req.query)
            if (!parseResult.success) {
                throw AppError.badRequest('Invalid query parameters')
            }

            const { status, cursor, take } = parseResult.data

            const reports = await service.list({
                status,
                cursor,
                take,
            })

            res.json(reports)
        }),
    )

    /**
     * GET /api/admin/support/:id — Get a single support report (admin-gated)
     */
    app.get(
        '/api/admin/support/:id',
        requireAuth,
        requireAdmin,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const parseResult = idParamSchema.safeParse(req.params)
            if (!parseResult.success) {
                throw AppError.badRequest('Invalid ID')
            }

            const report = await service.get(parseResult.data.id)
            if (!report) {
                throw AppError.notFound('Report not found')
            }

            // Return metadata only; use /image endpoint to fetch bytes
            const { image, ...metadata } = report
            res.json({
                ...metadata,
                hasImage: !!image,
            })
        }),
    )

    /**
     * GET /api/admin/support/:id/image — Stream image bytes (admin-gated)
     */
    app.get(
        '/api/admin/support/:id/image',
        requireAuth,
        requireAdmin,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const parseResult = idParamSchema.safeParse(req.params)
            if (!parseResult.success) {
                throw AppError.badRequest('Invalid ID')
            }

            const report = await service.get(parseResult.data.id)
            if (!report || !report.image) {
                throw AppError.notFound('Image not found')
            }

            // Binary image bytes from a validated upload (mime restricted to
            // png/jpeg/webp at write time). Serve with the stored content-type
            // and nosniff so the browser can't reinterpret the payload as
            // anything executable, and stream as a raw Buffer via res.end.
            const imageBuffer = Buffer.isBuffer(report.image)
                ? report.image
                : Buffer.from(report.image as Uint8Array)
            res.setHeader(
                'Content-Type',
                report.imageMimeType || 'application/octet-stream',
            )
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.setHeader('Content-Disposition', 'inline')
            res.end(imageBuffer)
        }),
    )
}
