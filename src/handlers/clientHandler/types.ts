/**
 * Client handler types and interfaces
 */

import type { CustomClient } from '../../types/index'
import type Command from '../../models/Command'

export type StartClientParams = {
    client: CustomClient
}

export type MapGuildIdsParams = {
    client: CustomClient
}

export type CreateClientOptions = {
    intents: number[]
    presence: {
        activities: unknown[]
        status: string
    }
}

export type RegisterCommandsOptions = {
    commands: Command[]
    token: string
    clientId: string
}
