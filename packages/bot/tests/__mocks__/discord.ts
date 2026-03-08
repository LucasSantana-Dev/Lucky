import type {
    ChatInputCommandInteraction,
    GuildMember,
    VoiceChannel,
    TextChannel,
    User,
    Guild,
} from 'discord.js'

export function createMockUser(overrides: Partial<User> = {}): User {
    return {
        id: '123456789',
        username: 'TestUser',
        discriminator: '0001',
        tag: 'TestUser#0001',
        bot: false,
        toString: () => '<@123456789>',
        ...overrides,
    } as unknown as User
}

export function createMockGuild(overrides: Partial<Guild> = {}): Guild {
    return {
        id: '987654321',
        name: 'Test Guild',
        ...overrides,
    } as unknown as Guild
}

export function createMockVoiceChannel(
    overrides: Partial<VoiceChannel> = {},
): VoiceChannel {
    return {
        id: '111222333',
        name: 'General',
        type: 2,
        guild: createMockGuild(),
        joinable: true,
        ...overrides,
    } as unknown as VoiceChannel
}

export function createMockTextChannel(
    overrides: Partial<TextChannel> = {},
): TextChannel {
    return {
        id: '444555666',
        name: 'bot-commands',
        type: 0,
        send: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as TextChannel
}

export function createMockMember(
    overrides: Partial<GuildMember> = {},
): GuildMember {
    return {
        id: '123456789',
        user: createMockUser(),
        voice: {
            channel: createMockVoiceChannel(),
            channelId: '111222333',
        },
        guild: createMockGuild(),
        ...overrides,
    } as unknown as GuildMember
}

export function createMockInteraction(
    overrides: Record<string, unknown> = {},
): ChatInputCommandInteraction {
    const replied = { value: false }
    const deferred = { value: false }

    return {
        guildId: '987654321',
        guild: createMockGuild(),
        member: createMockMember(),
        user: createMockUser(),
        channel: createMockTextChannel(),
        options: {
            getString: jest.fn().mockReturnValue('test query'),
            getInteger: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(null),
            getSubcommand: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn().mockImplementation(() => {
            replied.value = true
            return Promise.resolve()
        }),
        editReply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockImplementation(() => {
            deferred.value = true
            return Promise.resolve()
        }),
        followUp: jest.fn().mockResolvedValue(undefined),
        get replied() {
            return replied.value
        },
        get deferred() {
            return deferred.value
        },
        isRepliable: () => true,
        isChatInputCommand: () => true,
        ...overrides,
    } as unknown as ChatInputCommandInteraction
}
