import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
    GitBranch,
    Heart,
    History,
    LayoutDashboard,
    Layers,
    Link2,
    Menu,
    MessageSquare,
    MicVocal,
    Music,
    ScrollText,
    Settings,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Star,
    Terminal,
    ToggleLeft,
    Trophy,
    Tv,
    Users,
    Disc3,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import { hasModuleAccess } from '@/lib/rbac'
import type { AccessMode, ModuleKey } from '@/types'

interface NavItem {
    path: string
    labelKey: string
    icon: React.ComponentType<{ className?: string }>
    module: ModuleKey
    requiredMode?: AccessMode
    badge?: number
}

interface NavSection {
    titleKey: string
    items: NavItem[]
}

const navSections: NavSection[] = [
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

interface NavSectionsProps {
    isActive: (path: string) => boolean
    canViewModule: (module: ModuleKey, requiredMode?: AccessMode) => boolean
    isDeveloper: boolean
}

function NavSections({
    isActive,
    canViewModule,
    isDeveloper,
}: NavSectionsProps) {
    const { t } = useTranslation()
    return (
        <ScrollArea className='flex-1 py-3'>
            <nav aria-label='Main navigation' className='space-y-4 px-2'>
                {navSections.map((section, index) => (
                    <div
                        key={section.titleKey}
                        className={cn(
                            index > 0 && 'border-t border-lucky-border/70 pt-4',
                        )}
                    >
                        <p
                            className='type-meta mb-2 px-2 text-lucky-text-subtle uppercase tracking-[0.22em] text-[10px] font-semibold'
                            aria-hidden='true'
                        >
                            {t(section.titleKey)}
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
                                    const label = t(item.labelKey)
                                    return (
                                        <li key={item.path}>
                                            <Link
                                                to={item.path}
                                                data-active={
                                                    active ? 'true' : 'false'
                                                }
                                                aria-current={
                                                    active ? 'page' : undefined
                                                }
                                                className={cn(
                                                    'lucky-focus-visible group relative flex min-h-[38px] items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-120',
                                                    active
                                                        ? 'border-lucky-brand/40 bg-lucky-bg-active text-lucky-text-primary shadow-[0_8px_24px_rgb(0_0_0/0.18)]'
                                                        : 'border-transparent text-lucky-text-tertiary hover:border-lucky-border hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary',
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
                                                <span className='type-body-sm truncate font-medium'>
                                                    {label}
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
                {isDeveloper && (
                    <div className='border-t border-lucky-border/70 pt-4'>
                        <p
                            className='type-meta mb-2 px-2 text-lucky-text-subtle uppercase tracking-[0.22em] text-[10px] font-semibold'
                            aria-hidden='true'
                        >
                            Admin
                        </p>
                        <ul className='space-y-0.5' role='list'>
                            <li>
                                <Link
                                    to='/admin'
                                    data-active={
                                        isActive('/admin') ? 'true' : 'false'
                                    }
                                    aria-current={
                                        isActive('/admin') ? 'page' : undefined
                                    }
                                    className={cn(
                                        'lucky-focus-visible group relative flex min-h-[38px] items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-120',
                                        isActive('/admin')
                                            ? 'border-lucky-brand/40 bg-lucky-bg-active text-lucky-text-primary shadow-[0_8px_24px_rgb(0_0_0/0.18)]'
                                            : 'border-transparent text-lucky-text-tertiary hover:border-lucky-border hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r transition-all duration-120',
                                            isActive('/admin')
                                                ? 'bg-lucky-brand'
                                                : 'bg-transparent',
                                        )}
                                        aria-hidden='true'
                                    />
                                    <ShieldCheck
                                        className={cn(
                                            'h-4 w-4 shrink-0 transition-colors duration-120',
                                            isActive('/admin')
                                                ? 'text-lucky-brand'
                                                : 'text-lucky-text-subtle group-hover:text-lucky-text-tertiary',
                                        )}
                                        aria-hidden='true'
                                    />
                                    <span className='type-body-sm truncate font-medium'>
                                        Admin Panel
                                    </span>
                                </Link>
                            </li>
                        </ul>
                    </div>
                )}
            </nav>
        </ScrollArea>
    )
}

function Sidebar() {
    const location = useLocation()
    const { isDeveloper } = useAuthStore()
    const { selectedGuild, memberContext } = useGuildStore()
    const [mobileOpen, setMobileOpen] = useState(false)
    const prefersReducedMotion = useReducedMotion()

    useEffect(() => {
        setMobileOpen(false)
    }, [location.pathname])

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        const exact = location.pathname === path
        const withChild = location.pathname.startsWith(path + '/')
        if (path === '/music' && location.pathname === '/music/artists') {
            return false
        }
        return exact || withChild
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

    const sidebarContent = (
        <div className='flex h-full flex-col'>
            <NavSections
                isActive={isActive}
                canViewModule={canViewModule}
                isDeveloper={isDeveloper}
            />
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
