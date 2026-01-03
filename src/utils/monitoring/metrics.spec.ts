import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { recordCommandMetric, recordInteractionMetric, recordMusicMetric, recordErrorMetric } from './metrics'
import type { CustomClient } from '../../types'

describe('Metrics Monitoring', () => {
    let mockClient: CustomClient
    let mockMetrics: any

    beforeEach(() => {
        mockMetrics = {
            commandExecutions: {
                inc: jest.fn()
            },
            commandDuration: {
                observe: jest.fn()
            },
            interactions: {
                inc: jest.fn()
            },
            musicActions: {
                inc: jest.fn()
            },
            errors: {
                inc: jest.fn()
            }
        }

        mockClient = {
            metrics: mockMetrics
        } as any
    })

    describe('recordCommandMetric', () => {
        it('should record command execution metric', () => {
            recordCommandMetric(mockClient, 'play', 150, true)

            expect(mockMetrics.commandExecutions.inc).toHaveBeenCalledWith({
                command: 'play',
                success: 'true'
            })
            expect(mockMetrics.commandDuration.observe).toHaveBeenCalledWith(
                { command: 'play' },
                150
            )
        })

        it('should record failed command execution metric', () => {
            recordCommandMetric(mockClient, 'skip', 200, false)

            expect(mockMetrics.commandExecutions.inc).toHaveBeenCalledWith({
                command: 'skip',
                success: 'false'
            })
            expect(mockMetrics.commandDuration.observe).toHaveBeenCalledWith(
                { command: 'skip' },
                200
            )
        })

        it('should not record metrics when client has no metrics', () => {
            mockClient.metrics = null

            recordCommandMetric(mockClient, 'play', 150, true)

            expect(mockMetrics.commandExecutions.inc).not.toHaveBeenCalled()
            expect(mockMetrics.commandDuration.observe).not.toHaveBeenCalled()
        })
    })

    describe('recordInteractionMetric', () => {
        it('should record successful interaction metric', () => {
            recordInteractionMetric(mockClient, 'button', true)

            expect(mockMetrics.interactions.inc).toHaveBeenCalledWith({
                type: 'button',
                success: 'true'
            })
        })

        it('should record failed interaction metric', () => {
            recordInteractionMetric(mockClient, 'select_menu', false)

            expect(mockMetrics.interactions.inc).toHaveBeenCalledWith({
                type: 'select_menu',
                success: 'false'
            })
        })

        it('should not record metrics when client has no metrics', () => {
            mockClient.metrics = null

            recordInteractionMetric(mockClient, 'button', true)

            expect(mockMetrics.interactions.inc).not.toHaveBeenCalled()
        })
    })

    describe('recordMusicMetric', () => {
        it('should record music action metric', () => {
            recordMusicMetric(mockClient, 'play', 'guild123')

            expect(mockMetrics.musicActions.inc).toHaveBeenCalledWith({
                action: 'play',
                guild_id: 'guild123'
            })
        })

        it('should record different music actions', () => {
            recordMusicMetric(mockClient, 'pause', 'guild456')
            recordMusicMetric(mockClient, 'skip', 'guild789')

            expect(mockMetrics.musicActions.inc).toHaveBeenCalledTimes(2)
            expect(mockMetrics.musicActions.inc).toHaveBeenNthCalledWith(1, {
                action: 'pause',
                guild_id: 'guild456'
            })
            expect(mockMetrics.musicActions.inc).toHaveBeenNthCalledWith(2, {
                action: 'skip',
                guild_id: 'guild789'
            })
        })

        it('should not record metrics when client has no metrics', () => {
            mockClient.metrics = null

            recordMusicMetric(mockClient, 'play', 'guild123')

            expect(mockMetrics.musicActions.inc).not.toHaveBeenCalled()
        })
    })

    describe('recordErrorMetric', () => {
        it('should record error metric with different severities', () => {
            recordErrorMetric(mockClient, 'validation_error', 'low')
            recordErrorMetric(mockClient, 'network_error', 'medium')
            recordErrorMetric(mockClient, 'database_error', 'high')
            recordErrorMetric(mockClient, 'system_error', 'critical')

            expect(mockMetrics.errors.inc).toHaveBeenCalledTimes(4)
            expect(mockMetrics.errors.inc).toHaveBeenNthCalledWith(1, {
                type: 'validation_error',
                severity: 'low'
            })
            expect(mockMetrics.errors.inc).toHaveBeenNthCalledWith(2, {
                type: 'network_error',
                severity: 'medium'
            })
            expect(mockMetrics.errors.inc).toHaveBeenNthCalledWith(3, {
                type: 'database_error',
                severity: 'high'
            })
            expect(mockMetrics.errors.inc).toHaveBeenNthCalledWith(4, {
                type: 'system_error',
                severity: 'critical'
            })
        })

        it('should not record metrics when client has no metrics', () => {
            mockClient.metrics = null

            recordErrorMetric(mockClient, 'test_error', 'low')

            expect(mockMetrics.errors.inc).not.toHaveBeenCalled()
        })
    })
})
