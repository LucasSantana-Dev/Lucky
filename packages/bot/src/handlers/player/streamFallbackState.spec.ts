import { getStreamBridgeFallbackLabel, STREAM_BRIDGE_FALLBACK_METADATA_KEY } from './streamFallbackState'

describe('getStreamBridgeFallbackLabel', () => {
    it('returns undefined for a track without bridge metadata', () => {
        expect(getStreamBridgeFallbackLabel({})).toBeUndefined()
        expect(
            getStreamBridgeFallbackLabel({ metadata: undefined }),
        ).toBeUndefined()
        expect(
            getStreamBridgeFallbackLabel({
                metadata: { isAutoplay: true },
            }),
        ).toBeUndefined()
    })

    it('returns the label for soundcloud-full stage', () => {
        expect(
            getStreamBridgeFallbackLabel({
                metadata: {
                    [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-full',
                },
            }),
        ).toBe('SoundCloud search')
    })

    it('returns the label for soundcloud-title stage', () => {
        expect(
            getStreamBridgeFallbackLabel({
                metadata: {
                    [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-title',
                },
            }),
        ).toBe('SoundCloud title-only search')
    })

    it('returns the label for soundcloud-core stage', () => {
        expect(
            getStreamBridgeFallbackLabel({
                metadata: {
                    [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-core',
                },
            }),
        ).toBe('SoundCloud simplified-title search')
    })
})
