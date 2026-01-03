/**
 * Basic template literal types
 * Using existing types from discord.js where possible
 */

export type { Snowflake } from 'discord.js'

export type CommandName = `/${string}`

export type Environment = 'development' | 'production' | 'test'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export type FileExtension = `.${string}`

export type Url = `https://${string}` | `http://${string}`

export type DiscordId = string

export type CorrelationId = `corr_${string}`

export type ErrorCode = `ERR_${Uppercase<string>}`

export type EventName = `on${Capitalize<string>}`

export type HandlerName = `handle${Capitalize<string>}`

export type ServiceName = `${string}Service`

export type RepositoryName = `${string}Repository`

export type FactoryName = `create${Capitalize<string>}`
