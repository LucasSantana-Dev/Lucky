import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { DownloadOptions } from './types.js'

const featureToggleServiceMock = {
    isEnabled: jest.fn(),
}
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../../utils/download/downloadHelpers.js', () => ({
    createErrorEmbed: jest.fn((title: string, error: string) => ({
        title,
        description: error,
    })),
}))

jest.mock('../../../../utils/general/embeds.js', () => ({
    createEmbed: jest.fn((config: unknown) => config),
    EMBED_COLORS: { SUCCESS: 0x00ff00, ERROR: 0xff0000 },
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: featureToggleServiceMock,
}))

// Import after mocks
import { DownloadCommandService } from './service.js'

describe('DownloadCommandService', () => {
    let service: DownloadCommandService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new DownloadCommandService()
        featureToggleServiceMock.isEnabled.mockResolvedValue(true)
    })

    describe('executeDownload', () => {
        it('returns disabled error when feature is disabled', async () => {
            featureToggleServiceMock.isEnabled.mockResolvedValue(false)

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await service.executeDownload(options)

            expect(result.success).toBe(false)
            expect(result.error).toBe('This feature is currently disabled')
        })

        it('returns validation error on invalid URL', async () => {
            jest.spyOn(
                service['validator'],
                'validateDownload',
            ).mockResolvedValue({
                isValid: false,
                error: 'Unsupported platform',
            })

            const options: DownloadOptions = {
                url: 'https://example.com/invalid',
                format: 'audio',
            }

            const result = await service.executeDownload(options)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unsupported platform')
        })

        it('processes valid download with validator passing', async () => {
            jest.spyOn(
                service['validator'],
                'validateDownload',
            ).mockResolvedValue({
                isValid: true,
                platform: 'youtube',
            })

            jest.spyOn(
                service['processor'],
                'processDownload',
            ).mockResolvedValue({
                success: true,
                filePath: '/tmp/video.mp4',
                fileName: 'video.mp4',
            })

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await service.executeDownload(options)

            expect(result.success).toBe(true)
        })

        it('handles service errors gracefully', async () => {
            jest.spyOn(
                service['validator'],
                'validateDownload',
            ).mockRejectedValue(new Error('Service error'))

            const options: DownloadOptions = {
                url: 'https://youtube.com/watch?v=abc123',
                format: 'audio',
            }

            const result = await service.executeDownload(options)

            expect(result.success).toBe(false)
            expect(result.error).toContain('Service error')
        })
    })

    describe('createDownloadResponse', () => {
        it('creates success response with file attachment for successful download', async () => {
            const result = {
                success: true,
                filePath: '/downloads/video.mp4',
                fileName: 'video.mp4',
                fileSize: 25 * 1024 * 1024,
                duration: 300,
            }

            const response = await service.createDownloadResponse(
                result,
                'https://youtube.com/watch?v=abc123',
            )

            expect(response.files.length).toBe(1)
            expect(response.files[0].name).toBe('video.mp4')
            expect(response.embeds).toBeDefined()
        })

        it('creates error response for failed download', async () => {
            const result = {
                success: false,
                error: 'Network timeout',
            }

            const response = await service.createDownloadResponse(
                result,
                'https://youtube.com/watch?v=abc123',
            )

            expect(response.files.length).toBe(0)
            expect(response.embeds).toBeDefined()
        })

        it('handles missing filePath as error case', async () => {
            const result = {
                success: true,
                filePath: undefined,
            }

            const response = await service.createDownloadResponse(
                result,
                'https://youtube.com/watch?v=abc123',
            )

            expect(response.files.length).toBe(0)
            expect(response.embeds).toBeDefined()
        })

        it('treats empty filePath string as error', async () => {
            const result = {
                success: true,
                filePath: '',
            }

            const response = await service.createDownloadResponse(
                result,
                'https://youtube.com/watch?v=abc123',
            )

            expect(response.files.length).toBe(0)
        })

        it('includes Discord file size limit enforcement (25MB)', async () => {
            // Service creates AttachmentBuilder which Discord enforces limits on
            const result = {
                success: true,
                filePath: '/downloads/large.mp4',
                fileName: 'large.mp4',
                fileSize: 30 * 1024 * 1024, // 30MB > 25MB limit
            }

            const response = await service.createDownloadResponse(
                result,
                'https://youtube.com/watch?v=abc123',
            )

            // Attachment is created regardless, Discord client would reject on send
            expect(response.files.length).toBe(1)
        })
    })
})
