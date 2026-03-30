import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
    ChevronsUpDown,
    GitBranch,
    History,
    LayoutDashboard,
    Layers,
    Link2,
    LogOut,
    Menu,
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
    X,
    Disc3,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import { hasModuleAccess } from '@/lib/rbac'
import GuildSwitcher from './GuildSwitcher'
import type { AccessMode, ModuleKey } from '@/types'

interface NavItem {
    path: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    module: ModuleKey
    requiredMode?: AccessMode
    badge?: number
}

interface NavSection {
    title: string
    items: NavItem[]
}

const navSections: NavSection[] = [
    {
        title: 'Overview',
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
        title: 'Automation',
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
            {
                path: '/reaction-roles',
                label: 'Reaction Roles',
                icon: Link2,
                module: 'automation',
            },
            {
                path: '/guild-automation',
                label: 'Guild Automation',
                icon: GitBranch,
                module: 'settings',
                requiredMode: 'manage',
            },
        ],
    },
    {
        title: 'Community',
        items: [
            {
                path: '/levels',
                label: 'Level System',
                icon: Trophy,
                module: 'settings',
            },
            {
                path: '/starboard',
                label: 'Starboard',
                icon: Star,
                module: 'settings',
            },
        ],
    },
    {
        title: 'Media',
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
        ],
    },
    {
        title: 'Integrations',
        items: [
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
    const { selectedGuild, memberContext } = useGuildStore()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [switcherOpen, setSwitcherOpen] = useState(false)
    const prefersReducedMotion = useReducedMotion()

    useEffect(() => {
        setMobileOpen(false)
        setSwitcherOpen(false)
    }, [location.pathname])

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess

    const canViewModule = (
        module: ModuleKey,
        requiredMode: AccessMode = 'view',
    ) => {
        if (!selectedGuild || !effectiveAccess) return true
        return hasModuleAccess(effectiveAccess, module, requiredMode)
    }

    const profileName =
        memberContext?.nickname || user?.globalName || user?.username || 'User'
    const profileSubtitle = user?.username ? `@${user.username}` : 'Online'

    const guildIconSrc = selectedGuild?.icon
        ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
        : undefined

    const guildFallback = selectedGuild?.name
        ? selectedGuild.name.substring(0, 2).toUpperCase()
        : 'NS'

    const sidebarContent = (
        <div className='flex h-full flex-col'>
            <div className='border-b border-lucky-border px-4 py-3.5'>
                <div className='flex items-center gap-2.5 mb-2'>
                    <Avatar className='h-8 w-8 shrink-0'>
                        <AvatarImage
                            src={guildIconSrc}
                            alt={selectedGuild?.name || 'No server selected'}
                        />
                        <AvatarFallback className='bg-lucky-bg-active text-[11px] font-semibold text-lucky-text-primary'>
                            {guildFallback}
                        </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                        <p className='type-title truncate text-lucky-text-primary'>
                            {selectedGuild?.name || 'Lucky'}
                        </p>
                        <p className='text-[11px] truncate text-lucky-text-subtle leading-tight'>
                            {selectedGuild
                                ? 'Management Console'
                                : 'Select a server'}
                        </p>
                    </div>
                    <button
                        type='button'
                        className='lucky-focus-visible flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-lucky-text-subtle transition-colors hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary'
                        onClick={() => setSwitcherOpen(true)}
                        aria-label='Switch server'
                        title='Switch server'
                    >
                        <ChevronsUpDown
                            className='h-4 w-4'
                            aria-hidden='true'
                        />
                    </button>
                    <button
                        type='button'
                        className='lucky-focus-visible flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-tertiary transition-colors hover:text-lucky-text-primary lg:hidden'
                        onClick={() => setMobileOpen(false)}
                        aria-label='Close sidebar'
                    >
                        <X className='h-4 w-4' />
                    </button>
                </div>
            </div>

            <GuildSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />

            <ScrollArea className='flex-1 py-3'>
                <nav aria-label='Main navigation' className='space-y-5 px-2'>
                    {navSections.map((section) => (
                        <div key={section.title}>
                            <p
                                className='type-meta mb-1 px-2 text-lucky-text-subtle uppercase tracking-widest text-[10px] font-semibold'
                                aria-hidden='true'
                            >
                                {section.title}
                            </p>
                            <ul className='space-y-0.5' role='list'>
                                {section.items
                                    .filter((item) =>
                                        canViewModule(
                                            item.module,
                                            item.requiredMode,
                                        ),
                                    )
                                    .map((item) => {
                                        const active = isActive(item.path)
                                        return (
                                            <li key={item.path}>
                                                <Link
                                                    to={item.path}
                                                    aria-current={
                                                        active
                                                            ? 'page'
                                                            : undefined
                                                    }
                                                    className={cn(
                                                        'lucky-focus-visible group relative flex min-h-[36px] items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-120',
                                                        active
                                                            ? 'bg-lucky-bg-active text-lucky-text-primary'
                                                            : 'text-lucky-text-tertiary hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r transition-all duration-120',
                                                            active
                                                                ? 'bg-lucky-brand'
                                                                : 'bg-transparent',
                                                        )}
                                                        aria-hidden='true'
                                                    />
                                                    <item.icon
                                                        className={cn(
                                                            'h-4 w-4 shrink-0 transition-colors duration-120',
                                                            active
                                                                ? 'text-lucky-brand'
                                                                : 'text-lucky-text-subtle group-hover:text-lucky-text-tertiary',
                                                        )}
                                                        aria-hidden='true'
                                                    />
                                                    <span className='type-body-sm truncate'>
                                                        {item.label}
                                                    </span>
                                                    {item.badge !== undefined &&
                                                        item.badge > 0 && (
                                                            <span
                                                                className='ml-auto inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-lucky-brand px-1 text-[11px] font-semibold text-white'
                                                                aria-label={`${item.badge} notifications`}
                                                            >
                                                                {item.badge > 99
                                                                    ? '99+'
                                                                    : item.badge}
                                                            </span>
                                                        )}
                                                </Link>
                                            </li>
                                        )
                                    })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </ScrollArea>

            <div className='border-t border-lucky-border px-2 py-2'>
                <div className='flex items-center gap-2.5 rounded-md px-2 py-2'>
                    <Avatar className='h-7 w-7 shrink-0'>
                        <AvatarImage
                            src={
                                user?.avatar
                                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                                    : undefined
                            }
                            alt={profileName}
                        />
                        <AvatarFallback className='bg-lucky-bg-active text-[11px] font-semibold text-lucky-text-primary'>
                            {(user?.username || 'U')
                                .substring(0, 2)
                                .toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                        <p className='type-body-sm truncate text-lucky-text-primary leading-tight'>
                            {profileName}
                        </p>
                        <p className='text-[11px] truncate text-lucky-text-subtle leading-tight'>
                            {profileSubtitle}
                        </p>
                    </div>
                    <button
                        type='button'
                        onClick={logout}
                        className='lucky-focus-visible flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-lucky-text-subtle transition-colors hover:bg-lucky-error/10 hover:text-lucky-error'
                        aria-label='Log out'
                        title='Log out'
                    >
                        <LogOut className='h-3.5 w-3.5' aria-hidden='true' />
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            <button
                type='button'
                className='lucky-focus-visible fixed left-3 top-3 z-50 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-lucky-border bg-lucky-bg-secondary text-lucky-text-primary transition-colors hover:bg-lucky-bg-tertiary lg:hidden'
                onClick={() => setMobileOpen(true)}
                aria-label='Open navigation menu'
                aria-expanded={mobileOpen}
                aria-controls='mobile-sidebar'
            >
                <Menu className='h-5 w-5' aria-hidden='true' />
            </button>

            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            duration: prefersReducedMotion ? 0 : 0.15,
                        }}
                        className='fixed inset-0 z-40 bg-black/50 lg:hidden'
                        onClick={() => setMobileOpen(false)}
                        aria-hidden='true'
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {mobileOpen && (
                    <motion.aside
                        id='mobile-sidebar'
                        initial={
                            prefersReducedMotion
                                ? { opacity: 0 }
                                : { x: '-100%' }
                        }
                        animate={
                            prefersReducedMotion ? { opacity: 1 } : { x: 0 }
                        }
                        exit={
                            prefersReducedMotion
                                ? { opacity: 0 }
                                : { x: '-100%' }
                        }
                        transition={
                            prefersReducedMotion
                                ? { duration: 0.15 }
                                : {
                                      type: 'spring',
                                      stiffness: 300,
                                      damping: 30,
                                  }
                        }
                        className='fixed inset-y-0 left-0 z-50 w-64 bg-lucky-bg-secondary border-r border-lucky-border lg:hidden'
                        aria-label='Navigation sidebar'
                    >
                        {sidebarContent}
                    </motion.aside>
                )}
            </AnimatePresence>

            <aside
                className='hidden h-screen w-64 shrink-0 border-r border-lucky-border bg-lucky-bg-secondary lg:flex lg:sticky lg:top-0 lg:flex-col'
                aria-label='Navigation sidebar'
            >
                {sidebarContent}
            </aside>
        </>
    )
}

export default Sidebar
