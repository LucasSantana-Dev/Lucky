import { Bot, LayoutDashboard, Shield, X, HelpCircle } from 'lucide-react'
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
                'fixed inset-y-0 left-0 z-50 w-60 bg-lucky-bg-secondary border-r border-lucky-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            )}
        >
            <div className='flex flex-col h-full'>
                <div className='flex items-center justify-between px-4 py-3.5 border-b border-lucky-border'>
                    <div className='flex items-center gap-2.5'>
                        <div className='w-8 h-8 bg-lucky-brand rounded-lg flex items-center justify-center'>
                            <Bot className='w-4.5 h-4.5 text-white' />
                        </div>
                        <span className='type-title text-lucky-text-primary'>
                            Lucky
                        </span>
                    </div>
                    <button
                        className='lg:hidden text-lucky-text-subtle hover:text-lucky-text-primary transition-colors'
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X className='w-4 h-4' />
                    </button>
                </div>

                <ScrollArea className='flex-1 py-3'>
                    <nav className='space-y-0.5 px-2'>
                        {navItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => {
                                    navigate(item.path)
                                    setSidebarOpen(false)
                                }}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-2 py-2 rounded-md type-body-sm font-medium transition-colors',
                                    isActivePath(item.path)
                                        ? 'bg-lucky-bg-active text-lucky-text-primary'
                                        : 'text-lucky-text-tertiary hover:text-lucky-text-primary hover:bg-lucky-bg-tertiary',
                                )}
                            >
                                <item.icon className='w-4 h-4' />
                                <span className='flex-1 text-left'>
                                    {item.name}
                                </span>
                            </button>
                        ))}
                    </nav>
                </ScrollArea>

                <div className='p-3 border-t border-lucky-border'>
                    <div className='bg-lucky-bg-tertiary rounded-lg p-3.5 border border-lucky-border'>
                        <div className='flex items-center gap-2 mb-2'>
                            <HelpCircle className='w-4 h-4 text-lucky-text-tertiary' />
                            <span className='type-body-sm font-semibold text-lucky-text-primary'>
                                Need Help?
                            </span>
                        </div>
                        <p className='text-[12px] text-lucky-text-tertiary mb-3'>
                            Join our Discord for support and updates
                        </p>
                        <Button
                            size='sm'
                            variant='primary'
                            className='w-full'
                        >
                            Join Discord
                        </Button>
                    </div>
                </div>
            </div>
        </aside>
    )
}
