import type { ScopeConfig } from './types.js'

/**
 * Pure function to determine if a message matches a given scope.
 * Evaluates all 5 scope types: all, count, user, date_range, contains.
 * Date range is inclusive on both ends. Contains is case-insensitive.
 */
export function matchesScope(
    message: {
        id: string
        authorId?: string
        content?: string
        createdAt?: Date
        index?: number // 0-based position for 'count' scope
    },
    scope: ScopeConfig,
): boolean {
    switch (scope.type) {
        case 'all':
            return true

        case 'count': {
            const count = scope.config.count ?? 0
            const index = message.index
            if (index === undefined) return false
            return index < count
        }

        case 'user': {
            const userId = scope.config.userId
            if (!userId) return false
            return message.authorId === userId
        }

        case 'date_range': {
            const start = scope.config.dateRangeStart
            const end = scope.config.dateRangeEnd
            const msgDate = message.createdAt

            if (!msgDate) return false

            const startMatch = !start || msgDate >= start
            const endMatch = !end || msgDate <= end
            return startMatch && endMatch
        }

        case 'contains': {
            const searchText = scope.config.searchText
            if (!searchText) return false
            const content = message.content ?? ''
            return content.toLowerCase().includes(searchText.toLowerCase())
        }

        default:
            // Exhaustive check — TypeScript will error if new cases are added
            const _exhaustive: never = scope.type
            return _exhaustive
    }
}
