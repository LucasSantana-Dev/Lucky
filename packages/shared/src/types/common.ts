/**
 * Common type definitions following TypeScript best practices
 * Prefer types over interfaces for better performance and consistency
 */

export type Result<T, E = Error> =
    | {
          readonly success: true
          readonly data: T
      }
    | {
          readonly success: false
          readonly error: E
      }

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

export type NonEmptyArray<T> = [T, ...T[]]

export type Brand<T, B> = T & { readonly __brand: B }

export type Timestamp = Brand<number, 'Timestamp'>

export type CorrelationId = Brand<string, 'CorrelationId'>

export type GuildId = Brand<string, 'GuildId'>

export type UserId = Brand<string, 'UserId'>

export type ChannelId = Brand<string, 'ChannelId'>

export type TrackId = Brand<string, 'TrackId'>

export type PlaylistId = Brand<string, 'PlaylistId'>
