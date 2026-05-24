import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DownloadProcessor } from './processor.js'
import type { DownloadOptions } from './types.js'

const downloadVideoMock = jest.fn()
const deleteDownloadedFileMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const successLogMock = jest.fn()

jest.mock('../../utils/downloadUtils.js', () => ({
    downloadVideo: (...args: unknown[]) => downloadVideoMock(...args),
    deleteDownloadedFile: (...args: unknown[]) =>
        deleteDownloadedFileMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    successLog: (...args: unknown[]) => successLogMock(...args),
}))

jest.mock('../../../../utils/download/downloadHelpers.js', () => ({
    formatDuration: (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    },
}))

describe('DownloadProcessor', () => {
    let processor: DownloadProcessor

    beforeEach(() => {
        jest.clearAllMocks()
        processor = new DownloadProcessor()
        downloadVideoMock.mockResolvedValue({
            success: true,
            filePath: '/downloads/video_12345.mp4',
        })
    })

    describe('processDownload', () => {
        it('processes successful audio download', async () => {
            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await processor.processDownload(options)

            expect(result.success).toBe(true)
            expect(result.filePath).toBe('/downloads/video_12345.mp4')
            expect(downloadVideoMock).toHaveBeenCalledWith(
                'https://youtube.com/watch?v=abc123',
                'audio',
            )
        })

        it('processes successful video download', async () => {
            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=xyz789',
                format: 'video',
            }

            const result = await processor.processDownload(options)

            expect(result.success).toBe(true)
            expect(downloadVideoMock).toHaveBeenCalledWith(
                'https://youtube.com/watch?v=xyz789',
                'video',
            )
        })

        it('extracts filename from filepath', async () => {
            downloadVideoMock.mockResolvedValue({
                success: true,
                filePath: '/downloads/my_video_12345.mp4',
            })

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await processor.processDownload(options)

            expect(result.fileName).toBe('my_video_12345.mp4')
        })

        it('returns download error when download fails', async () => {
            downloadVideoMock.mockResolvedValue({
                success: false,
                error: 'Connection timeout',
            })

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=bad',
                format: 'audio',
            }

            const result = await processor.processDownload(options)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Connection timeout')
        })

        it('handles download exceptions gracefully', async () => {
            downloadVideoMock.mockRejectedValue(new Error('Network error'))

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await processor.processDownload(options)

            expect(result.success).toBe(false)
            expect(result.error).toContain('Network error')
        })
    })

    describe('cleanupDownload', () => {
        it('handles cleanup errors gracefully', async () => {
            deleteDownloadedFileMock.mockRejectedValue(
                new Error('File not found'),
            )

            await processor.cleanupDownload('/downloads/missing.mp4')

            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('formatFileSize', () => {
        it('formats 0 bytes', () => {
            expect(processor.formatFileSize(0)).toBe('0 Bytes')
        })

        it('formats bytes', () => {
            expect(processor.formatFileSize(512)).toContain('Bytes')
        })

        it('formats kilobytes', () => {
            const kb = 1024 * 5
            expect(processor.formatFileSize(kb)).toContain('KB')
        })

        it('formats megabytes', () => {
            const mb = 1024 * 1024 * 25
            const result = processor.formatFileSize(mb)
            expect(result).toContain('MB')
            expect(result).toContain('25')
        })

        it('formats gigabytes', () => {
            const gb = 1024 * 1024 * 1024 * 2
            const result = processor.formatFileSize(gb)
            expect(result).toContain('GB')
        })
    })

    describe('formatDuration', () => {
        it('formats duration as MM:SS', () => {
            expect(processor.formatDuration(65)).toBe('1:05')
        })

        it('formats zero seconds', () => {
            expect(processor.formatDuration(0)).toBe('0:00')
        })

        it('formats hours', () => {
            expect(processor.formatDuration(3665)).toContain(':')
        })
    })
})
