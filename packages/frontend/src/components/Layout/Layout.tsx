import { type MouseEvent, type ReactNode, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import VoteBadge from './VoteBadge'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { getUserAvatarUrl } from '@/lib/discord'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import { ChevronDown, LogOut } from 'lucide-react'

interface LayoutProps {
    children: ReactNode
}

interface RouteCopy {
    title: string
    subtitle: string
}

const ROUTE_KEYS: Record<string, string> = {
    '/': 'dashboard',
    '/servers': 'servers',
    '/settings': 'serverSettings',
    '/moderation': 'moderation',
    '/automod': 'autoMod',
    '/logs': 'serverLogs',
    '/commands': 'customCommands',
    '/automessages': 'autoMessages',
    '/embed-builder': 'embedBuilder',
    '/reaction-roles': 'reactionRoles',
    '/guild-automation': 'guildAutomation',
    '/levels': 'levels',
    '/starboard': 'starboard',
    '/lyrics': 'lyrics',
    '/lastfm': 'lastFm',
    '/spotify': 'spotify',
    '/twitch': 'twitch',
    '/features': 'features',
}

function useRouteCopy(pathname: string): RouteCopy {
    const { t } = useTranslation()

    let key: string
    if (pathname.startsWith('/music/history')) {
        key = 'trackHistory'
    } else if (pathname.startsWith('/music/artists')) {
        key = 'preferredArtists'
    } else if (pathname.startsWith('/music')) {
        key = 'music'
    } else {
        key = ROUTE_KEYS[pathname] ?? 'fallback'
    }

    return {
        title: t(`layout.routes.${key}.title`),
        subtitle: t(`layout.routes.${key}.subtitle`),
    }
}

function GuildChip() {
    const { selectedGuild } = useGuildSelection()
    const navigate = useNavigate()
    const { t } = useTranslation()

    if (!selectedGuild) {
        return (
            <button
                type='button'
                onClick={() => navigate('/servers')}
                className='lucky-focus-visible flex items-center gap-2 rounded-md border border-lucky-border bg-lucky-bg-secondary px-3 py-1.5 text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary'
                aria-label={t('common.selectServer')}
            >
                <span className='type-body-sm'>{t('common.selectServer')}</span>
                <ChevronDown className='h-3.5 w-3.5 shrink-0 text-lucky-text-subtle' />
            </button>
        )
    }

    return (
        <button
            type='button'
            onClick={() => navigate('/servers')}
            className='lucky-focus-visible flex items-center gap-2 rounded-md border border-lucky-border bg-lucky-bg-secondary px-3 py-1.5 text-left transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary'
            aria-label={t('common.activeServerAriaLabel', {
                name: selectedGuild.name,
            })}
            title={t('sidebar.switchServer')}
        >
            <Avatar className='h-5 w-5 shrink-0'>
                <AvatarImage
                    src={
                        selectedGuild.icon
                            ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
                            : undefined
                    }
                    alt={selectedGuild.name}
                />
                <AvatarFallback className='bg-lucky-bg-active text-[9px] font-semibold text-lucky-text-primary'>
                    {selectedGuild.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <p className='type-body-sm truncate max-w-[140px] text-lucky-text-primary'>
                {selectedGuild.name}
            </p>
            <ChevronDown className='h-3.5 w-3.5 shrink-0 text-lucky-text-subtle' />
        </button>
    )
}

function UserMenu() {
    const { user, logout } = useAuthStore()
    const { memberContext } = useGuildStore()
    const { t } = useTranslation()
    const profileName =
        memberContext?.nickname || user?.globalName || user?.username || 'User'
    const avatarSrc =
        user?.avatar && user?.id
            ? getUserAvatarUrl(user.id, user.avatar)
            : undefined

    return (
        <div className='flex items-center gap-2 rounded-md border border-lucky-border bg-lucky-bg-secondary px-2 py-1'>
            <Avatar className='h-6 w-6 shrink-0'>
                <AvatarImage src={avatarSrc} alt={profileName} />
                <AvatarFallback className='bg-lucky-bg-active text-[10px] font-semibold text-lucky-text-primary'>
                    {(user?.username || 'U').substring(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <span className='type-body-sm hidden max-w-[120px] truncate text-lucky-text-primary sm:block'>
                {profileName}
            </span>
            <button
                type='button'
                onClick={logout}
                className='lucky-focus-visible flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md text-lucky-text-subtle transition-colors hover:bg-lucky-error/10 hover:text-lucky-error'
                aria-label={t('common.logout')}
                title={t('common.logout')}
            >
                <LogOut className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
        </div>
    )
}

function Layout({ children }: LayoutProps) {
    const location = useLocation()
    const routeCopy = useRouteCopy(location.pathname)
    const mainRef = useRef<HTMLElement>(null)

    const handleSkipLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault()
        mainRef.current?.focus({ preventScroll: true })
    }

    return (
        <div className='lucky-shell lucky-shell-authenticated flex min-h-screen'>
            <a
                className='lucky-skip-link'
                href='#lucky-main-content'
                onClick={handleSkipLinkClick}
            >
                Skip to content
            </a>
            <Sidebar />
            <div className='flex min-w-0 flex-1 flex-col'>
                <header className='lucky-shell-header sticky top-0 z-30 border-b border-lucky-border bg-lucky-bg-primary relative'>
                    <div className='mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3.5 md:px-6 md:py-4'>
                        <div className='min-w-0'>
                            <h1 className='type-title text-lucky-text-primary leading-tight'>
                                {routeCopy.title}
                            </h1>
                            <p className='type-body-sm text-lucky-text-tertiary hidden sm:block'>
                                {routeCopy.subtitle}
                            </p>
                        </div>
                        <div className='flex items-center gap-2'>
                            <VoteBadge />
                            <LanguageSwitcher />
                            <GuildChip />
                            <UserMenu />
                        </div>
                    </div>
                    <div
                        className='lucky-header-accent-line'
                        aria-hidden='true'
                    />
                </header>

                <main
                    ref={mainRef}
                    id='lucky-main-content'
                    className='flex-1 min-w-0 overflow-y-auto'
                    tabIndex={-1}
                >
                    <div className='mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 lg:px-8 lg:py-7'>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}

export default Layout
