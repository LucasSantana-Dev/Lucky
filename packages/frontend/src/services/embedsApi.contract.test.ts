import { describe, test, expect } from 'vitest'
import { embedSchemas } from '../../../backend/src/schemas/embeds'
import {
    buildCreateEmbedInput,
    buildUpdateEmbedInput,
    type EmbedFormValues,
} from './embedsApi'

const fullForm: EmbedFormValues = {
    name: 'welcome-embed',
    title: 'Welcome',
    description: 'Glad you are here',
    color: '#5865F2',
    footer: 'Lucky bot',
    thumbnail: 'https://example.com/thumb.png',
    image: 'https://example.com/image.png',
    fields: [
        { name: 'Rules', value: 'Be kind', inline: true },
        { name: 'Help', value: 'Ask a mod' },
    ],
}

const blankForm: EmbedFormValues = {
    name: 'blank-embed',
    title: '',
    description: '',
    color: '',
    footer: '',
    thumbnail: '',
    image: '',
    fields: [],
}

const definedKeys = (obj: object) =>
    Object.entries(obj)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key)
        .sort()

describe('embed builder frontend/backend contract', () => {
    test('a full form builds a create payload the backend create schema accepts', () => {
        const result = embedSchemas.createEmbedBody.safeParse(
            buildCreateEmbedInput(fullForm),
        )

        expect(result.success).toBe(true)
    })

    test('a blank-optionals form builds a create payload the backend create schema accepts', () => {
        const result = embedSchemas.createEmbedBody.safeParse(
            buildCreateEmbedInput(blankForm),
        )

        expect(result.success).toBe(true)
    })

    test('a full form builds an update payload the backend strict update schema accepts', () => {
        const result = embedSchemas.updateEmbedBody.safeParse(
            buildUpdateEmbedInput(fullForm),
        )

        expect(result.success).toBe(true)
    })

    test('blanked footer, thumbnail and image send explicit nulls the update schema accepts', () => {
        const payload = buildUpdateEmbedInput({
            ...fullForm,
            footer: '',
            thumbnail: '',
            image: '',
        })

        expect(payload.footer).toBeNull()
        expect(payload.thumbnail).toBeNull()
        expect(payload.image).toBeNull()
        expect(embedSchemas.updateEmbedBody.safeParse(payload).success).toBe(
            true,
        )
    })

    test('the create schema strips none of the embedData keys the form sends', () => {
        const payload = buildCreateEmbedInput(fullForm)

        const result = embedSchemas.createEmbedBody.safeParse(payload)

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(definedKeys(result.data.embedData)).toEqual(
            definedKeys(payload.embedData),
        )
    })

    test('the update schema strips none of the keys the form sends', () => {
        const payload = buildUpdateEmbedInput(fullForm)

        const result = embedSchemas.updateEmbedBody.safeParse(payload)

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(definedKeys(result.data)).toEqual(definedKeys(payload))
    })

    test('a create payload that renames embedData to data is rejected', () => {
        const { embedData, ...rest } = buildCreateEmbedInput(fullForm)

        const result = embedSchemas.createEmbedBody.safeParse({
            ...rest,
            data: embedData,
        })

        expect(result.success).toBe(false)
    })
})
