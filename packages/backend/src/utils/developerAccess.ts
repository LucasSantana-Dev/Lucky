import { AppError } from '../errors/AppError'

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

export function requireDeveloperUser(userId?: string): void {
    if (!isDeveloperUser(userId)) {
        throw AppError.forbidden('Developer access required')
    }
}
