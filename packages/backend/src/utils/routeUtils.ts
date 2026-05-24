import type { Response } from 'express'
import { errorLog } from '@lucky/shared/utils'
import type { AuthenticatedRequest } from '../middleware/auth'

interface ApiError {
    readonly status?: number
    readonly error?: string
}

export const wrapHandler =
    (
        h: (r: AuthenticatedRequest) => Promise<Record<string, unknown>>,
        ctx: string,
        defaultErr: string,
    ) =>
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            res.json(await h(req))
        } catch (e: unknown) {
            const apiErr =
                typeof e === 'object' && e !== null ? (e as ApiError) : {}
            const st = typeof apiErr.status === 'number' ? apiErr.status : 500
            const msg =
                typeof apiErr.error === 'string' ? apiErr.error : defaultErr
            if (st === 500) errorLog({ message: `${ctx} error`, error: e })
            res.status(st).json({ error: msg })
        }
    }
