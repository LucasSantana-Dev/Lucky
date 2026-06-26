import type { CustomClient } from '../types'

let _client: CustomClient | null = null

export function setClient(client: CustomClient): void {
    _client = client
}

export function getStoredClient(): CustomClient | null {
    return _client
}
