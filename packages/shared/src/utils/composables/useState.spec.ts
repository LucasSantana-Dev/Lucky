import { describe, it, expect, jest } from '@jest/globals'
import { createState, createDerivedState } from './useState'

describe('createState', () => {
    it('returns the initial state', () => {
        const state = createState(42)
        expect(state.getState()).toBe(42)
    })

    it('sets state to a direct value', () => {
        const state = createState(0)
        state.setState(10)
        expect(state.getState()).toBe(10)
    })

    it('sets state via an updater function', () => {
        const state = createState(5)
        state.setState((n) => n * 2)
        expect(state.getState()).toBe(10)
    })

    it('notifies subscribers on state change', () => {
        const state = createState('a')
        const listener = jest.fn<(n: string, p: string) => void>()
        state.subscribe(listener)
        state.setState('b')
        expect(listener).toHaveBeenCalledWith('b', 'a')
    })

    it('does not notify subscribers when value is unchanged', () => {
        const state = createState(1)
        const listener = jest.fn<(n: number, p: number) => void>()
        state.subscribe(listener)
        state.setState(1)
        expect(listener).not.toHaveBeenCalled()
    })

    it('unsubscribes correctly', () => {
        const state = createState(0)
        const listener = jest.fn<(n: number, p: number) => void>()
        const unsubscribe = state.subscribe(listener)
        unsubscribe()
        state.setState(99)
        expect(listener).not.toHaveBeenCalled()
    })

    it('resets to initial state', () => {
        const state = createState(10)
        state.setState(99)
        state.reset()
        expect(state.getState()).toBe(10)
    })

    it('notifies subscriber on reset when value changes', () => {
        const state = createState(0)
        state.setState(5)
        const listener = jest.fn<(n: number, p: number) => void>()
        state.subscribe(listener)
        state.reset()
        expect(listener).toHaveBeenCalledWith(0, 5)
    })

    it('works with object state', () => {
        const initial = { count: 0 }
        const state = createState(initial)
        const next = { count: 1 }
        state.setState(next)
        expect(state.getState()).toBe(next)
    })
})

describe('createDerivedState', () => {
    it('returns derived value', () => {
        const state = createState(4)
        const derived = createDerivedState(state, (n) => n * n)
        expect(derived.getDerivedState()).toBe(16)
    })

    it('caches derived value when state has not changed', () => {
        const selector = jest.fn<(n: number) => number>((n) => n + 1)
        const state = createState(3)
        const derived = createDerivedState(state, selector)
        derived.getDerivedState()
        derived.getDerivedState()
        expect(selector).toHaveBeenCalledTimes(1)
    })

    it('recomputes derived value when state changes', () => {
        const selector = jest.fn<(n: number) => number>((n) => n * 2)
        const state = createState(1)
        const derived = createDerivedState(state, selector)
        derived.getDerivedState()
        state.setState(2)
        const result = derived.getDerivedState()
        expect(result).toBe(4)
        expect(selector).toHaveBeenCalledTimes(2)
    })
})
