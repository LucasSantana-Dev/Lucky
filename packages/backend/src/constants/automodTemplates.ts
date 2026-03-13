type TemplateSettings = {
    enabled: boolean
    spamEnabled: boolean
    spamThreshold: number
    spamTimeWindow: number
    capsEnabled: boolean
    capsThreshold: number
    linksEnabled: boolean
    allowedDomains: string[]
    invitesEnabled: boolean
    wordsEnabled: boolean
    bannedWords: string[]
}

export interface AutoModTemplate {
    id: string
    name: string
    description: string
    settings: TemplateSettings
}

const MALICIOUS_DOMAIN_BLOCKLIST = [
    'grabify.link',
    'iplogger.org',
    '2no.co',
    'yip.su',
    'blasze.com',
    'whereis.5july.net',
    'shorturl.at',
    'bitly.is',
    'freediscordnitro.com',
    'discrod-gift.com',
    'steamcomunnity.com',
    'stearncommunnity.com',
]

const BANNED_WORDS_BALANCED = [
    'kys',
    'kill yourself',
    'suicide bait',
    'nigger',
    'faggot',
    'retard',
    'ddos',
    'phishing',
    'token grabber',
    'nitro free',
    'free nitro',
    'scam link',
    'golpe',
    'phish',
    'roubar conta',
    'token steal',
    'vaza dados',
    'cp link',
    'malware',
    'keylogger',
]

export const AUTO_MOD_TEMPLATES: AutoModTemplate[] = [
    {
        id: 'balanced',
        name: 'Balanced Shield',
        description:
            'Balanced baseline for PT-BR + EN communities with common scam and abuse protection.',
        settings: {
            enabled: true,
            spamEnabled: true,
            spamThreshold: 6,
            spamTimeWindow: 8,
            capsEnabled: true,
            capsThreshold: 75,
            linksEnabled: true,
            allowedDomains: [
                'discord.com',
                'discord.gg',
                'youtube.com',
                'youtu.be',
                'spotify.com',
                'open.spotify.com',
                'twitch.tv',
                'github.com',
            ],
            invitesEnabled: true,
            wordsEnabled: true,
            bannedWords: [...BANNED_WORDS_BALANCED, ...MALICIOUS_DOMAIN_BLOCKLIST],
        },
    },
]

export function getAutoModTemplate(templateId: string): AutoModTemplate | null {
    return AUTO_MOD_TEMPLATES.find((template) => template.id === templateId) ?? null
}
