import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronDown,
    History,
    LayoutDashboard,
    Layers,
    LogOut,
    Menu,
    MessageSquare,
    MicVocal,
    Music,
    ScrollText,
    Settings,
    Shield,
    ShieldAlert,
    Sparkles,
    Terminal,
    ToggleLeft,
    Tv,
    X,
    Disc3,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { hasModuleAccess } from '@/lib/rbac'
import type { ModuleKey } from '@/types'

interface NavItem {
    path: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    module: ModuleKey
    badge?: number
}

interface NavSection {
    title: string
    items: NavItem[]
}

const navSections: NavSection[] = [
    {
        title: 'Main',
        items: [
            {
                path: '/',
                label: 'Dashboard',
                icon: LayoutDashboard,
                module: 'overview',
            },
            {
                path: '/settings',
                label: 'Server Settings',
                icon: Settings,
                module: 'settings',
            },
        ],
    },
    {
        title: 'Moderation',
        items: [
            {
                path: '/moderation',
                label: 'Mod Cases',
                icon: Shield,
                module: 'moderation',
            },
            {
                path: '/automod',
                label: 'Auto-Moderation',
                icon: ShieldAlert,
                module: 'moderation',
            },
            {
                path: '/logs',
                label: 'Server Logs',
                icon: ScrollText,
                module: 'moderation',
            },
        ],
    },
    {
        title: 'Management',
        items: [
            {
                path: '/commands',
                label: 'Custom Commands',
                icon: Terminal,
                module: 'automation',
            },
            {
                path: '/automessages',
                label: 'Auto Messages',
                icon: MessageSquare,
                module: 'automation',
            },
            {
                path: '/embed-builder',
                label: 'Embed Builder',
                icon: Layers,
                module: 'automation',
            },
        ],
    },
    {
        title: 'Extras',
        items: [
            {
                path: '/music',
                label: 'Music Player',
                icon: Music,
                module: 'music',
            },
            {
                path: '/music/history',
                label: 'Track History',
                icon: History,
                module: 'music',
            },
            {
                path: '/lyrics',
                label: 'Lyrics',
                icon: MicVocal,
                module: 'music',
            },
            {
                path: '/lastfm',
                label: 'Last.fm',
                icon: Disc3,
                module: 'integrations',
            },
            {
                path: '/twitch',
                label: 'Twitch',
                icon: Tv,
                module: 'integrations',
            },
            {
                path: '/features',
                label: 'Features',
                icon: ToggleLeft,
                module: 'automation',
            },
        ],
    },
]

function Sidebar() {
    const location = useLocation()
    const { user, logout } = useAuthStore()
    const {
        guilds,
        selectedGuild,
        selectGuild,
        memberContext,
        guildLoadError,
        isLoading,
        fetchGuilds,
    } = useGuildStore()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [serverDropdownOpen, setServerDropdownOpen] = useState(false)

    useEffect(() => {
        setMobileOpen(false)
        setServerDropdownOpen(false)
    }, [location.pathname])

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess

    const canViewModule = (module: ModuleKey) => {
        if (!selectedGuild || !effectiveAccess) {
            return true
        }

        return hasModuleAccess(effectiveAccess, module, 'view')
    }

    const profileName =
        memberContext?.nickname || user?.globalName || user?.username || 'User'
    const profileSubtitle = user?.username ? `@${user.username}` : 'Online'
    const showReauth =
        guildLoadError?.kind === 'auth' || guildLoadError?.kind === 'forbidden'
    const discordAuthUrl = api.auth.getDiscordLoginUrl()

    let guildLoadErrorMessage = guildLoadError?.message ?? ''
    if (guildLoadError?.kind === 'forbidden') {
        guildLoadErrorMessage = 'Discord access is missing required scope.'
    } else if (guildLoadError?.kind === 'network') {
        guildLoadErrorMessage =
            'Network connection failed. Check connectivity and retry.'
    }

    const sidebarContent = (
        <div className='flex h-full flex-col'>
            <div className='border-b border-lucky-border px-4 py-4'>
                <div className='flex items-center gap-3'>
                    <img
                        src='/lucky-logo.png'
                        alt='Lucky'
                        className='h-10 w-10 rounded-xl object-cover ring-1 ring-lucky-border'
                    />
                    <div className='min-w-0'>
                        <p className='type-title truncate text-lucky-text-primary'>
                            Lucky
                        </p>
                        <p className='type-body-sm text-lucky-text-tertiary'>
                            Discord control center
                        </p>
                    </div>
                    <button
                        type='button'
                        className='lucky-focus-visible ml-auto rounded-lg p-1.5 text-lucky-text-secondary transition-colors hover:text-lucky-text-primary lg:hidden'
                        onClick={() => setMobileOpen(false)}
                        aria-label='Close sidebar'
                    >
                        <X className='h-4 w-4' />
                    </button>
                </div>
            </div>

            <div className='border-b border-lucky-border px-3 py-3'>
                <p className='type-meta mb-2 text-lucky-text-tertiary'>
                    Server context
                </p>
                <div className='relative'>
                    <button
                        type='button'
                        onClick={() => setServerDropdownOpen((value) => !value)}
                        aria-expanded={serverDropdownOpen}
                        aria-haspopup='menu'
                        className='lucky-focus-visible flex w-full items-center gap-3 rounded-xl border border-lucky-border bg-lucky-bg-tertiary/70 px-3 py-2.5 text-left transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-active/60'
                    >
                        {selectedGuild ? (
                            <>
                                <Avatar className='h-7 w-7 shrink-0'>
                                    <AvatarImage
                                        src={
                                            selectedGuild.icon
                                                ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
                                                : undefined
                                        }
                                    />
                                    <AvatarFallback className='bg-lucky-bg-active text-[10px] text-white'>
                                        {selectedGuild.name
                                            .substring(0, 2)
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className='type-body-sm flex-1 truncate text-lucky-text-primary'>
                                    {selectedGuild.name}
                                </span>
                            </>
                        ) : (
                            <span className='type-body-sm flex-1 text-lucky-text-secondary'>
                                Select a server
                            </span>
                        )}
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 shrink-0 text-lucky-text-tertiary transition-transform',
                                serverDropdownOpen && 'rotate-180',
                            )}
                        />
                    </button>

                    <AnimatePresence>
                        {serverDropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.14 }}
                                className='absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-lucky-border bg-lucky-bg-secondary shadow-2xl'
                            >
                                {guildLoadError && (
                                    <div className='space-y-2 border-b border-lucky-border px-3 py-3 text-center'>
                                        <p className='type-body-sm font-semibold text-lucky-text-primary'>
                                            Could not load servers
                                        </p>
                                        <p className='type-body-sm text-lucky-text-tertiary'>
                                            {guildLoadErrorMessage}
                                        </p>
                                        <div className='mt-3 flex items-center justify-center gap-2'>
                                            <button
                                                type='button'
                                                onClick={() => {
                                                    Promise.resolve(
                                                        fetchGuilds(true),
                                                    ).catch(() => {})
                                                }}
                                                className='lucky-focus-visible cursor-pointer rounded-md border border-lucky-border px-2.5 py-1 text-[11px] font-semibold text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary'
                                            >
                                                Retry
                                            </button>
                                            {showReauth && (
                                                <a
                                                    href={discordAuthUrl}
                                                    className='lucky-focus-visible rounded-md border border-lucky-border px-2.5 py-1 text-[11px] font-semibold text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary'
                                                >
                                                    Re-authenticate
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <ScrollArea className='max-h-56'>
                                    <div role='menu'>
                                        {guilds.length === 0 ? (
                                            <div className='space-y-2 px-3 py-4 text-center'>
                                                {!guildLoadError && (
                                                    <p className='type-body-sm text-lucky-text-tertiary'>
                                                        {isLoading
                                                            ? 'Loading servers...'
                                                            : 'No accessible servers found'}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            guilds.map((guild) => (
                                                <button
                                                    key={guild.id}
                                                    type='button'
                                                    role='menuitemradio'
                                                    aria-checked={
                                                        selectedGuild?.id ===
                                                        guild.id
                                                    }
                                                    onClick={() => {
                                                        selectGuild(guild)
                                                        setServerDropdownOpen(
                                                            false,
                                                        )
                                                    }}
                                                    className={cn(
                                                        'lucky-focus-visible flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-lucky-bg-tertiary/90',
                                                        selectedGuild?.id ===
                                                            guild.id &&
                                                            'bg-lucky-bg-active/70',
                                                    )}
                                                >
                                                    <Avatar className='h-6 w-6 shrink-0'>
                                                        <AvatarImage
                                                            src={
                                                                guild.icon
                                                                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
                                                                    : undefined
                                                            }
                                                        />
                                                        <AvatarFallback className='bg-lucky-bg-active text-[9px] text-white'>
                                                            {guild.name
                                                                .substring(0, 2)
                                                                .toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className='type-body-sm truncate text-lucky-text-primary'>
                                                        {guild.name}
                                                    </span>
                                                    <span className='ml-auto flex items-center gap-2'>
                                                        {!guild.botAdded && (
                                                            <span className='rounded-md border border-lucky-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-lucky-text-tertiary'>
                                                                Invite bot
                                                            </span>
                                                        )}
                                                        {selectedGuild?.id ===
                                                            guild.id && (
                                                            <Sparkles className='h-3.5 w-3.5 text-lucky-accent' />
                                                        )}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <ScrollArea className='flex-1 py-3'>
                <nav className='space-y-4 px-3'>
                    {navSections.map((section) => (
                        <div key={section.title}>
                            <p className='type-meta mb-2 px-2 text-lucky-text-tertiary'>
                                {section.title}
                            </p>
                            <div className='space-y-1'>
                                {section.items
                                    .filter((item) =>
                                        canViewModule(item.module),
                                    )
                                    .map((item) => {
                                        const active = isActive(item.path)
                                        return (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                data-active={
                                                    active ? 'true' : 'false'
                                                }
                                                className={cn(
                                                    'lucky-focus-visible group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
                                                    active
                                                        ? 'bg-lucky-bg-active/80 text-lucky-text-primary ring-1 ring-lucky-border-strong'
                                                        : 'text-lucky-text-secondary hover:bg-lucky-bg-tertiary/70 hover:text-lucky-text-primary',
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r',
                                                        active
                                                            ? 'bg-lucky-accent'
                                                            : 'bg-transparent',
                                                    )}
                                                />
                                                <item.icon
                                                    className={cn(
                                                        'h-[18px] w-[18px] shrink-0 transition-colors',
                                                        active
                                                            ? 'text-lucky-accent'
                                                            : 'text-lucky-text-tertiary group-hover:text-lucky-text-secondary',
                                                    )}
                                                />
                                                <span className='type-body-sm truncate'>
                                                    {item.label}
                                                </span>
                                                {item.badge !== undefined &&
                                                    item.badge > 0 && (
                                                        <span className='ml-auto inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-lucky-accent px-1 text-[10px] font-bold text-black'>
                                                            {item.badge > 99
                                                                ? '99+'
                                                                : item.badge}
                                                        </span>
                                                    )}
                                            </Link>
                                        )
                                    })}
                            </div>
                        </div>
                    ))}
                </nav>
            </ScrollArea>

            <div className='border-t border-lucky-border px-3 py-3'>
                <div className='surface-panel flex items-center gap-3 px-3 py-2.5'>
                    <Avatar className='h-8 w-8 shrink-0'>
                        <AvatarImage
                            src={
                                user?.avatar
                                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                                    : undefined
                            }
                        />
                        <AvatarFallback className='bg-lucky-bg-active text-xs text-white'>
                            {(user?.username || 'U')
                                .substring(0, 2)
                                .toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                        <p className='type-body-sm truncate text-lucky-text-primary'>
                            {profileName}
                        </p>
                        <p className='type-body-sm truncate text-lucky-text-tertiary'>
                            {profileSubtitle}
                        </p>
                    </div>
                    <button
                        type='button'
                        onClick={logout}
                        className='lucky-focus-visible cursor-pointer rounded-md p-1.5 text-lucky-text-tertiary transition-colors hover:bg-lucky-error/10 hover:text-lucky-error'
                        aria-label='Logout'
                    >
                        <LogOut className='h-4 w-4' />
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            <button
                type='button'
                className='lucky-focus-visible fixed left-3 top-3 z-50 rounded-lg border border-lucky-border bg-lucky-bg-secondary p-2 text-lucky-text-primary transition-colors hover:bg-lucky-bg-tertiary lg:hidden'
                onClick={() => setMobileOpen(true)}
                aria-label='Open sidebar'
            >
                <Menu className='h-5 w-5' />
            </button>

            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='fixed inset-0 z-40 bg-black/65 backdrop-blur-sm lg:hidden'
                        onClick={() => setMobileOpen(false)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {mobileOpen && (
                    <motion.aside
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 28,
                        }}
                        className='fixed inset-y-0 left-0 z-50 w-72 bg-lucky-bg-secondary lg:hidden'
                    >
                        {sidebarContent}
                    </motion.aside>
                )}
            </AnimatePresence>

            <aside className='hidden h-screen w-72 shrink-0 border-r border-lucky-border bg-lucky-bg-secondary lg:flex lg:sticky lg:top-0'>
                {sidebarContent}
            </aside>
        </>
    )
}

export default Sidebar
