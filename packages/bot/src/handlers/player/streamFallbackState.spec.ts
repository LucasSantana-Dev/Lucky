import {
    clearBridgeStamps,
    getStreamBridgeFallbackLabel,
    getStreamBridgeSource,
    stampBridgeSource,
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

describe('bridge source stamp', () => {
    function trackWith(metadata: unknown) {
        const track = {
            metadata,
            setMetadata: jest.fn((m: unknown) => {
                track.metadata = m
            }),
        }
        return track
    }

    it('stamps youtubei-native, keeping existing metadata', () => {
        const track = trackWith({ isAutoplay: true })
        stampBridgeSource(track as never, 'youtubei-native')
        expect(getStreamBridgeSource(track)).toBe('youtubei-native')
        expect(track.metadata).toMatchObject({ isAutoplay: true })
    })

    it('reads nothing from an unstamped track', () => {
        expect(getStreamBridgeSource({})).toBeUndefined()
        expect(getStreamBridgeSource({ metadata: null })).toBeUndefined()
    })

    it('clears both bridge stamps and keeps the rest', () => {
        const track = trackWith({
            isAutoplay: true,
            [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: 'soundcloud-full',
            streamBridgeSource: 'youtubei-native',
        })
        clearBridgeStamps(track as never)
        expect(track.metadata).toEqual({ isAutoplay: true })
    })

    it('does not touch metadata without stamps', () => {
        const track = trackWith({ isAutoplay: true })
        clearBridgeStamps(track as never)
        clearBridgeStamps(trackWith(null) as never)
        expect(track.setMetadata).not.toHaveBeenCalled()
    })
})
