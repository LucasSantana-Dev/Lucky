import { describe, expect, it } from '@jest/globals'
import { matchesScope } from './ScopeResolver'
import type { ScopeConfig } from './types'

describe('ScopeResolver', () => {
    describe('matchesScope - all type', () => {
        it('returns true for any message with "all" scope', () => {
            const scope: ScopeConfig = { type: 'all', config: {} }
            const msg = { id: 'msg-1', content: 'hello' }

            expect(matchesScope(msg, scope)).toBe(true)
        })

        it('returns true even with empty message data', () => {
            const scope: ScopeConfig = { type: 'all', config: {} }
            const msg = { id: 'msg-1' }

            expect(matchesScope(msg, scope)).toBe(true)
        })
    })

    describe('matchesScope - count type', () => {
        it('matches messages within the count limit', () => {
            const scope: ScopeConfig = { type: 'count', config: { count: 5 } }

            expect(matchesScope({ id: 'msg-1', index: 0 }, scope)).toBe(true)
            expect(matchesScope({ id: 'msg-2', index: 4 }, scope)).toBe(true)
            expect(matchesScope({ id: 'msg-3', index: 5 }, scope)).toBe(false)
        })

        it('defaults to 0 count if not provided', () => {
            const scope: ScopeConfig = { type: 'count', config: {} }

            expect(matchesScope({ id: 'msg-1', index: 0 }, scope)).toBe(false)
        })

        it('handles missing index property', () => {
            const scope: ScopeConfig = { type: 'count', config: { count: 1 } }
            const msg = { id: 'msg-1' }

            expect(matchesScope(msg, scope)).toBe(false)
        })
    })

    describe('matchesScope - user type', () => {
        it('matches messages from the specified user', () => {
            const scope: ScopeConfig = {
                type: 'user',
                config: { userId: 'user-123' },
            }

            expect(
                matchesScope({ id: 'msg-1', authorId: 'user-123' }, scope),
            ).toBe(true)
            expect(
                matchesScope({ id: 'msg-2', authorId: 'user-456' }, scope),
            ).toBe(false)
        })

        it('returns false if userId is not provided', () => {
            const scope: ScopeConfig = { type: 'user', config: {} }
            const msg = { id: 'msg-1', authorId: 'user-123' }

            expect(matchesScope(msg, scope)).toBe(false)
        })

        it('returns false if message has no authorId', () => {
            const scope: ScopeConfig = {
                type: 'user',
                config: { userId: 'user-123' },
            }
            const msg = { id: 'msg-1' }

            expect(matchesScope(msg, scope)).toBe(false)
        })
    })

    describe('matchesScope - date_range type', () => {
        const startDate = new Date('2026-06-01T00:00:00Z')
        const endDate = new Date('2026-06-30T23:59:59Z')

        it('matches messages within the date range (inclusive)', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeStart: startDate, dateRangeEnd: endDate },
            }

            expect(
                matchesScope(
                    {
                        id: 'msg-1',
                        createdAt: new Date('2026-06-15T12:00:00Z'),
                    },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    {
                        id: 'msg-2',
                        createdAt: new Date('2026-06-01T00:00:00Z'),
                    },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    {
                        id: 'msg-3',
                        createdAt: new Date('2026-06-30T23:59:59Z'),
                    },
                    scope,
                ),
            ).toBe(true)
        })

        it('rejects messages outside the date range', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeStart: startDate, dateRangeEnd: endDate },
            }

            expect(
                matchesScope(
                    {
                        id: 'msg-1',
                        createdAt: new Date('2026-05-31T23:59:59Z'),
                    },
                    scope,
                ),
            ).toBe(false)
            expect(
                matchesScope(
                    {
                        id: 'msg-2',
                        createdAt: new Date('2026-07-01T00:00:00Z'),
                    },
                    scope,
                ),
            ).toBe(false)
        })

        it('matches with only start date', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeStart: startDate },
            }

            expect(
                matchesScope(
                    {
                        id: 'msg-1',
                        createdAt: new Date('2026-06-01T00:00:00Z'),
                    },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    {
                        id: 'msg-2',
                        createdAt: new Date('2026-05-31T23:59:59Z'),
                    },
                    scope,
                ),
            ).toBe(false)
        })

        it('matches with only end date', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeEnd: endDate },
            }

            expect(
                matchesScope(
                    {
                        id: 'msg-1',
                        createdAt: new Date('2026-06-30T23:59:59Z'),
                    },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    {
                        id: 'msg-2',
                        createdAt: new Date('2026-07-01T00:00:00Z'),
                    },
                    scope,
                ),
            ).toBe(false)
        })

        it('returns false if message has no createdAt', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeStart: startDate, dateRangeEnd: endDate },
            }
            const msg = { id: 'msg-1' }

            expect(matchesScope(msg, scope)).toBe(false)
        })

        it('matches with only an end date set (open-ended start)', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeEnd: new Date('2026-06-30T23:59:59Z') },
            }
            expect(
                matchesScope(
                    { id: 'a', createdAt: new Date('2000-01-01') },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    { id: 'b', createdAt: new Date('2026-07-05') },
                    scope,
                ),
            ).toBe(false)
        })

        it('matches with only a start date set (open-ended end)', () => {
            const scope: ScopeConfig = {
                type: 'date_range',
                config: { dateRangeStart: new Date('2026-06-01T00:00:00Z') },
            }
            expect(
                matchesScope(
                    { id: 'a', createdAt: new Date('2030-01-01') },
                    scope,
                ),
            ).toBe(true)
            expect(
                matchesScope(
                    { id: 'b', createdAt: new Date('2026-05-01') },
                    scope,
                ),
            ).toBe(false)
        })
    })

    describe('matchesScope - contains type', () => {
        it('matches messages containing the search text (case-insensitive)', () => {
            const scope: ScopeConfig = {
                type: 'contains',
                config: { searchText: 'hello' },
            }

            expect(
                matchesScope({ id: 'msg-1', content: 'hello world' }, scope),
            ).toBe(true)
            expect(
                matchesScope({ id: 'msg-2', content: 'HELLO WORLD' }, scope),
            ).toBe(true)
            expect(matchesScope({ id: 'msg-3', content: 'HeLLo' }, scope)).toBe(
                true,
            )
            expect(
                matchesScope({ id: 'msg-4', content: 'goodbye' }, scope),
            ).toBe(false)
        })

        it('searches within the content substring', () => {
            const scope: ScopeConfig = {
                type: 'contains',
                config: { searchText: 'world' },
            }

            expect(
                matchesScope(
                    { id: 'msg-1', content: 'hello world foo' },
                    scope,
                ),
            ).toBe(true)
        })

        it('returns false if searchText is not provided', () => {
            const scope: ScopeConfig = { type: 'contains', config: {} }
            const msg = { id: 'msg-1', content: 'hello world' }

            expect(matchesScope(msg, scope)).toBe(false)
        })

        it('returns false if message has no content', () => {
            const scope: ScopeConfig = {
                type: 'contains',
                config: { searchText: 'hello' },
            }
            const msg = { id: 'msg-1' }

            expect(matchesScope(msg, scope)).toBe(false)
        })

        it('handles empty content as falsy', () => {
            const scope: ScopeConfig = {
                type: 'contains',
                config: { searchText: 'hello' },
            }
            const msg = { id: 'msg-1', content: '' }

            expect(matchesScope(msg, scope)).toBe(false)
        })
    })
})
