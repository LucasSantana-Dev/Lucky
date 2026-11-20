/**
 * Function shapes for `jest.fn<...>()` mocks whose real signature is not
 * worth spelling out. An untyped `jest.fn()` has no resolved type, so
 * `mockResolvedValue(x)` is typed as taking `never` and fails the spec
 * type-check. These keep the arguments open and the result `unknown`.
 */
export type AsyncMockFn = (...args: unknown[]) => Promise<unknown>

/**
 * Types a deliberately partial fixture (a stub with only the members the code
 * under test touches) as the full type it stands in for.
 */
export function partial<T>(value: unknown): T {
    return value as T
}
