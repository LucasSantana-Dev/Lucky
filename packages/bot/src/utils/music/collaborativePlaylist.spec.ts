import { beforeEach, describe, expect, it } from '@jest/globals'
import {
	collaborativePlaylistService,
	type CollaborativePlaylistState,
} from './collaborativePlaylist'

describe('collaborativePlaylistService', () => {
	let testCounter = 0

	beforeEach(() => {
		// Increment counter to create unique guild IDs per test
		testCounter++
	})

	function guildId(name: string): string {
		return `${name}-${testCounter}`
	}

	describe('setMode', () => {
		it('enables mode with default limit', () => {
			const state = collaborativePlaylistService.setMode(guildId('setmode'), true)

			expect(state.enabled).toBe(true)
			expect(state.perUserLimit).toBe(3) // DEFAULT_LIMIT
			expect(state.contributions).toEqual({})
		})

		it('enables mode with custom limit', () => {
			const state = collaborativePlaylistService.setMode(
				guildId('setmode'),
				true,
				5,
			)

			expect(state.enabled).toBe(true)
			expect(state.perUserLimit).toBe(5)
		})

		it('disables mode', () => {
			const id = guildId('setmode')
			collaborativePlaylistService.setMode(id, true, 5)
			const state = collaborativePlaylistService.setMode(id, false)

			expect(state.enabled).toBe(false)
			expect(state.perUserLimit).toBe(5) // Limit unchanged
		})

		it('ignores invalid limits (non-positive)', () => {
			const id = guildId('setmode')
			collaborativePlaylistService.setMode(id, true, 5)
			const state = collaborativePlaylistService.setMode(id, true, 0)

			expect(state.perUserLimit).toBe(5) // Unchanged
		})

		it('ignores invalid limits (non-finite)', () => {
			const id = guildId('setmode')
			collaborativePlaylistService.setMode(id, true, 5)
			const state = collaborativePlaylistService.setMode(id, true, Infinity)

			expect(state.perUserLimit).toBe(5) // Unchanged
		})

		it('floors fractional limits', () => {
			const state = collaborativePlaylistService.setMode(
				guildId('setmode'),
				true,
				4.9,
			)

			expect(state.perUserLimit).toBe(4)
		})

		it('updates updatedAt timestamp on mode change', () => {
			const before = Date.now()
			const state = collaborativePlaylistService.setMode(
				guildId('setmode'),
				true,
			)
			const after = Date.now()

			expect(state.updatedAt).toBeGreaterThanOrEqual(before)
			expect(state.updatedAt).toBeLessThanOrEqual(after)
		})

		it('preserves contributions when changing mode', () => {
			const id = guildId('setmode')
			collaborativePlaylistService.setMode(id, true, 3)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)

			const state = collaborativePlaylistService.setMode(id, true, 5)

			expect(state.contributions['user-1']).toBe(2)
		})
	})

	describe('getState', () => {
		it('returns default state for new guild', () => {
			const state = collaborativePlaylistService.getState(guildId('getstate'))

			expect(state).toEqual({
				enabled: false,
				perUserLimit: 3,
				contributions: {},
				updatedAt: expect.any(Number),
			})
		})

		it('returns copy of state (not reference)', () => {
			const id = guildId('getstate')
			collaborativePlaylistService.setMode(id, true)
			collaborativePlaylistService.recordContribution(id, 'user-1', 1)

			const state1 = collaborativePlaylistService.getState(id)
			state1.contributions['user-1'] = 99 // Mutate the returned object

			const state2 = collaborativePlaylistService.getState(id)

			expect(state2.contributions['user-1']).toBe(1) // Original unchanged
		})

		it('reflects recent setMode changes', () => {
			const id = guildId('getstate')
			collaborativePlaylistService.setMode(id, true, 5)
			const state = collaborativePlaylistService.getState(id)

			expect(state.enabled).toBe(true)
			expect(state.perUserLimit).toBe(5)
		})
	})

	describe('resetContributions', () => {
		it('clears all contributions', () => {
			const id = guildId('reset')
			collaborativePlaylistService.setMode(id, true)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)
			collaborativePlaylistService.recordContribution(id, 'user-2', 1)

			const state = collaborativePlaylistService.resetContributions(id)

			expect(state.contributions).toEqual({})
		})

		it('updates updatedAt timestamp', () => {
			const id = guildId('reset')
			collaborativePlaylistService.setMode(id, true)
			collaborativePlaylistService.recordContribution(id, 'user-1', 1)

			const before = Date.now()
			const state = collaborativePlaylistService.resetContributions(id)
			const after = Date.now()

			expect(state.updatedAt).toBeGreaterThanOrEqual(before)
			expect(state.updatedAt).toBeLessThanOrEqual(after)
		})

		it('preserves enabled and perUserLimit settings', () => {
			const id = guildId('reset')
			collaborativePlaylistService.setMode(id, true, 5)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)

			const state = collaborativePlaylistService.resetContributions(id)

			expect(state.enabled).toBe(true)
			expect(state.perUserLimit).toBe(5)
		})
	})

	describe('recordContribution', () => {
		it('increments user contribution by default amount (1)', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, true)

			collaborativePlaylistService.recordContribution(id, 'user-1')
			let state = collaborativePlaylistService.getState(id)
			expect(state.contributions['user-1']).toBe(1)

			collaborativePlaylistService.recordContribution(id, 'user-1')
			state = collaborativePlaylistService.getState(id)
			expect(state.contributions['user-1']).toBe(2)
		})

		it('increments by specified track count', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, true)

			collaborativePlaylistService.recordContribution(id, 'user-1', 3)
			const state = collaborativePlaylistService.getState(id)

			expect(state.contributions['user-1']).toBe(3)
		})

		it('enforces minimum increment of 1 (ignores trackCount=0)', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, true)

			collaborativePlaylistService.recordContribution(id, 'user-1', 0)
			let state = collaborativePlaylistService.getState(id)
			expect(state.contributions['user-1']).toBe(1) // Minimum

			collaborativePlaylistService.recordContribution(id, 'user-1', 0)
			state = collaborativePlaylistService.getState(id)
			expect(state.contributions['user-1']).toBe(2)
		})

		it('does not record contribution when mode is disabled', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, false)

			collaborativePlaylistService.recordContribution(id, 'user-1', 2)
			const state = collaborativePlaylistService.getState(id)

			expect(state.contributions['user-1']).toBeUndefined()
		})

		it('tracks multiple users independently', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, true)

			collaborativePlaylistService.recordContribution(id, 'user-1', 2)
			collaborativePlaylistService.recordContribution(id, 'user-2', 3)

			const state = collaborativePlaylistService.getState(id)

			expect(state.contributions['user-1']).toBe(2)
			expect(state.contributions['user-2']).toBe(3)
		})

		it('updates updatedAt timestamp on contribution', () => {
			const id = guildId('record')
			collaborativePlaylistService.setMode(id, true)

			const before = Date.now()
			collaborativePlaylistService.recordContribution(id, 'user-1', 1)
			const after = Date.now()

			const state = collaborativePlaylistService.getState(id)
			expect(state.updatedAt).toBeGreaterThanOrEqual(before)
			expect(state.updatedAt).toBeLessThanOrEqual(after)
		})
	})

	describe('canAddTracks', () => {
		it('allows all tracks when mode disabled', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, false)
			collaborativePlaylistService.recordContribution(id, 'user-1', 100)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1', 1)

			expect(check.allowed).toBe(true)
			expect(check.remaining).toBe(Number.POSITIVE_INFINITY)
		})

		it('allows tracks under limit', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 5)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1', 2)

			expect(check.allowed).toBe(true)
			expect(check.used).toBe(2)
			expect(check.remaining).toBe(3)
			expect(check.limit).toBe(5)
		})

		it('rejects when exactly at limit', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 3)
			collaborativePlaylistService.recordContribution(id, 'user-1', 3)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1', 1)

			expect(check.allowed).toBe(false)
			expect(check.used).toBe(3)
			expect(check.remaining).toBe(0)
		})

		it('rejects when exceeding limit', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 3)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1', 2)

			expect(check.allowed).toBe(false)
			expect(check.used).toBe(2)
			expect(check.remaining).toBe(1)
		})

		it('returns zero remaining when used matches limit', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 1)
			collaborativePlaylistService.recordContribution(id, 'user-1', 1)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1')

			expect(check.remaining).toBe(0)
		})

		it('treats missing user as zero contribution', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 3)

			const check = collaborativePlaylistService.canAddTracks(
				id,
				'never-contributed-user',
				2,
			)

			expect(check.allowed).toBe(true)
			expect(check.used).toBe(0)
			expect(check.remaining).toBe(3)
		})

		it('uses default track count of 1', () => {
			const id = guildId('canadd')
			collaborativePlaylistService.setMode(id, true, 3)
			collaborativePlaylistService.recordContribution(id, 'user-1', 2)

			const check = collaborativePlaylistService.canAddTracks(id, 'user-1')

			expect(check.allowed).toBe(true)
			expect(check.used).toBe(2)
			expect(check.remaining).toBe(1)
		})
	})

	describe('edge cases', () => {
		it('handles empty contributions map', () => {
			const id = guildId('edge')
			collaborativePlaylistService.setMode(id, true)

			const state = collaborativePlaylistService.getState(id)

			expect(state.contributions).toEqual({})
			const check = collaborativePlaylistService.canAddTracks(id, 'user-1')
			expect(check.allowed).toBe(true)
		})

		it('isolates guild states', () => {
			const id1 = guildId('isolation-1')
			const id2 = guildId('isolation-2')
			collaborativePlaylistService.setMode(id1, true, 5)
			collaborativePlaylistService.setMode(id2, true, 2)
			collaborativePlaylistService.recordContribution(id1, 'user-1', 3)

			const check1 = collaborativePlaylistService.canAddTracks(id1, 'user-1')
			const check2 = collaborativePlaylistService.canAddTracks(id2, 'user-1')

			expect(check1.remaining).toBe(2) // limit 5 - 3 used
			expect(check2.remaining).toBe(2) // limit 2 - 0 used
		})

		it('handles large track counts', () => {
			const id = guildId('large')
			collaborativePlaylistService.setMode(id, true, 100)

			collaborativePlaylistService.recordContribution(id, 'user-1', 50)
			let check = collaborativePlaylistService.canAddTracks(id, 'user-1', 30)
			expect(check.allowed).toBe(true)

			collaborativePlaylistService.recordContribution(id, 'user-1', 30)
			check = collaborativePlaylistService.canAddTracks(id, 'user-1', 21)
			expect(check.allowed).toBe(false)
		})
	})
})
