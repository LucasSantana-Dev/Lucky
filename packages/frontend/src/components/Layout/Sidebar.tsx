import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Bot,
    LayoutDashboard,
    Shield,
    ShieldAlert,
    ScrollText,
    Terminal,
    MessageSquare,
    Music,
    ToggleLeft,
    LogOut,
    ChevronDown,
    Menu,
    X,
    Settings,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'

interface NavItem {
    path: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    badge?: number
}

interface NavSection {
    title: string
    items: NavItem[]
}

const navSections: NavSection[] = [
    {
        title: 'MAIN',
        items: [
            { path: '/', label: 'Dashboard', icon: LayoutDashboard },
            { path: '/settings', label: 'Server Settings', icon: Settings },
        ],
    },
    {
        title: 'MODERATION',
        items: [
            { path: '/moderation', label: 'Mod Cases', icon: Shield },
            { path: '/automod', label: 'Auto-Moderation', icon: ShieldAlert },
            { path: '/logs', label: 'Server Logs', icon: ScrollText },
        ],
    },
    {
        title: 'MANAGEMENT',
        items: [
            { path: '/commands', label: 'Custom Commands', icon: Terminal },
            {
                path: '/automessages',
                label: 'Auto Messages',
                icon: MessageSquare,
            },
        ],
    },
    {
        title: 'EXTRAS',
        items: [
            { path: '/music', label: 'Music Player', icon: Music },
            { path: '/features', label: 'Features', icon: ToggleLeft },
        ],
    },
]

function Sidebar() {
    const location = useLocation()
    const { user, logout } = useAuthStore()
    const { guilds, selectedGuild, selectGuild } = useGuildStore()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [serverDropdownOpen, setServerDropdownOpen] = useState(false)

    useEffect(() => {
        setMobileOpen(false)
    }, [location.pathname])

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    const botGuilds = guilds.filter((g) => g.botAdded)

    const sidebarContent = (
        <div className='flex flex-col h-full'>
            {/* Logo */}
            <div className='flex items-center gap-3 px-5 py-4 border-b border-lukbot-border'>
                <div className='w-9 h-9 bg-lukbot-red rounded-lg flex items-center justify-center shrink-0'>
                    <Bot className='w-5 h-5 text-white' />
                </div>
                <span className='text-lg font-bold text-white tracking-tight'>
                    LukBot
                </span>
                <button
                    className='ml-auto lg:hidden text-lukbot-text-secondary hover:text-white transition-colors'
                    onClick={() => setMobileOpen(false)}
                    aria-label='Close sidebar'
                >
                    <X className='w-5 h-5' />
                </button>
            </div>

            {/* Server Selector */}
            <div className='px-3 py-3 border-b border-lukbot-border'>
                <div className='relative'>
                    <button
                        onClick={() =>
                            setServerDropdownOpen(!serverDropdownOpen)
                        }
                        className='w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-lukbot-bg-tertiary hover:bg-lukbot-bg-active transition-colors text-left'
                    >
                        {selectedGuild ? (
                            <>
                                <Avatar className='w-7 h-7 shrink-0'>
                                    <AvatarImage
                                        src={
                                            selectedGuild.icon
                                                ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=64`
                                                : undefined
                                        }
                                    />
                                    <AvatarFallback className='bg-lukbot-bg-active text-white text-[10px]'>
                                        {selectedGuild.name
                                            .substring(0, 2)
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className='flex-1 text-sm font-medium text-white truncate'>
                                    {selectedGuild.name}
                                </span>
                            </>
                        ) : (
                            <span className='flex-1 text-sm text-lukbot-text-secondary'>
                                Select a server
                            </span>
                        )}
                        <ChevronDown
                            className={cn(
                                'w-4 h-4 text-lukbot-text-tertiary transition-transform shrink-0',
                                serverDropdownOpen && 'rotate-180',
                            )}
                        />
                    </button>

                    <AnimatePresence>
                        {serverDropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className='absolute left-0 right-0 top-full mt-1 z-50 bg-lukbot-bg-secondary border border-lukbot-border rounded-lg shadow-xl overflow-hidden'
                            >
                                <ScrollArea className='max-h-48'>
                                    {botGuilds.length === 0 ? (
                                        <div className='px-3 py-4 text-sm text-lukbot-text-tertiary text-center'>
                                            No servers with bot
                                        </div>
                                    ) : (
                                        botGuilds.map((guild) => (
                                            <button
                                                key={guild.id}
                                                onClick={() => {
                                                    selectGuild(guild)
                                                    setServerDropdownOpen(false)
                                                }}
                                                className={cn(
                                                    'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-lukbot-bg-tertiary transition-colors',
                                                    selectedGuild?.id ===
                                                        guild.id &&
                                                        'bg-lukbot-bg-active',
                                                )}
                                            >
                                                <Avatar className='w-6 h-6 shrink-0'>
                                                    <AvatarImage
                                                        src={
                                                            guild.icon
                                                                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
                                                                : undefined
                                                        }
                                                    />
                                                    <AvatarFallback className='bg-lukbot-bg-active text-white text-[9px]'>
                                                        {guild.name
                                                            .substring(0, 2)
                                                            .toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className='text-sm text-white truncate'>
                                                    {guild.name}
                                                </span>
                                                {selectedGuild?.id ===
                                                    guild.id && (
                                                    <div className='ml-auto w-1.5 h-1.5 rounded-full bg-lukbot-success shrink-0' />
                                                )}
                                            </button>
                                        ))
                                    )}
                                </ScrollArea>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className='flex-1 py-2'>
                <nav className='px-3 space-y-4'>
                    {navSections.map((section) => (
                        <div key={section.title}>
                            <div className='px-3 mb-1.5'>
                                <span className='text-[10px] font-semibold tracking-widest text-lukbot-text-tertiary uppercase'>
                                    {section.title}
                                </span>
                            </div>
                            <div className='space-y-0.5'>
                                {section.items.map((item) => {
                                    const active = isActive(item.path)
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={cn(
                                                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative group',
                                                active
                                                    ? 'bg-lukbot-red/10 text-white'
                                                    : 'text-lukbot-text-secondary hover:text-white hover:bg-lukbot-bg-tertiary',
                                            )}
                                        >
                                            {active && (
                                                <div className='absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-lukbot-red rounded-r-full' />
                                            )}
                                            <item.icon
                                                className={cn(
                                                    'w-[18px] h-[18px] shrink-0 transition-colors',
                                                    active
                                                        ? 'text-lukbot-red'
                                                        : 'text-lukbot-text-tertiary group-hover:text-lukbot-text-secondary',
                                                )}
                                            />
                                            <span className='truncate'>
                                                {item.label}
                                            </span>
                                            {item.badge !== undefined &&
                                                item.badge > 0 && (
                                                    <span className='ml-auto text-[10px] font-bold bg-lukbot-red text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1'>
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

            {/* User Profile */}
            <div className='px-3 py-3 border-t border-lukbot-border'>
                <div className='flex items-center gap-3 px-3 py-2'>
                    <Avatar className='w-8 h-8 shrink-0'>
                        <AvatarImage
                            src={
                                user?.avatar
                                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                                    : undefined
                            }
                        />
                        <AvatarFallback className='bg-lukbot-bg-active text-white text-xs'>
                            {(user?.username || 'U')
                                .substring(0, 2)
                                .toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium text-white truncate'>
                            {user?.username || 'User'}
                        </p>
                        <p className='text-[11px] text-lukbot-text-tertiary truncate'>
                            {user?.globalName || 'Online'}
                        </p>
                    </div>
                    <button
                        onClick={logout}
                        className='p-1.5 rounded-md text-lukbot-text-tertiary hover:text-lukbot-error hover:bg-lukbot-error/10 transition-colors'
                        aria-label='Logout'
                    >
                        <LogOut className='w-4 h-4' />
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* Mobile toggle */}
            <button
                className='fixed top-3 left-3 z-50 lg:hidden p-2 rounded-lg bg-lukbot-bg-secondary border border-lukbot-border text-white hover:bg-lukbot-bg-tertiary transition-colors'
                onClick={() => setMobileOpen(true)}
                aria-label='Open sidebar'
            >
                <Menu className='w-5 h-5' />
            </button>

            {/* Mobile overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden'
                        onClick={() => setMobileOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Mobile drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.aside
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 300,
                        }}
                        className='fixed inset-y-0 left-0 z-50 w-64 bg-lukbot-bg-secondary lg:hidden'
                    >
                        {sidebarContent}
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Desktop sidebar */}
            <aside className='hidden lg:flex w-64 shrink-0 bg-lukbot-bg-secondary border-r border-lukbot-border h-screen sticky top-0'>
                {sidebarContent}
            </aside>
        </>
    )
}

export default Sidebar
