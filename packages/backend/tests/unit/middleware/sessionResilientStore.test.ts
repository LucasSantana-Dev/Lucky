import { describe, expect, jest, test } from '@jest/globals'
import session from 'express-session'
import { ResilientSessionStore } from '../../../src/middleware/session'

type MethodCallback = (error?: unknown, data?: unknown) => void
type StoreMethod = (...args: unknown[]) => void

type PartialStore = Partial<
    Record<'get' | 'set' | 'destroy' | 'touch', StoreMethod>
>

const createStore = (methods: PartialStore): session.Store =>
    methods as unknown as session.Store

const getSession = (
    store: ResilientSessionStore,
): Promise<{ error?: unknown; data?: unknown }> =>
    new Promise((resolve) => {
        store.get('sid', (error, data) => resolve({ error, data }))
    })

const setSession = (
    store: ResilientSessionStore,
    sessionData: session.SessionData = {},
): Promise<{ error?: unknown }> =>
    new Promise((resolve) => {
        store.set('sid', sessionData, (error) => resolve({ error }))
    })

const destroySession = (
    store: ResilientSessionStore,
): Promise<{ error?: unknown }> =>
    new Promise((resolve) => {
        store.destroy('sid', (error) => resolve({ error }))
    })

const touchSession = (
    store: ResilientSessionStore,
    sessionData: session.SessionData = {},
): Promise<{ error?: unknown }> =>
    new Promise((resolve) => {
        store.touch('sid', sessionData, (error) => resolve({ error }))
    })

describe('ResilientSessionStore', () => {
    test('uses primary store when operation succeeds', async () => {
        const primaryGet = jest.fn((sid: string, callback: MethodCallback) => {
            expect(sid).toBe('sid')
            callback(undefined, { source: 'primary' })
        })
        const fallbackGet = jest.fn((_sid: string, callback: MethodCallback) => {
            callback(undefined, { source: 'fallback' })
        })

        const store = new ResilientSessionStore(
            createStore({ get: primaryGet }),
            createStore({ get: fallbackGet }),
        )

        const result = await getSession(store)

        expect(result.error).toBeUndefined()
        expect(result.data).toEqual({ source: 'primary' })
        expect(primaryGet).toHaveBeenCalledTimes(1)
        expect(fallbackGet).not.toHaveBeenCalled()
    })

    test('switches to fallback after primary failure and stays there', async () => {
        const primaryGet = jest.fn((_sid: string, callback: MethodCallback) => {
            callback(new Error('primary failed'))
        })
        const fallbackGet = jest.fn((_sid: string, callback: MethodCallback) => {
            callback(undefined, { source: 'fallback' })
        })

        const store = new ResilientSessionStore(
            createStore({ get: primaryGet }),
            createStore({ get: fallbackGet }),
        )

        const firstResult = await getSession(store)
        const secondResult = await getSession(store)

        expect(firstResult.error).toBeUndefined()
        expect(firstResult.data).toEqual({ source: 'fallback' })
        expect(secondResult.error).toBeUndefined()
        expect(secondResult.data).toEqual({ source: 'fallback' })
        expect(primaryGet).toHaveBeenCalledTimes(1)
        expect(fallbackGet).toHaveBeenCalledTimes(2)
    })

    test('handles set, destroy and touch through fallback after activation', async () => {
        const primarySet = jest.fn(
            (
                _sid: string,
                _sessionData: session.SessionData,
                callback: MethodCallback,
            ) => {
                callback(new Error('primary set failed'))
            },
        )
        const fallbackSet = jest.fn(
            (
                _sid: string,
                _sessionData: session.SessionData,
                callback: MethodCallback,
            ) => callback(),
        )
        const primaryDestroy = jest.fn()
        const fallbackDestroy = jest.fn(
            (_sid: string, callback: MethodCallback) => callback(),
        )
        const primaryTouch = jest.fn()
        const fallbackTouch = jest.fn(
            (
                _sid: string,
                _sessionData: session.SessionData,
                callback: MethodCallback,
            ) => callback(),
        )

        const store = new ResilientSessionStore(
            createStore({
                set: primarySet,
                destroy: primaryDestroy,
                touch: primaryTouch,
            }),
            createStore({
                set: fallbackSet,
                destroy: fallbackDestroy,
                touch: fallbackTouch,
            }),
        )

        await expect(setSession(store)).resolves.toEqual({ error: undefined })
        await expect(destroySession(store)).resolves.toEqual({ error: undefined })
        await expect(touchSession(store)).resolves.toEqual({ error: undefined })

        expect(primarySet).toHaveBeenCalledTimes(1)
        expect(fallbackSet).toHaveBeenCalledTimes(1)
        expect(primaryDestroy).not.toHaveBeenCalled()
        expect(fallbackDestroy).toHaveBeenCalledTimes(1)
        expect(primaryTouch).not.toHaveBeenCalled()
        expect(fallbackTouch).toHaveBeenCalledTimes(1)
    })

    test('returns without error when store method does not exist', async () => {
        const store = new ResilientSessionStore(createStore({}), createStore({}))

        await expect(getSession(store)).resolves.toEqual({
            error: undefined,
            data: undefined,
        })
    })

    test('falls back when primary method throws synchronously', async () => {
        const primaryGet = jest.fn(() => {
            throw new Error('boom')
        })
        const fallbackGet = jest.fn((_sid: string, callback: MethodCallback) => {
            callback(undefined, { source: 'fallback' })
        })

        const store = new ResilientSessionStore(
            createStore({ get: primaryGet }),
            createStore({ get: fallbackGet }),
        )

        const result = await getSession(store)

        expect(result.error).toBeUndefined()
        expect(result.data).toEqual({ source: 'fallback' })
        expect(primaryGet).toHaveBeenCalledTimes(1)
        expect(fallbackGet).toHaveBeenCalledTimes(1)
    })

    test('activateFallback is idempotent once fallback is active', () => {
        const store = new ResilientSessionStore(createStore({}), createStore({}))
        const privateStore = store as unknown as {
            activateFallback: (error: unknown) => void
            fallbackActive: boolean
        }

        privateStore.activateFallback(new Error('first'))
        expect(privateStore.fallbackActive).toBe(true)

        privateStore.activateFallback(new Error('second'))
        expect(privateStore.fallbackActive).toBe(true)
    })
})
