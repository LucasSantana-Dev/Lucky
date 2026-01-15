export * from './auth'
export * from './guild'
export * from './feature'

export interface Module {
    id: string
    name: string
    slug: string
    description: string
    enabled: boolean
    isNew?: boolean
    hasSettings: boolean
}

export interface Command {
    id: string
    name: string
    description: string
    enabled: boolean
    category: CommandCategory
    hasSettings: boolean
    hasHelp: boolean
}

export type CommandCategory =
    | 'Manager'
    | 'Misc'
    | 'Info'
    | 'Fun'
    | 'Moderator'
    | 'Roles'
    | 'Tags'
    | 'Slowmode'
    | 'Game'
    | 'Levels'

export interface EmbedField {
    id: string
    name: string
    value: string
    inline: boolean
}

export interface MessageEmbed {
    id: string
    name: string
    channel: string
    color?: string
    title?: string
    titleUrl?: string
    description?: string
    authorName?: string
    authorIcon?: string
    thumbnail?: string
    image?: string
    footer?: string
    footerIcon?: string
    fields: EmbedField[]
}

export interface Autorole {
    id: string
    role: string
    type: 'add' | 'remove'
    delay: number
}

export interface AutoMessage {
    id: string
    name: string
    channel: string
    content: string
    nextPost: Date
    interval: number
    isEmbed: boolean
}

export interface Tag {
    id: string
    name: string
    content: string
    createdBy: string
    createdAt: Date
}
