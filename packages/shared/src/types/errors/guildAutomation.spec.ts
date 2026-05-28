import { describe, it, expect } from '@jest/globals'
import {
    GUILD_AUTOMATION_ERROR_CODES,
    GuildAutomationError,
    GuildAutomationInvalidManifestPayloadError,
    GuildAutomationManifestNotFoundError,
    GuildAutomationCaptureRequiredError,
    GuildAutomationApplyLockedError,
    GuildAutomationLockUnavailableError,
} from './guildAutomation'

describe('GuildAutomationError', () => {
    it('sets message, code, retryable, and context', () => {
        const err = new GuildAutomationError({
            message: 'test error',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_MANIFEST_NOT_FOUND,
            retryable: true,
            context: { guildId: 'g1' },
        })
        expect(err.message).toBe('test error')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_MANIFEST_NOT_FOUND,
        )
        expect(err.retryable).toBe(true)
        expect(err.context).toEqual({ guildId: 'g1' })
        expect(err.name).toBe('GuildAutomationError')
    })

    it('defaults retryable to false and context to empty object', () => {
        const err = new GuildAutomationError({
            message: 'x',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_APPLY_LOCKED,
        })
        expect(err.retryable).toBe(false)
        expect(err.context).toEqual({})
    })
})

describe('GuildAutomationInvalidManifestPayloadError', () => {
    it('sets correct message and code', () => {
        const err = new GuildAutomationInvalidManifestPayloadError()
        expect(err.message).toBe('Manifest payload is invalid')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_INVALID_MANIFEST_PAYLOAD,
        )
        expect(err.retryable).toBe(false)
    })
})

describe('GuildAutomationManifestNotFoundError', () => {
    it('includes guildId in context', () => {
        const err = new GuildAutomationManifestNotFoundError('guild-123')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_MANIFEST_NOT_FOUND,
        )
        expect(err.context.guildId).toBe('guild-123')
        expect(err.retryable).toBe(false)
    })
})

describe('GuildAutomationCaptureRequiredError', () => {
    it('includes guildId in context', () => {
        const err = new GuildAutomationCaptureRequiredError('guild-456')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_CAPTURE_REQUIRED,
        )
        expect(err.context.guildId).toBe('guild-456')
        expect(err.retryable).toBe(false)
    })
})

describe('GuildAutomationApplyLockedError', () => {
    it('is retryable and includes guildId', () => {
        const err = new GuildAutomationApplyLockedError('guild-789')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_APPLY_LOCKED,
        )
        expect(err.context.guildId).toBe('guild-789')
        expect(err.retryable).toBe(true)
    })
})

describe('GuildAutomationLockUnavailableError', () => {
    it('is retryable and includes guildId', () => {
        const err = new GuildAutomationLockUnavailableError('guild-abc')
        expect(err.code).toBe(
            GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_LOCK_UNAVAILABLE,
        )
        expect(err.context.guildId).toBe('guild-abc')
        expect(err.retryable).toBe(true)
    })
})
