import type { Response } from 'express'
import { MusicControlService, type MusicCommand } from '@lukbot/shared/services'

export function param(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function buildCommand(
    guildId: string,
    userId: string,
    type: MusicCommand['type'],
    data?: Record<string, unknown>,
): MusicCommand {
    return {
        id: MusicControlService.createCommandId(),
        guildId,
        userId,
        type,
        data,
        timestamp: Date.now(),
    }
}

export const sseClients = new Map<string, Set<Response>>()
