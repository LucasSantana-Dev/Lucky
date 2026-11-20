export interface GuildChannelOption {
    id: string
    name: string
    /** Discord channel type (0 text, 5 announcement, 15 forum, 16 media). */
    type?: number
}

export interface GuildEmojiOption {
    id: string
    name: string
    animated: boolean
}
