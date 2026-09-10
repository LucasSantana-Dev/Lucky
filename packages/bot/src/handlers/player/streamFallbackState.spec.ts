import {
    getStreamBridgeFallbackLabel,
    stampFallbackStage,
    STREAM_BRIDGE_FALLBACK_METADATA_KEY,
} from './streamFallbackState'

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

describe('stampFallbackStage', () => {
    it('stamps the fallback stage on a track with no existing metadata', () => {
        let metadata: unknown = undefined
        const track = {
            title: 'Test Track',
            author: 'Test Artist',
            duration: '3:30',
            url: 'https://example.com/track',
            get metadata() {
                return metadata
            },
            setMetadata(m: unknown) {
                metadata = m
            },
        }

        stampFallbackStage(track, 'soundcloud-full')

        expect(metadata).toEqual({
            [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-full',
        })
    })

    it('preserves existing metadata when stamping the fallback stage', () => {
        let metadata: unknown = { isAutoplay: true, customData: 'preserved' }
        const track = {
            title: 'Test Track',
            author: 'Test Artist',
            duration: '3:30',
            url: 'https://example.com/track',
            get metadata() {
                return metadata
            },
            setMetadata(m: unknown) {
                metadata = m
            },
        }

        stampFallbackStage(track, 'soundcloud-title')

        expect(metadata).toEqual({
            isAutoplay: true,
            customData: 'preserved',
            [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-title',
        })
    })

    it('overwrites existing fallback stage key when re-stamping', () => {
        let metadata: unknown = {
            isAutoplay: true,
            [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-full',
        }
        const track = {
            title: 'Test Track',
            author: 'Test Artist',
            duration: '3:30',
            url: 'https://example.com/track',
            get metadata() {
                return metadata
            },
            setMetadata(m: unknown) {
                metadata = m
            },
        }

        stampFallbackStage(track, 'soundcloud-core')

        expect(metadata).toEqual({
            isAutoplay: true,
            [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-core',
        })
    })
})
