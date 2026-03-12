export const GUILD_AUTOMATION_ERROR_CODES = {
    GUILD_AUTOMATION_INVALID_MANIFEST_PAYLOAD:
        'ERR_GUILD_AUTOMATION_INVALID_MANIFEST_PAYLOAD',
    GUILD_AUTOMATION_MANIFEST_NOT_FOUND:
        'ERR_GUILD_AUTOMATION_MANIFEST_NOT_FOUND',
    GUILD_AUTOMATION_CAPTURE_REQUIRED:
        'ERR_GUILD_AUTOMATION_CAPTURE_REQUIRED',
    GUILD_AUTOMATION_APPLY_LOCKED: 'ERR_GUILD_AUTOMATION_APPLY_LOCKED',
    GUILD_AUTOMATION_LOCK_UNAVAILABLE:
        'ERR_GUILD_AUTOMATION_LOCK_UNAVAILABLE',
} as const

export type GuildAutomationErrorCode =
    (typeof GUILD_AUTOMATION_ERROR_CODES)[keyof typeof GUILD_AUTOMATION_ERROR_CODES]

type GuildAutomationErrorContext = {
    guildId?: string
    runId?: string
    details?: Record<string, unknown>
}

export class GuildAutomationError extends Error {
    public readonly code: GuildAutomationErrorCode
    public readonly retryable: boolean
    public readonly context: GuildAutomationErrorContext

    constructor(params: {
        message: string
        code: GuildAutomationErrorCode
        retryable?: boolean
        context?: GuildAutomationErrorContext
    }) {
        super(params.message)
        this.name = 'GuildAutomationError'
        this.code = params.code
        this.retryable = params.retryable ?? false
        this.context = params.context ?? {}
    }
}

export class GuildAutomationInvalidManifestPayloadError extends GuildAutomationError {
    constructor() {
        super({
            message: 'Manifest payload is invalid',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_INVALID_MANIFEST_PAYLOAD,
            retryable: false,
        })
    }
}

export class GuildAutomationManifestNotFoundError extends GuildAutomationError {
    constructor(guildId: string) {
        super({
            message: 'No automation manifest found for this guild',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_MANIFEST_NOT_FOUND,
            retryable: false,
            context: { guildId },
        })
    }
}

export class GuildAutomationCaptureRequiredError extends GuildAutomationError {
    constructor(guildId: string) {
        super({
            message: 'No captured guild state available. Run capture before plan/apply.',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_CAPTURE_REQUIRED,
            retryable: false,
            context: { guildId },
        })
    }
}

export class GuildAutomationApplyLockedError extends GuildAutomationError {
    constructor(guildId: string) {
        super({
            message: 'Another automation apply operation is already running',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_APPLY_LOCKED,
            retryable: true,
            context: { guildId },
        })
    }
}

export class GuildAutomationLockUnavailableError extends GuildAutomationError {
    constructor(guildId: string) {
        super({
            message: 'Guild automation lock backend is unavailable',
            code: GUILD_AUTOMATION_ERROR_CODES.GUILD_AUTOMATION_LOCK_UNAVAILABLE,
            retryable: true,
            context: { guildId },
        })
    }
}
