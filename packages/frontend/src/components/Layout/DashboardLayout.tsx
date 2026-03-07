import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
    Bot,
    LayoutDashboard,
    Shield,
    Menu,
    X,
    LogOut,
    ChevronDown,
    Gift,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'

interface NavItem {
    name: string
    path: string
    icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Features', path: '/features', icon: Shield },
]

export default function DashboardLayout() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, logout, isAuthenticated } = useAuthStore()
    const { selectedGuild, guilds, selectGuild, fetchGuilds } = useGuildStore()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/')
        } else {
            fetchGuilds()
        }
    }, [isAuthenticated, navigate, fetchGuilds])

    const handleLogout = () => {
        logout()
        navigate('/')
    }

    const isActivePath = (path: string) => {
        return (
            location.pathname === path ||
            location.pathname.startsWith(path + '/')
        )
    }

    return (
        <div className='min-h-screen bg-nexus-bg-primary flex'>
            {sidebarOpen && (
                <div
                    className='fixed inset-0 bg-black/50 z-40 lg:hidden'
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 w-64 bg-nexus-bg-primary border-r border-nexus-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <div className='flex flex-col h-full'>
                    <div className='flex items-center justify-between p-4 border-b border-nexus-border'>
                        <div className='flex items-center gap-2'>
                            <div className='w-10 h-10 bg-nexus-red rounded-lg flex items-center justify-center'>
                                <Bot className='w-6 h-6 text-white' />
                            </div>
                            <span className='text-xl font-bold text-white'>
                                Nexus
                            </span>
                        </div>
                        <button
                            className='lg:hidden text-nexus-text-secondary hover:text-white'
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className='w-5 h-5' />
                        </button>
                    </div>

                    <ScrollArea className='flex-1 py-4'>
                        <nav className='space-y-1 px-3'>
                            {navItems.map((item) => (
                                <button
                                    key={item.path}
                                    onClick={() => {
                                        navigate(item.path)
                                        setSidebarOpen(false)
                                    }}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                        isActivePath(item.path)
                                            ? 'bg-nexus-bg-active text-white'
                                            : 'text-nexus-text-secondary hover:text-white hover:bg-nexus-bg-tertiary',
                                    )}
                                >
                                    <item.icon className='w-5 h-5' />
                                    <span className='flex-1 text-left'>
                                        {item.name}
                                    </span>
                                </button>
                            ))}
                        </nav>
                    </ScrollArea>

                    <div className='p-4 border-t border-nexus-border'>
                        <div className='bg-linear-to-r from-nexus-purple/20 to-nexus-blue/20 rounded-lg p-4 border border-nexus-purple/30'>
                            <div className='flex items-center gap-2 mb-2'>
                                <Gift className='w-5 h-5 text-nexus-purple' />
                                <span className='font-semibold text-white'>
                                    Need Help?
                                </span>
                            </div>
                            <p className='text-xs text-nexus-text-secondary mb-3'>
                                Join our Discord for support and updates
                            </p>
                            <Button
                                size='sm'
                                className='w-full bg-nexus-purple hover:bg-nexus-purple/90 text-white'
                            >
                                Join Discord
                            </Button>
                        </div>
                    </div>
                </div>
            </aside>

            <div className='flex-1 flex flex-col min-w-0'>
                <header className='sticky top-0 z-30 bg-nexus-bg-primary border-b border-nexus-border px-4 py-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-4'>
                            <button
                                className='lg:hidden text-nexus-text-secondary hover:text-white'
                                onClick={() => setSidebarOpen(true)}
                            >
                                <Menu className='w-6 h-6' />
                            </button>

                            {selectedGuild && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant='ghost'
                                            className='flex items-center gap-2 px-2 hover:bg-nexus-bg-tertiary'
                                        >
                                            <Avatar className='w-8 h-8'>
                                                <AvatarImage
                                                    src={
                                                        selectedGuild.icon ||
                                                        undefined
                                                    }
                                                />
                                                <AvatarFallback className='bg-nexus-bg-tertiary text-white text-xs'>
                                                    {selectedGuild.name
                                                        .substring(0, 2)
                                                        .toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className='font-medium text-white hidden sm:inline'>
                                                {selectedGuild.name}
                                            </span>
                                            <ChevronDown className='w-4 h-4 text-nexus-text-secondary' />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align='start'
                                        className='w-64 bg-nexus-bg-secondary border-nexus-border'
                                    >
                                        {guilds
                                            .filter((g) => g.botAdded)
                                            .map((guild) => (
                                                <DropdownMenuItem
                                                    key={guild.id}
                                                    onClick={() =>
                                                        selectGuild(guild)
                                                    }
                                                    className={cn(
                                                        'flex items-center gap-2 cursor-pointer',
                                                        selectedGuild?.id ===
                                                            guild.id &&
                                                            'bg-nexus-bg-active',
                                                    )}
                                                >
                                                    <Avatar className='w-6 h-6'>
                                                        <AvatarImage
                                                            src={
                                                                guild.icon ||
                                                                undefined
                                                            }
                                                        />
                                                        <AvatarFallback className='bg-nexus-bg-tertiary text-white text-xs'>
                                                            {guild.name
                                                                .substring(0, 2)
                                                                .toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className='truncate'>
                                                        {guild.name}
                                                    </span>
                                                </DropdownMenuItem>
                                            ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>

                        <div className='flex items-center gap-3'>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant='ghost'
                                        className='flex items-center gap-2 px-2 hover:bg-nexus-bg-tertiary'
                                    >
                                        <Avatar className='w-8 h-8'>
                                            <AvatarImage
                                                src={user?.avatar || undefined}
                                            />
                                            <AvatarFallback className='bg-nexus-red text-white'>
                                                {user?.username
                                                    ?.substring(0, 2)
                                                    .toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className='text-sm font-medium text-white hidden sm:inline'>
                                            @{user?.username}
                                        </span>
                                        <LogOut className='w-4 h-4 text-nexus-text-secondary' />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align='end'
                                    className='w-48 bg-nexus-bg-secondary border-nexus-border'
                                >
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className='text-nexus-error cursor-pointer'
                                    >
                                        <LogOut className='w-4 h-4 mr-2' />
                                        Sign Out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </header>

                <main className='flex-1 overflow-auto p-4 md:p-6'>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
