import {
    GitBranch,
    Heart,
    History,
    LayoutDashboard,
    Layers,
    Link2,
    MessageSquare,
    MicVocal,
    Music,
    ScrollText,
    Settings,
    Shield,
    ShieldAlert,
    Star,
    Terminal,
    ToggleLeft,
    Trophy,
    Tv,
    Users,
    Disc3,
    Boxes,
} from 'lucide-react'
import type { AccessMode, ModuleKey } from '@/types'

export interface NavItem {
    path: string
    labelKey: string
    icon: React.ComponentType<{ className?: string }>
    module: ModuleKey
    requiredMode?: AccessMode
    badge?: number
}

export interface NavSection {
    titleKey: string
    items: NavItem[]
}

export const navSections: NavSection[] = [
    {
        titleKey: 'sidebar.sections.overview',
        items: [
            {
                path: '/',
                labelKey: 'sidebar.nav.dashboard',
                icon: LayoutDashboard,
                module: 'overview',
            },
            {
                path: '/settings',
                labelKey: 'sidebar.nav.serverSettings',
                icon: Settings,
                module: 'settings',
            },
        ],
    },
    {
        titleKey: 'sidebar.sections.moderation',
        items: [
            {
                path: '/moderation',
                labelKey: 'sidebar.nav.modCases',
                icon: Shield,
                module: 'moderation',
            },
            {
                path: '/automod',
                labelKey: 'sidebar.nav.autoModeration',
                icon: ShieldAlert,
                module: 'moderation',
            },
            {
                path: '/logs',
                labelKey: 'sidebar.nav.serverLogs',
                icon: ScrollText,
                module: 'moderation',
            },
        ],
    },
    {
        titleKey: 'sidebar.sections.automation',
        items: [
            {
                path: '/commands',
                labelKey: 'sidebar.nav.customCommands',
                icon: Terminal,
                module: 'automation',
            },
            {
                path: '/automessages',
                labelKey: 'sidebar.nav.autoMessages',
                icon: MessageSquare,
                module: 'automation',
            },
            {
                path: '/embed-builder',
                labelKey: 'sidebar.nav.embedBuilder',
                icon: Layers,
                module: 'automation',
            },
            {
                path: '/reaction-roles',
                labelKey: 'sidebar.nav.reactionRoles',
                icon: Link2,
                module: 'automation',
            },
            {
                path: '/role-groups',
                labelKey: 'sidebar.nav.roleGroups',
                icon: Boxes,
                module: 'automation',
            },
            {
                path: '/guild-automation',
                labelKey: 'sidebar.nav.guildAutomation',
                icon: GitBranch,
                module: 'settings',
                requiredMode: 'manage',
            },
            {
                path: '/roles',
                labelKey: 'sidebar.nav.roles',
                icon: Users,
                module: 'settings',
            },
        ],
    },
    {
        titleKey: 'sidebar.sections.community',
        items: [
            {
                path: '/levels',
                labelKey: 'sidebar.nav.levelSystem',
                icon: Trophy,
                module: 'settings',
            },
            {
                path: '/starboard',
                labelKey: 'sidebar.nav.starboard',
                icon: Star,
                module: 'settings',
            },
        ],
    },
    {
        titleKey: 'sidebar.sections.media',
        items: [
            {
                path: '/music',
                labelKey: 'sidebar.nav.musicPlayer',
                icon: Music,
                module: 'music',
            },
            {
                path: '/music/history',
                labelKey: 'sidebar.nav.trackHistory',
                icon: History,
                module: 'music',
            },
            {
                path: '/lyrics',
                labelKey: 'sidebar.nav.lyrics',
                icon: MicVocal,
                module: 'music',
            },
            {
                path: '/music/artists',
                labelKey: 'sidebar.nav.musicalTaste',
                icon: Heart,
                module: 'music',
            },
        ],
    },
    {
        titleKey: 'sidebar.sections.integrations',
        items: [
            {
                path: '/lastfm',
                labelKey: 'sidebar.nav.lastFm',
                icon: Disc3,
                module: 'integrations',
            },
            {
                path: '/twitch',
                labelKey: 'sidebar.nav.twitch',
                icon: Tv,
                module: 'integrations',
            },
            {
                path: '/features',
                labelKey: 'sidebar.nav.features',
                icon: ToggleLeft,
                module: 'automation',
            },
        ],
    },
]
