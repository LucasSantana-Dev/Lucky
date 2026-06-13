/**
 * Type guards and utility functions following early return patterns
 */

export const isString = (value: unknown): value is string =>
    typeof value === 'string'

export const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && !isNaN(value)

export const isBoolean = (value: unknown): value is boolean =>
    typeof value === 'boolean'

export const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

export const isArray = <T>(value: unknown): value is T[] => Array.isArray(value)

export const isNonEmptyString = (value: unknown): value is string =>
    isString(value) && value.trim().length > 0

export const isNonEmptyArray = <T>(value: unknown): value is [T, ...T[]] =>
    isArray<T>(value) && value.length > 0

export const isGuildId = (value: string): boolean => /^\d{17,19}$/.test(value)

export const isUserId = (value: string): boolean => /^\d{17,19}$/.test(value)

export const isChannelId = (value: string): boolean => /^\d{17,19}$/.test(value)

export const isYouTubeUrl = (value: string): boolean =>
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(value)

export const isSpotifyUrl = (value: string): boolean =>
    /https?:\/\/(open\.)?spotify\.com\/(track|playlist|album)\/[a-zA-Z0-9]+/.test(
        value,
    )

export const isDiscordInvite = (value: string): boolean =>
    /^https?:\/\/(discord\.gg|discordapp\.com\/invite)\/[a-zA-Z0-9]+/.test(
        value,
    )

export const hasProperty = <K extends string>(
    obj: unknown,
    key: K,
): obj is Record<K, unknown> => isObject(obj) && key in obj

export const isFunction = (value: unknown): value is Function =>
    typeof value === 'function'

export const isPromise = <T>(value: unknown): value is Promise<T> =>
    value instanceof Promise

export const isError = (value: unknown): value is Error =>
    value instanceof Error

/**
 * Assert that a value is neither `null` nor `undefined`, returning it narrowed.
 *
 * Use at sites where a value is invariantly present by design but TypeScript
 * can't prove it (e.g. `interaction.guild` inside a guild-only command). This
 * turns a silent non-null assertion (`x!`) into an explicit, message-carrying
 * failure if the invariant is ever violated, instead of an opaque
 * `TypeError: Cannot read properties of null`.
 *
 * @param value The possibly-nullish value.
 * @param message Why the value is expected to be present (shown if it isn't).
 * @returns The value, narrowed to exclude `null | undefined`.
 * @throws Error when `value` is `null` or `undefined`.
 */
export function assertDefined<T>(
    value: T | null | undefined,
    message: string,
): T {
    if (value === null || value === undefined) {
        throw new Error(`assertDefined: ${message}`)
    }
    return value
}
