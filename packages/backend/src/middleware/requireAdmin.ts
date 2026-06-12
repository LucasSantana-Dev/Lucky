import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth'

function getDeveloperUserIds(): Set<string> {
    const raw = process.env.DEVELOPER_USER_IDS ?? ''
    return new Set(
        raw
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
    )
}

export function isDeveloperUser(userId?: string): boolean {
    if (!userId) {
        return false
    }

    return getDeveloperUserIds().has(userId)
}

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
