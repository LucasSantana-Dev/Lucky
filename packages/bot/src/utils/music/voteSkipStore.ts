import { assertDefined } from '@lucky/shared/utils/guards'

const activeVotes = new Map<string, Set<string>>()

export function addVote(guildId: string, userId: string): Set<string> {
    if (!activeVotes.has(guildId)) {
        activeVotes.set(guildId, new Set())
    }
    const votes = assertDefined(activeVotes.get(guildId), 'Set present after .has() and .set() guards')
    votes.add(userId)
    return votes
}

export function clearVotes(guildId: string): void {
    activeVotes.delete(guildId)
}

export function getVotes(guildId: string): Set<string> {
    return activeVotes.get(guildId) ?? new Set()
}

export function hasVoted(guildId: string, userId: string): boolean {
    return activeVotes.get(guildId)?.has(userId) ?? false
}
