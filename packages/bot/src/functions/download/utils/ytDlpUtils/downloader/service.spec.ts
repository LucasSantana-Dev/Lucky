import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { YtDlpOptions } from './types.js'

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('./pathManager.js', () => {
    const configMock = {
        executablePath: 'yt-dlp',
        outputDir: './downloads',
        maxConcurrent: 3,
        timeout: 300000,
    }
    return {
        YtDlpPathManager: {
            getConfig: jest.fn(() => configMock),
        },
    }
})

jest.mock('fs/promises', () => ({
    unlink: jest.fn().mockResolvedValue(undefined),
}))

const spawnMock = jest.fn()

jest.mock('child_process', () => ({
    spawn: spawnMock,
}))

// Import after mocks
import { YtDlpDownloaderService } from './service.js'

describe('YtDlpDownloaderService', () => {
    let service: YtDlpDownloaderService

    beforeEach(() => {
        spawnMock.mockClear()
        // Setup default spawn mock behavior
        spawnMock.mockImplementation(() => {
            const EventEmitter = require('events').EventEmitter
            const proc = new EventEmitter()
            proc.stdout = new EventEmitter()
            proc.stderr = new EventEmitter()
            proc.kill = jest.fn()
            // Simulate successful process exit with proper output format
            setImmediate(() => {
                proc.stdout.emit(
                    'data',
                    '[download] /downloads/video.mp3 has already been downloaded',
                )
                proc.emit('close', 0)
            })
            return proc
        })
        debugLogMock.mockClear()
        service = new YtDlpDownloaderService()
    })

    describe('downloadVideo', () => {
        it('returns result object with success property', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                { format: 'audio' },
            )

            expect(result).toHaveProperty('success')
            expect(typeof result.success).toBe('boolean')
        })

        it('returns failure result on process error', async () => {
            // Override spawn mock to emit error
            spawnMock.mockImplementationOnce(() => {
                const EventEmitter = require('events').EventEmitter
                const proc = new EventEmitter()
                proc.stdout = new EventEmitter()
                proc.stderr = new EventEmitter()
                proc.kill = jest.fn()
                // Emit error after a tick
                setImmediate(() => {
                    proc.emit('error', new Error('Process error'))
                })
                return proc
            })

            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                { format: 'audio' },
            )

            expect(result.success).toBe(false)
            expect(result).toHaveProperty('error')
        })

        it('accepts video format option', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                {
                    format: 'video',
                },
            )

            expect(result.success).toBeDefined()
        })

        it('accepts audio format option', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                {
                    format: 'audio',
                },
            )

            expect(result.success).toBeDefined()
        })

        it('accepts custom output path', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                {
                    format: 'audio',
                    outputPath: '/custom/path.mp3',
                },
            )

            expect(result.success).toBeDefined()
        })

        it('accepts quality option', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                {
                    format: 'audio',
                    quality: 'best',
                },
            )

            expect(result.success).toBeDefined()
        })

        it('accepts maxDuration option', async () => {
            const result = await service.downloadVideo(
                'https://youtube.com/watch?v=abc123',
                {
                    format: 'audio',
                    maxDuration: 3600,
                },
            )

            expect(result.success).toBeDefined()
        })
    })

    describe('cleanupFile', () => {
        it('handles cleanup errors gracefully', async () => {
            const { unlink } = await import('fs/promises')
            ;(unlink as jest.Mock).mockRejectedValue(new Error('ENOENT'))

            await expect(
                service.cleanupFile('/downloads/missing.mp3'),
            ).resolves.not.toThrow()

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Error cleaning up'),
                }),
            )
        })
    })
})
