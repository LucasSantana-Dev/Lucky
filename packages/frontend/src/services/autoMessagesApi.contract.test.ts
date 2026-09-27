import { describe, test, expect } from 'vitest'
import { autoMessageSchemas } from '../../../backend/src/schemas/autoMessages'
import {
    buildCreatePayload,
    buildUpdatePayload,
    type AutoMessageFormValues,
} from './autoMessagesApi'

const baseForm: AutoMessageFormValues = {
    type: 'welcome',
    message: 'Welcome {user}!',
    channelId: '123456789012345678',
    trigger: '',
    exactMatch: false,
}

describe('auto messages frontend/backend contract', () => {
    test('the payload the create form builds for a welcome message satisfies the backend create schema', () => {
        const payload = buildCreatePayload(baseForm)

        const result = autoMessageSchemas.createMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('the payload the create form builds for an auto_response satisfies the backend create schema', () => {
        const payload = buildCreatePayload({
            ...baseForm,
            type: 'auto_response',
            channelId: '',
            trigger: 'ping',
            exactMatch: true,
        })

        const result = autoMessageSchemas.createMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('the payload the edit form builds satisfies the backend update schema', () => {
        const payload = buildUpdatePayload(baseForm)

        const result = autoMessageSchemas.updateMessageBody.safeParse(payload)

        expect(result.success).toBe(true)
    })

    test('clearing the channel field in the edit form sends an explicit null the backend schema accepts', () => {
        const payload = buildUpdatePayload({ ...baseForm, channelId: '' })

        expect(payload.channelId).toBeNull()

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
