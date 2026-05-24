import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { DownloadOptions } from './types.js'

const isSupportedPlatformUrlMock = jest.fn((url: string) => {
	return /youtube\.com|youtu\.be|soundcloud\.com/.test(url)
})

const getPlatformFromUrlMock = jest.fn((url: string) => {
	if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube'
	if (url.includes('soundcloud')) return 'soundcloud'
	return 'unknown'
})

jest.mock('../../../../utils/download/downloadHelpers.js', () => ({
	isSupportedPlatformUrl: isSupportedPlatformUrlMock,
	getPlatformFromUrl: getPlatformFromUrlMock,
	createErrorEmbed: jest.fn((title: string, error: string) => ({
		title,
		description: error,
	})),
	formatDuration: jest.fn((seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}),
}))

// Import after mocks
import { DownloadValidator } from './validator.js'

describe('DownloadValidator', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		isSupportedPlatformUrlMock.mockImplementation((url: string) => {
			return /youtube\.com|youtu\.be|soundcloud\.com/.test(url)
		})
		getPlatformFromUrlMock.mockImplementation((url: string) => {
			if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube'
			if (url.includes('soundcloud')) return 'soundcloud'
			return 'unknown'
		})
	})

	describe('validateUrl', () => {
		it('rejects empty URLs', () => {
			const result = DownloadValidator.validateUrl('')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('Invalid URL')
		})

		it('rejects non-string URLs', () => {
			const result = DownloadValidator.validateUrl(null as unknown as string)
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('Invalid URL')
		})

		it('rejects unsupported platform URLs', () => {
			const result = DownloadValidator.validateUrl('https://example.com/video')
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('Unsupported platform')
		})

		it('accepts YouTube URLs', () => {
			const result = DownloadValidator.validateUrl('https://youtube.com/watch?v=abc123')
			expect(result.isValid).toBe(true)
			expect(result.platform).toBe('youtube')
		})

		it('accepts youtu.be short URLs', () => {
			const result = DownloadValidator.validateUrl('https://youtu.be/abc123')
			expect(result.isValid).toBe(true)
			expect(result.platform).toBe('youtube')
		})

		it('accepts SoundCloud URLs', () => {
			const result = DownloadValidator.validateUrl('https://soundcloud.com/user/track')
			expect(result.isValid).toBe(true)
			expect(result.platform).toBe('soundcloud')
		})
	})

	describe('validateDownload', () => {
		const validOptions: DownloadOptions = {
			url: 'https://youtube.com/watch?v=abc123',
			format: 'audio',
		}

		it('validates complete download options', async () => {
			const result = await DownloadValidator.prototype.validateDownload.call(
				new DownloadValidator(),
				validOptions,
			)
			expect(result.isValid).toBe(true)
		})

		it('rejects invalid URL in download options', async () => {
			const options: DownloadOptions = {
				...validOptions,
				url: 'https://example.com/invalid',
			}
			const result = await DownloadValidator.prototype.validateDownload.call(
				new DownloadValidator(),
				options,
			)
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('Unsupported')
		})

		it('rejects invalid format', async () => {
			const options: DownloadOptions = {
				...validOptions,
				format: 'invalid' as 'audio' | 'video',
			}
			const result = await DownloadValidator.prototype.validateDownload.call(
				new DownloadValidator(),
				options,
			)
			expect(result.isValid).toBe(false)
			expect(result.error).toContain('Invalid format')
		})
	})

	describe('validateFormat', () => {
		it.each([
			['audio', true],
			['video', true],
			['invalid', false],
			['AUDIO', false],
			['Audio', false],
		])('returns %s for format "%s"', (format, expected) => {
			expect(DownloadValidator.validateFormat(format)).toBe(expected)
		})
	})

	describe('validateQuality', () => {
		it.each([
			['low', true],
			['medium', true],
			['high', true],
			['best', true],
			['LOW', true],
			['Best', true],
			['ultra', false],
		])('validates quality "%s" as %s', (quality, expected) => {
			expect(DownloadValidator.validateQuality(quality)).toBe(expected)
		})
	})

	describe('validateDuration', () => {
		it.each([
			[3600, undefined, true],
			[1800, 3600, true],
			[3600, 1800, false],
			[3600, 3600, true],
			[99999, 0, true],
			[99999, -1, true],
		])('validates duration %s with max %s as %s', (duration, maxDuration, expected) => {
			expect(DownloadValidator.validateDuration(duration, maxDuration)).toBe(expected)
		})
	})

	describe('validateFileSize', () => {
		const MB = 1024 * 1024

		it.each([
			[100 * MB, undefined, true],
			[20 * MB, 50 * MB, true],
			[100 * MB, 50 * MB, false],
			[50 * MB, 50 * MB, true],
			[20 * MB, 25 * MB, true],
			[26 * MB, 25 * MB, false],
			[400 * MB, 500 * MB, true],
			[501 * MB, 500 * MB, false],
		])('validates file size %s with max %s as %s', (fileSize, maxFileSize, expected) => {
			expect(DownloadValidator.validateFileSize(fileSize, maxFileSize)).toBe(expected)
		})
	})

	describe('getPlatformInfo', () => {
		it('returns YouTube platform info', () => {
			const info = DownloadValidator.getPlatformInfo('youtube')
			expect(info.name).toBe('YouTube')
			expect(info.supported).toBe(true)
			expect(info.maxDuration).toBe(3600)
			expect(info.maxFileSize).toBe(100 * 1024 * 1024)
		})

		it('returns SoundCloud platform info', () => {
			const info = DownloadValidator.getPlatformInfo('soundcloud')
			expect(info.name).toBe('SoundCloud')
			expect(info.supported).toBe(true)
			expect(info.maxDuration).toBe(1800)
			expect(info.maxFileSize).toBe(50 * 1024 * 1024)
		})

		it('returns default unsupported info for unknown platform', () => {
			const info = DownloadValidator.getPlatformInfo('unknown')
			expect(info.supported).toBe(false)
			expect(info.name).toBe('Unknown')
		})
	})
})
