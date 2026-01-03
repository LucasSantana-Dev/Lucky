import { QueueSessionManagerService } from './service'
import type { QueueSession, SessionConfig, QueueSessionOptions } from './types'

/**
 * Main queue session manager
 */
export class QueueSessionManager {
    private readonly service: QueueSessionManagerService

    constructor(config: SessionConfig) {
        this.service = new QueueSessionManagerService(config)
    }

    async createQueueSession(session: QueueSession): Promise<boolean> {
        return this.service.createQueueSession(session)
    }

    async getQueueSession(guildId: string): Promise<QueueSession | null> {
        return this.service.getQueueSession(guildId)
    }

    async updateQueueSession(session: QueueSession): Promise<boolean> {
        return this.service.updateQueueSession(session)
    }

    async deleteQueueSession(guildId: string): Promise<boolean> {
        return this.service.deleteQueueSession(guildId)
    }

    async clearAllQueueSessions(): Promise<boolean> {
        return this.service.clearAllQueueSessions()
    }

    async createQueueSessionFromOptions(
        options: QueueSessionOptions,
    ): Promise<QueueSession> {
        return this.service.createQueueSessionFromOptions(options)
    }
}

export type { QueueSession, SessionConfig, QueueSessionOptions }
