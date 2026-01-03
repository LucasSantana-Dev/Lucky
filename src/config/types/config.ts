type Config = {
    TOKEN: string | undefined
    CLIENT_ID: string | undefined
    DISCORD_TOKEN: string | undefined
    COMMANDS_DISABLED: string[]
    COMMAND_CATEGORIES_DISABLED: string[]
    [key: string]: unknown
}

export function config(): Config {
    // Implementation moved to config.ts
    throw new Error('Use config() from config.ts instead')
}
