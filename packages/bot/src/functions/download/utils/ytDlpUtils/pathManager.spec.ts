import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('fs', () => ({
	existsSync: jest.fn((path: string) => {
		return path === 'yt-dlp' || path === '/usr/bin/yt-dlp'
	}),
}))

import { YtDlpPathManager } from './pathManager.js'
import { existsSync } from 'fs'

describe('YtDlpPathManager', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		delete process.env.DOWNLOAD_DIR
	})

	describe('getYtDlpPath', () => {
		it('returns yt-dlp for unix-like systems when available', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config.executablePath).toBe('yt-dlp')
		})

		it('returns executable path from config', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config.executablePath).toBeDefined()
			expect(typeof config.executablePath).toBe('string')
		})
	})

	describe('getConfig', () => {
		it('returns config object with required properties', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config).toEqual({
				executablePath: expect.any(String),
				outputDir: expect.any(String),
				maxConcurrent: 3,
				timeout: 300000,
			})
		})

		it('uses DOWNLOAD_DIR env var when set', () => {
			process.env.DOWNLOAD_DIR = '/custom/downloads'
			const config = YtDlpPathManager.getConfig()
			expect(config.outputDir).toBe('/custom/downloads')
		})

		it('uses default download folder when DOWNLOAD_DIR not set', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config.outputDir).toBe('./downloads')
		})

		it('sets timeout to 5 minutes', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config.timeout).toBe(300000)
		})

		it('sets maxConcurrent to 3', () => {
			const config = YtDlpPathManager.getConfig()
			expect(config.maxConcurrent).toBe(3)
		})
	})

	describe('validatePath', () => {
		it('checks if executable path exists', () => {
			;(existsSync as jest.Mock).mockReturnValue(true)
			const isValid = YtDlpPathManager.validatePath()
			expect(isValid).toBe(true)
			expect(existsSync).toHaveBeenCalled()
		})

		it('returns false when path does not exist', () => {
			;(existsSync as jest.Mock).mockReturnValue(false)
			const isValid = YtDlpPathManager.validatePath()
			expect(isValid).toBe(false)
		})
	})

	describe('getOutputPath', () => {
		it('returns combined output directory and filename', () => {
			const outputPath = YtDlpPathManager.getOutputPath('video.mp4')
			expect(outputPath).toContain('video.mp4')
			expect(outputPath).toMatch(/downloads|downloads\/video\.mp4/)
		})

		it('includes custom download directory when set', () => {
			process.env.DOWNLOAD_DIR = '/tmp/custom'
			const outputPath = YtDlpPathManager.getOutputPath('test.mp3')
			expect(outputPath).toContain('test.mp3')
		})
	})
})
