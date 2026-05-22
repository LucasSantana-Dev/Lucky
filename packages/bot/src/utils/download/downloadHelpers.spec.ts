import { describe, it, expect } from '@jest/globals'
import {
	createErrorEmbed,
	formatDuration,
	getPlatformFromUrl,
	isSupportedPlatformUrl,
} from './downloadHelpers'

describe('isSupportedPlatformUrl', () => {
	it.each([
		['https://youtube.com/watch?v=abc', true],
		['https://www.youtube.com/watch?v=abc', true],
		['https://youtu.be/abc', true],
		['https://soundcloud.com/artist/track', true],
		['https://www.bandcamp.com/album/x', true],
		['https://open.spotify.com/track/abc', true],
		['https://example.com/youtube.com/fake', false],
		['https://evil.com', false],
		['not-a-url', false],
		['', false],
	])('returns %s for %s', (url, expected) => {
		expect(isSupportedPlatformUrl(url)).toBe(expected)
	})
})

describe('getPlatformFromUrl', () => {
	it.each([
		['https://www.youtube.com/watch?v=abc', 'youtube'],
		['https://youtu.be/abc', 'youtube'],
		['https://soundcloud.com/x/y', 'soundcloud'],
		['https://artist.bandcamp.com/track/x', 'bandcamp'],
		['https://open.spotify.com/track/abc', 'spotify'],
		['https://evil.com/youtube.com', 'unknown'],
		['not-a-url', 'unknown'],
	])('maps %s -> %s', (url, expected) => {
		expect(getPlatformFromUrl(url)).toBe(expected)
	})
})

describe('createErrorEmbed', () => {
	it('builds an embed object with title, description, and red color', () => {
		expect(createErrorEmbed('Title', 'Desc')).toEqual({
			title: 'Title',
			description: 'Desc',
			color: 0xff0000,
		})
	})
})

describe('formatDuration', () => {
	it.each([
		[0, '0:00'],
		[-5, '0:00'],
		[5, '0:05'],
		[60, '1:00'],
		[65, '1:05'],
		[3599, '59:59'],
	])('formats %i seconds as %s', (seconds, expected) => {
		expect(formatDuration(seconds)).toBe(expected)
	})
})
