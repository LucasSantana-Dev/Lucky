import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChevronDown } from 'lucide-react'

interface LayoutProps {
    children: ReactNode
}

interface RouteCopy {
    title: string
    subtitle: string
}

const ROUTE_COPY: Record<string, RouteCopy> = {
    '/': {
        title: 'Dashboard',
        subtitle:
            'Operational overview and key status signals for your server.',
    },
    '/servers': {
        title: 'Servers',
        subtitle:
            'Review installation status and manage your eligible communities.',
    },
    '/settings': {
        title: 'Server Settings',
        subtitle: 'Configure bot behaviour, channels, roles, and preferences.',
    },
    '/moderation': {
        title: 'Mod Cases',
        subtitle: 'Review and manage moderation actions for this server.',
    },
    '/automod': {
        title: 'Auto-Moderation',
        subtitle: 'Configure automated rule enforcement and filters.',
    },
    '/logs': {
        title: 'Server Logs',
        subtitle: 'Inspect audit events and bot activity records.',
    },
    '/commands': {
        title: 'Custom Commands',
        subtitle: 'Create and manage custom slash commands for this server.',
    },
    '/automessages': {
        title: 'Auto Messages',
        subtitle: 'Schedule recurring messages to any channel.',
    },
    '/embed-builder': {
        title: 'Embed Builder',
        subtitle: 'Design and send rich Discord embeds.',
    },
    '/reaction-roles': {
        title: 'Reaction Roles',
        subtitle: 'Assign roles based on member emoji reactions.',
    },
    '/guild-automation': {
        title: 'Guild Automation',
        subtitle: 'Configure automated guild management workflows.',
    },
    '/levels': {
        title: 'Level System',
        subtitle: 'Configure XP, level roles, and leaderboards.',
    },
    '/starboard': {
        title: 'Starboard',
        subtitle: 'Surface popular messages to a dedicated channel.',
    },
    '/lyrics': {
        title: 'Lyrics',
        subtitle: 'Fetch and display song lyrics in your server.',
    },
    '/lastfm': {
        title: 'Last.fm',
        subtitle: 'Control account linking and scrobble attribution behavior.',
    },
    '/twitch': {
        title: 'Twitch Notifications',
        subtitle: 'Post live alerts when tracked streamers go online.',
    },
    '/features': {
        title: 'Features',
        subtitle: 'Toggle bot feature modules for your server.',
    },
}

function getRouteCopy(pathname: string): RouteCopy {
    if (pathname.startsWith('/music/history')) {
        return {
            title: 'Track History',
            subtitle: 'Inspect recent playback and requester activity.',
        }
    }

    if (pathname.startsWith('/music')) {
        return {
            title: 'Music Player',
            subtitle:
                'Manage queue, autoplay, and real-time playback controls.',
        }
    }

    return (
        ROUTE_COPY[pathname] ?? {
            title: 'Lucky Dashboard',
            subtitle:
                'Configure modules, moderation, and engagement workflows.',
        }
    )
}

function GuildChip() {
    const { selectedGuild } = useGuildSelection()
    const navigate = useNavigate()

    if (!selectedGuild) {
        return (
            <button
                type='button'
                onClick={() => navigate('/servers')}
                className='lucky-focus-visible flex items-center gap-2 rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 px-3 py-2 text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary/80 hover:text-lucky-text-primary'
                aria-label='Select a server'
            >
                <span className='type-body-sm'>Select a server</span>
                <ChevronDown className='h-3.5 w-3.5 shrink-0 text-lucky-text-tertiary' />
            </button>
        )
    }

    return (
        <button
            type='button'
            onClick={() => navigate('/servers')}
            className='lucky-focus-visible flex items-center gap-2.5 rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 px-3 py-2 text-left transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary/80'
            aria-label={`Active server: ${selectedGuild.name}. Click to switch.`}
            title='Click to switch server'
        >
            <Avatar className='h-6 w-6 shrink-0'>
                <AvatarImage
                    src={
                        selectedGuild.icon
                            ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
                            : undefined
                    }
                    alt={selectedGuild.name}
                />
                <AvatarFallback className='bg-lucky-bg-active type-meta normal-case tracking-normal text-lucky-text-primary'>
                    {selectedGuild.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
                <p className='type-meta text-lucky-text-tertiary leading-none mb-0.5'>
                    Active server
                </p>
                <p className='type-body-sm truncate max-w-[160px] text-lucky-text-primary'>
                    {selectedGuild.name}
                </p>
            </div>
            <ChevronDown className='h-3.5 w-3.5 shrink-0 text-lucky-text-tertiary' />
        </button>
    )
}

function Layout({ children }: LayoutProps) {
    const location = useLocation()
    const routeCopy = getRouteCopy(location.pathname)

    return (
        <div className='lucky-shell flex min-h-screen'>
            <Sidebar />
            <div className='flex min-w-0 flex-1 flex-col'>
                <header className='sticky top-0 z-20 border-b border-lucky-border bg-lucky-bg-primary/80 backdrop-blur-md relative'>
                    <div className='mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-8'>
                        <div className='min-w-0 space-y-0.5'>
                            <p className='type-meta text-lucky-text-tertiary'>
                                Lucky control center
                            </p>
                            <h1 className='type-title text-lucky-text-primary leading-tight'>
                                {routeCopy.title}
                            </h1>
                            <p className='type-body-sm text-lucky-text-secondary hidden sm:block'>
                                {routeCopy.subtitle}
                            </p>
                        </div>
                        <GuildChip />
                    </div>
                    <div className='lucky-header-accent-line' aria-hidden='true' />
                </header>

                <main className='flex-1 min-w-0 overflow-y-auto'>
                    <div className='mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 lg:px-10'>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}

export default Layout
