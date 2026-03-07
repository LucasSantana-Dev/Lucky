import { Bot, LayoutDashboard, Shield, X, Gift } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface DashboardSidebarProps {
    sidebarOpen: boolean
    setSidebarOpen: (open: boolean) => void
}

export default function DashboardSidebar({
    sidebarOpen,
    setSidebarOpen,
}: DashboardSidebarProps) {
    const navigate = useNavigate()
    const location = useLocation()

    const isActivePath = (path: string) =>
        location.pathname === path || location.pathname.startsWith(path + '/')

    return (
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
    )
}
