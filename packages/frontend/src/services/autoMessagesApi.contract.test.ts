import { describe, test, expect } from 'vitest'
import { autoMessageSchemas } from '../../../backend/src/schemas/autoMessages'

describe('auto messages frontend/backend contract', () => {
    test('a welcome message payload satisfies the backend create schema', () => {
        const payload = {
            type: 'welcome',
            message: 'Welcome {user}!',
            channelId: '123456789012345678',
        }

        const result = autoMessageSchemas.createMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('an auto_response payload with trigger and exactMatch satisfies the backend create schema', () => {
        const payload = {
            type: 'auto_response',
            message: 'Pong!',
            trigger: 'ping',
            exactMatch: true,
        }

        const result = autoMessageSchemas.createMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('an update payload satisfies the backend update schema', () => {
        const payload = {
            message: 'Updated message',
            enabled: false,
        }

        const result = autoMessageSchemas.updateMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('the legacy scheduled-post shape the dashboard used to send is rejected', () => {
        const payload = {
            name: 'Daily Reminder',
            channel: '123456789012345678',
            content: 'Hello!',
            interval: 3600,
            isEmbed: false,
        }

        const result = autoMessageSchemas.createMessageBody.safeParse(payload)

        expect(result.success).toBe(false)
    })
})
