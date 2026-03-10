import { describe, expect, it } from '@jest/globals'
import { collaborativePlaylistService } from './collaborativePlaylist'

describe('collaborativePlaylistService', () => {
    it('enforces per-user limits when collaborative mode is enabled', () => {
        collaborativePlaylistService.setMode('guild-1', true, 2)
        collaborativePlaylistService.resetContributions('guild-1')

        const first = collaborativePlaylistService.canAddTracks(
            'guild-1',
            'user-1',
            1,
        )
        expect(first.allowed).toBe(true)

        collaborativePlaylistService.recordContribution('guild-1', 'user-1', 1)
        const second = collaborativePlaylistService.canAddTracks(
            'guild-1',
            'user-1',
            2,
        )
        expect(second.allowed).toBe(false)
    })

    it('always allows additions when collaborative mode is disabled', () => {
        collaborativePlaylistService.setMode('guild-2', false, 1)
        collaborativePlaylistService.resetContributions('guild-2')
        collaborativePlaylistService.recordContribution('guild-2', 'user-2', 4)

        const result = collaborativePlaylistService.canAddTracks(
            'guild-2',
            'user-2',
            4,
        )
        expect(result.allowed).toBe(true)
    })
})
