import type { TextChannel, User } from 'discord.js'
import type { CustomClient } from './index'

export interface QueueMetadata {
    channel?: TextChannel | null
    requestedBy?: User | null
    client?: CustomClient | null
    vcMemberIds?: string[]
}
