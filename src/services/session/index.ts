import { BaseService } from '../../types/services/BaseService'
import { Result } from '../../types/common/BaseResult'
// import { ENVIRONMENT_CONFIG } from '../../config/environmentConfig'
import { UserSessionManager } from './userSessionManager'
import { QueueSessionManagerService } from './queueSessionManager/service'
import type { UserSession, QueueSession, SessionConfig } from './types'

/**
 * Main session service that combines user and queue session management
 */
export class SessionService extends BaseService<SessionConfig> {
    private readonly userSessionManager: UserSessionManager
    private readonly queueSessionManager: QueueSessionManagerService

    constructor(config: SessionConfig, redisClient: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(config as any, redisClient as any)

        this.userSessionManager = new UserSessionManager(config)
        this.queueSessionManager = new QueueSessionManagerService(config)
    }

    // User session methods
    async createUserSession(session: UserSession): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.userSessionManager.createUserSession(session)
                return Result.success(success)
            },
            Result.success(false),
            'createUserSession',
        )
    }

    async getUserSession(
        userId: string,
        guildId: string,
    ): Promise<Result<UserSession | null>> {
        return this.executeWithFallback(
            async () => {
                const session = await this.userSessionManager.getUserSession(userId, guildId)
                return Result.success(session)
            },
            Result.success(null),
            'getUserSession',
        )
    }

    async updateUserSession(session: UserSession): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.userSessionManager.updateUserSession(session)
                return Result.success(success)
            },
            Result.success(false),
            'updateUserSession',
        )
    }

    async deleteUserSession(userId: string, guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.userSessionManager.deleteUserSession(userId, guildId)
                return Result.success(success)
            },
            Result.success(false),
            'deleteUserSession',
        )
    }

    async addCommandToHistory(
        userId: string,
        guildId: string,
        command: string,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.userSessionManager.addCommandToHistory(
                    userId,
                    guildId,
                    command,
                )
                return Result.success(success)
            },
            Result.success(false),
            'addCommandToHistory',
        )
    }

    async updateUserPreferences(
        userId: string,
        guildId: string,
        preferences: Record<string, unknown>,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.userSessionManager.updateUserPreferences(
                    userId,
                    guildId,
                    preferences,
                )
                return Result.success(success)
            },
            Result.success(false),
            'updateUserPreferences',
        )
    }

    // Queue session methods
    async createQueueSession(session: QueueSession): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.createQueueSession(session)
                return Result.success(success)
            },
            Result.success(false),
            'createQueueSession',
        )
    }

    async getQueueSession(guildId: string): Promise<Result<QueueSession | null>> {
        return this.executeWithFallback(
            async () => {
                const session = await this.queueSessionManager.getQueueSession(guildId)
                return Result.success(session)
            },
            Result.success(null),
            'getQueueSession',
        )
    }

    async updateQueueSession(session: QueueSession): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.updateQueueSession(session)
                return Result.success(success)
            },
            Result.success(false),
            'updateQueueSession',
        )
    }

    async deleteQueueSession(guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.deleteQueueSession(guildId)
                return Result.success(success)
            },
            Result.success(false),
            'deleteQueueSession',
        )
    }

    async updateQueuePosition(
        guildId: string,
        position: number,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.updateQueuePosition(guildId, position)
                return Result.success(success)
            },
            Result.success(false),
            'updateQueuePosition',
        )
    }

    async updatePlayingState(
        guildId: string,
        isPlaying: boolean,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.updatePlayingState(guildId, isPlaying)
                return Result.success(success)
            },
            Result.success(false),
            'updatePlayingState',
        )
    }

    async updateVolume(guildId: string, volume: number): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.updateVolume(guildId, volume)
                return Result.success(success)
            },
            Result.success(false),
            'updateVolume',
        )
    }

    async updateRepeatMode(
        guildId: string,
        repeatMode: number,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.queueSessionManager.updateRepeatMode(guildId, repeatMode)
                return Result.success(success)
            },
            Result.success(false),
            'updateRepeatMode',
        )
    }

    protected getRedisKey(identifier: string): string {
        return super.getRedisKey('session', identifier)
    }
}

// Service should be instantiated with proper config and Redis client

export type { UserSession, QueueSession, SessionConfig }
export { QueueSessionManagerService }
