import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useActiveHeading } from './useActiveHeading'

type Entry = { target: Element; isIntersecting: boolean; top: number }

let callback: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()

function addHeading(id: string) {
    const el = document.createElement('h2')
    el.id = id
    document.body.appendChild(el)
    return el
}

// The hook depends on the ids array identity, so keep one array per render.
function renderWith(ids: string[]) {
    return renderHook(({ list }) => useActiveHeading(list), {
        initialProps: { list: ids },
    })
}

function fire(entries: Entry[]) {
    act(() => {
        callback(
            entries.map((e) => ({
                target: e.target,
                isIntersecting: e.isIntersecting,
                boundingClientRect: { top: e.top },
            })) as unknown as IntersectionObserverEntry[],
            {} as IntersectionObserver,
        )
    })
}

describe('useActiveHeading', () => {
    beforeEach(() => {
        observe.mockClear()
        disconnect.mockClear()
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                constructor(cb: IntersectionObserverCallback) {
                    callback = cb
                }
                observe = observe
                disconnect = disconnect
            },
        )
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    test('returns null and observes nothing when no ids are given', () => {
        const { result } = renderWith([])
        expect(result.current).toBeNull()
        expect(observe).not.toHaveBeenCalled()
    })

    test('observes nothing when none of the ids exist in the document', () => {
        renderWith(['missing'])
        expect(observe).not.toHaveBeenCalled()
    })

    test('observes only the headings that exist', () => {
        const a = addHeading('a')
        renderWith(['a', 'missing'])
        expect(observe).toHaveBeenCalledTimes(1)
        expect(observe).toHaveBeenCalledWith(a)
    })

    test('returns the id of the topmost intersecting heading', () => {
        const a = addHeading('a')
        const b = addHeading('b')
        const { result } = renderWith(['a', 'b'])
        fire([
            { target: b, isIntersecting: true, top: 200 },
            { target: a, isIntersecting: true, top: 40 },
        ])
        expect(result.current).toBe('a')
    })

    test('keeps the previous id when no heading is intersecting', () => {
        const a = addHeading('a')
        const { result } = renderWith(['a'])
        fire([{ target: a, isIntersecting: true, top: 10 }])
        fire([{ target: a, isIntersecting: false, top: -300 }])
        expect(result.current).toBe('a')
    })

    test('disconnects the observer on unmount', () => {
        addHeading('a')
        const { unmount } = renderWith(['a'])
        unmount()
        expect(disconnect).toHaveBeenCalledTimes(1)
    })
})
