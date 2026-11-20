import { afterEach, describe, expect, test } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageMetadata } from './usePageMetadata'

function metaContent() {
    return document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
}

describe('usePageMetadata', () => {
    afterEach(() => {
        document
            .querySelectorAll('meta[name="description"]')
            .forEach((el) => el.remove())
    })

    test('sets the document title', () => {
        renderHook(() => usePageMetadata({ title: 'Hello - Lucky' }))
        expect(document.title).toBe('Hello - Lucky')
    })

    test('does not create a description tag when none is given', () => {
        renderHook(() => usePageMetadata({ title: 'No desc' }))
        expect(metaContent()).toBeUndefined()
    })

    test('creates the description tag when it is missing', () => {
        renderHook(() =>
            usePageMetadata({ title: 'T', description: 'First description' }),
        )
        expect(metaContent()).toBe('First description')
    })

    test('reuses an existing description tag instead of adding another', () => {
        const existing = document.createElement('meta')
        existing.setAttribute('name', 'description')
        existing.setAttribute('content', 'old')
        document.head.appendChild(existing)

        renderHook(() => usePageMetadata({ title: 'T', description: 'new' }))

        expect(
            document.querySelectorAll('meta[name="description"]'),
        ).toHaveLength(1)
        expect(existing.getAttribute('content')).toBe('new')
    })

    test('updates the title and description when the options change', () => {
        const { rerender } = renderHook(
            ({ title, description }) => usePageMetadata({ title, description }),
            { initialProps: { title: 'A', description: 'desc A' } },
        )
        rerender({ title: 'B', description: 'desc B' })
        expect(document.title).toBe('B')
        expect(metaContent()).toBe('desc B')
    })
})
