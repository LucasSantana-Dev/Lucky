import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
    ChevronsUpDown,
    GitBranch,
    Heart,
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
import type {
    AccessMode,
    ModuleKey,
    Guild,
    User,
    GuildMemberContext,
} from '@/types'

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

function getGuildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=64`
}

function getUserAvatarUrl(userId: string, avatarHash: string): string {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`
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

interface GuildHeaderProps {
    selectedGuild: Guild | null
    onSwitchClick: () => void
    onMobileClose: () => void
    showMobileClose: boolean
}

function getGuildStatus(selectedGuild: Guild | null, t: TFunction) {
    if (!selectedGuild) {
        return {
            label: t('sidebar.status.selectServer'),
            tone: 'text-lucky-text-subtle bg-lucky-bg-tertiary border-lucky-border',
            subtitle: t('sidebar.subtitle.selectServer'),
        }
    }

    if (selectedGuild.botAdded === false) {
        return {
            label: t('sidebar.status.needsSetup'),
            tone: 'text-amber-200 bg-amber-500/10 border-amber-500/30',
            subtitle: t('sidebar.subtitle.needsSetup'),
        }
    }

    return {
        label: t('sidebar.status.ready'),
        tone: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30',
        subtitle: t('sidebar.subtitle.ready'),
    }
}

function GuildHeader({
    selectedGuild,
    onSwitchClick,
    onMobileClose,
    showMobileClose,
}: GuildHeaderProps) {
    const { t } = useTranslation()
    const guildIconSrc = selectedGuild?.icon
        ? getGuildIconUrl(selectedGuild.id, selectedGuild.icon)
        : undefined

    const guildFallback = selectedGuild?.name
        ? selectedGuild.name.substring(0, 2).toUpperCase()
        : 'NS'
    const status = getGuildStatus(selectedGuild, t)

    return (
        <div className='border-b border-lucky-border px-4 py-4'>
            <div className='rounded-xl border border-lucky-border bg-gradient-to-b from-lucky-bg-secondary to-lucky-bg-primary/80 px-3 py-3 shadow-[0_8px_24px_rgb(0_0_0/0.18)]'>
                <div className='mb-2 flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <p className='type-meta text-[10px] font-semibold uppercase tracking-[0.24em] text-lucky-text-subtle'>
                            {t('sidebar.activeGuild')}
                        </p>
                    </div>
                    {showMobileClose && (
                        <button
                            type='button'
                            className='lucky-focus-visible flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-lucky-text-tertiary transition-colors hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary lg:hidden'
                            onClick={onMobileClose}
                            aria-label={t('common.closeSidebar')}
                        >
                            <X className='h-4 w-4' />
                        </button>
                    )}
                </div>

                <div className='flex items-center gap-3'>
                    <Avatar className='h-10 w-10 shrink-0 ring-1 ring-lucky-border/80'>
                        <AvatarImage
                            src={guildIconSrc}
                            alt={selectedGuild?.name || 'No server selected'}
                        />
                        <AvatarFallback className='bg-lucky-bg-active text-xs font-semibold text-lucky-text-primary'>
                            {guildFallback}
                        </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                        <div className='mb-1 flex min-w-0 items-center gap-2'>
                            <p className='type-title truncate text-lucky-text-primary'>
                                {selectedGuild?.name || 'Lucky'}
                            </p>
                            <span
                                className={cn(
                                    'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                    status.tone,
                                )}
                            >
                                {status.label}
                            </span>
                        </div>
                        <p className='text-[12px] leading-snug text-lucky-text-subtle'>
                            {status.subtitle}
                        </p>
                    </div>
                </div>

                <div className='mt-3 flex items-center justify-between gap-2 border-t border-lucky-border/80 pt-3'>
                    <button
                        type='button'
                        className='lucky-focus-visible inline-flex min-h-[36px] items-center gap-2 rounded-md border border-lucky-border bg-lucky-bg-tertiary px-3 py-1.5 text-[12px] font-medium text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-active hover:text-lucky-text-primary'
                        onClick={onSwitchClick}
                        aria-label={t('sidebar.switchServer')}
                        title={t('sidebar.switchServer')}
                    >
                        <ChevronsUpDown
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                        />
                        <span>{t('sidebar.switchServer')}</span>
                    </button>

                    <p className='text-[11px] text-lucky-text-subtle'>
                        {t('sidebar.commandCenter')}
                    </p>
                </div>
            </div>
        </div>
    )
}

interface NavSectionsProps {
    isActive: (path: string) => boolean
    canViewModule: (module: ModuleKey, requiredMode?: AccessMode) => boolean
}

function NavSections({ isActive, canViewModule }: NavSectionsProps) {
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
            </nav>
        </ScrollArea>
    )
}

interface UserFooterProps {
    user: User | null
    memberContext: GuildMemberContext | null
    onLogout: () => void
}

function UserFooter({ user, memberContext, onLogout }: UserFooterProps) {
    const { t } = useTranslation()
    const profileName =
        memberContext?.nickname || user?.globalName || user?.username || 'User'
    const profileSubtitle = user?.username ? `@${user.username}` : 'Online'

    const userAvatarSrc = user?.avatar
        ? getUserAvatarUrl(user.id, user.avatar)
        : undefined

    return (
        <div className='border-t border-lucky-border px-2 py-2'>
            <div className='flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-2'>
                <Avatar className='h-7 w-7 shrink-0'>
                    <AvatarImage src={userAvatarSrc} alt={profileName} />
                    <AvatarFallback className='bg-lucky-bg-active text-[11px] font-semibold text-lucky-text-primary'>
                        {(user?.username || 'U').substring(0, 2).toUpperCase()}
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
                    onClick={onLogout}
                    className='lucky-focus-visible flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-lucky-text-subtle transition-colors hover:bg-lucky-error/10 hover:text-lucky-error'
                    aria-label={t('common.logout')}
                    title={t('common.logout')}
                >
                    <LogOut className='h-3.5 w-3.5' aria-hidden='true' />
                </button>
            </div>
        </div>
    )
}

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
            <GuildHeader
                selectedGuild={selectedGuild}
                onSwitchClick={() => setSwitcherOpen(true)}
                onMobileClose={() => setMobileOpen(false)}
                showMobileClose={true}
            />

            <GuildSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />

            <NavSections isActive={isActive} canViewModule={canViewModule} />

            <UserFooter
                user={user}
                memberContext={memberContext}
                onLogout={logout}
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
