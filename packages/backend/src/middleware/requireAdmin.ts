import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth'
import { isDeveloperUser } from '../utils/developerAccess'

export function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    if (!req.userId) {
        res.status(401).json({ error: 'Not authenticated' })
        return
    }

    if (!isDeveloperUser(req.userId)) {
        res.status(403).json({ error: 'Admin access required' })
        return
    }

    next()
}
