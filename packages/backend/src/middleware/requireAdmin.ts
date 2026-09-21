import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth'

let developerUserIds: Set<string> | null = null
let cachedEnvValue: string | undefined = undefined

function getDeveloperUserIds(): Set<string> {
    const currentEnv = process.env.DEVELOPER_USER_IDS
    if (cachedEnvValue !== currentEnv) {
        developerUserIds = null
        cachedEnvValue = currentEnv
    }

    if (developerUserIds === null) {
        developerUserIds = new Set(
            (currentEnv ?? '')
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
        )
    }
    return developerUserIds
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
