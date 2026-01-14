/**
 * State management composable following functional programming patterns
 */

type StateUpdater<T> = (currentState: T) => T
type StateListener<T> = (newState: T, previousState: T) => void

export const createState = <T>(initialState: T) => {
    let currentState = initialState
    const listeners = new Set<StateListener<T>>()

    const getState = (): T => currentState

    const setState = (updater: T | StateUpdater<T>): void => {
        const previousState = currentState
        const newState =
            typeof updater === 'function'
                ? (updater as StateUpdater<T>)(currentState)
                : updater

        if (newState !== currentState) {
            currentState = newState
            listeners.forEach((listener) => listener(newState, previousState))
        }
    }

    const subscribe = (listener: StateListener<T>): (() => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    const reset = (): void => {
        setState(initialState)
    }

    return {
        getState,
        setState,
        subscribe,
        reset,
    }
}

export const createDerivedState = <T, U>(
    state: { getState: () => T },
    selector: (state: T) => U,
) => {
    let cachedValue: U | undefined
    let cachedState: T | undefined

    const getDerivedState = (): U => {
        const currentState = state.getState()
        if (cachedState !== currentState) {
            cachedValue = selector(currentState)
            cachedState = currentState
        }
        return cachedValue as U
    }

    return { getDerivedState }
}
