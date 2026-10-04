import { describe, test, expect, vi } from 'vitest'
import { autoMessageSchemas } from '../../../backend/src/schemas/autoMessages'
import {
    buildCreatePayload,
    createAutoMessagesApi,
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

    test('the toggle call sends a body the backend toggle schema accepts', () => {
        const apiClient = { patch: vi.fn() }
        createAutoMessagesApi(apiClient as never).toggle(
            '123456789012345678',
            'msg-1',
            false,
        )

        const [path, body] = apiClient.patch.mock.calls[0]
        const result = autoMessageSchemas.toggleBody.safeParse(body)

        expect(path).toBe(
            '/guilds/123456789012345678/automessages/msg-1/toggle',
        )
        expect(result.success).toBe(true)
    })

    test('a toggle body missing enabled is rejected for the enabled field', () => {
        const result = autoMessageSchemas.toggleBody.safeParse({})

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_type',
            path: ['enabled'],
        })
    })

    test('the list call sends no query string, which the backend messages query schema accepts', () => {
        const apiClient = { get: vi.fn() }
        createAutoMessagesApi(apiClient as never).list('123456789012345678')

        expect(apiClient.get.mock.calls[0]).toEqual([
            '/guilds/123456789012345678/automessages',
        ])
        expect(autoMessageSchemas.messagesQuery.safeParse({}).success).toBe(
            true,
        )
    })

    test('a messages query type filter longer than 50 characters is rejected for the type field', () => {
        const result = autoMessageSchemas.messagesQuery.safeParse({
            type: 'x'.repeat(51),
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'too_big',
            path: ['type'],
        })
    })
})
