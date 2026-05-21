import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { DownloadOptions } from './types.js'

const isSupportedPlatformUrlMock = jest.fn((url: string) => {
	return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('soundcloud.com')
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
			return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('soundcloud.com')
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
		it('accepts audio format', () => {
			expect(DownloadValidator.validateFormat('audio')).toBe(true)
		})

		it('accepts video format', () => {
			expect(DownloadValidator.validateFormat('video')).toBe(true)
		})

		it('rejects invalid format', () => {
			expect(DownloadValidator.validateFormat('invalid')).toBe(false)
		})

		it('is case-sensitive', () => {
			expect(DownloadValidator.validateFormat('AUDIO')).toBe(false)
			expect(DownloadValidator.validateFormat('Audio')).toBe(false)
		})
	})

	describe('validateQuality', () => {
		it('accepts low quality', () => {
			expect(DownloadValidator.validateQuality('low')).toBe(true)
		})

		it('accepts medium quality', () => {
			expect(DownloadValidator.validateQuality('medium')).toBe(true)
		})

		it('accepts high quality', () => {
			expect(DownloadValidator.validateQuality('high')).toBe(true)
		})

		it('accepts best quality', () => {
			expect(DownloadValidator.validateQuality('best')).toBe(true)
		})

		it('is case-insensitive', () => {
			expect(DownloadValidator.validateQuality('LOW')).toBe(true)
			expect(DownloadValidator.validateQuality('Best')).toBe(true)
		})

		it('rejects invalid quality', () => {
			expect(DownloadValidator.validateQuality('ultra')).toBe(false)
		})
	})

	describe('validateDuration', () => {
		it('accepts duration when maxDuration is undefined', () => {
			expect(DownloadValidator.validateDuration(3600)).toBe(true)
		})

		it('accepts duration within limit', () => {
			expect(DownloadValidator.validateDuration(1800, 3600)).toBe(true)
		})

		it('rejects duration exceeding limit', () => {
			expect(DownloadValidator.validateDuration(3600, 1800)).toBe(false)
		})

		it('accepts duration equal to limit', () => {
			expect(DownloadValidator.validateDuration(3600, 3600)).toBe(true)
		})

		it('accepts any duration when maxDuration is 0 or negative', () => {
			expect(DownloadValidator.validateDuration(99999, 0)).toBe(true)
			expect(DownloadValidator.validateDuration(99999, -1)).toBe(true)
		})
	})

	describe('validateFileSize', () => {
		const MB = 1024 * 1024

		it('accepts file size when maxFileSize is undefined', () => {
			expect(DownloadValidator.validateFileSize(100 * MB)).toBe(true)
		})

		it('accepts file size within limit', () => {
			expect(DownloadValidator.validateFileSize(20 * MB, 50 * MB)).toBe(true)
		})

		it('rejects file size exceeding limit', () => {
			expect(DownloadValidator.validateFileSize(100 * MB, 50 * MB)).toBe(false)
		})

		it('accepts file size equal to limit', () => {
			expect(DownloadValidator.validateFileSize(50 * MB, 50 * MB)).toBe(true)
		})

		it('enforces Discord 25MB free user limit', () => {
			const discordFreeLimitBytes = 25 * MB
			expect(DownloadValidator.validateFileSize(20 * MB, discordFreeLimitBytes)).toBe(true)
			expect(DownloadValidator.validateFileSize(26 * MB, discordFreeLimitBytes)).toBe(false)
		})

		it('enforces Discord 500MB Nitro limit', () => {
			const discordNitroLimitBytes = 500 * MB
			expect(DownloadValidator.validateFileSize(400 * MB, discordNitroLimitBytes)).toBe(true)
			expect(DownloadValidator.validateFileSize(501 * MB, discordNitroLimitBytes)).toBe(false)
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
