import { describe, beforeEach, expect, it } from '@jest/globals'
import { addVote, clearVotes, getVotes, hasVoted } from './voteSkipStore'

describe('voteSkipStore', () => {
    beforeEach(() => {
        clearVotes('guild-1')
        clearVotes('guild-2')
    })

    it('adds a vote and returns current votes', () => {
        const votes = addVote('guild-1', 'user-1')
        expect(votes.has('user-1')).toBe(true)
        expect(votes.size).toBe(1)
    })

    it('accumulates multiple votes per guild', () => {
        addVote('guild-1', 'user-1')
        const votes = addVote('guild-1', 'user-2')
        expect(votes.size).toBe(2)
    })

    it('does not mix votes across guilds', () => {
        addVote('guild-1', 'user-1')
        const votes = getVotes('guild-2')
        expect(votes.size).toBe(0)
    })

    it('hasVoted returns false before voting', () => {
        expect(hasVoted('guild-1', 'user-1')).toBe(false)
    })

    it('hasVoted returns true after voting', () => {
        addVote('guild-1', 'user-1')
        expect(hasVoted('guild-1', 'user-1')).toBe(true)
    })

    it('clearVotes removes all votes for a guild', () => {
        addVote('guild-1', 'user-1')
        addVote('guild-1', 'user-2')
        clearVotes('guild-1')
        expect(getVotes('guild-1').size).toBe(0)
        expect(hasVoted('guild-1', 'user-1')).toBe(false)
    })

    it('getVotes returns empty set for unknown guild', () => {
        expect(getVotes('unknown-guild').size).toBe(0)
    })
})
