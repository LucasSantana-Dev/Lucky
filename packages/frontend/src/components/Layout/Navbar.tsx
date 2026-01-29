import { useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/authStore'
import ProfileModal from '@/components/ProfileModal'

export default function Navbar() {
    const user = useAuthStore((state) => state.user)
    const location = useLocation()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

    const navItems = [
        { path: '/', label: 'Dashboard' },
        { path: '/servers', label: 'Servers' },
        { path: '/features', label: 'Features' },
        { path: '/config', label: 'Configuration' },
    ]

    const isActive = useCallback(
        (path: string) => {
            if (path === '/') {
                return location.pathname === '/'
            }
            return location.pathname.startsWith(path)
        },
        [location.pathname],
    )

    const handleProfileClick = useCallback(() => {
        setIsProfileModalOpen(true)
    }, [])

    const handleMobileMenuToggle = useCallback(() => {
        setIsMobileMenuOpen((prev) => !prev)
    }, [])

    const handleMobileMenuClose = useCallback(() => {
        setIsMobileMenuOpen(false)
    }, [])

    return (
        <>
            <nav className='h-16 bg-bg-secondary border-b border-bg-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-40'>
                <div className='flex items-center gap-6'>
                    <Link
                        to='/'
                        className='text-xl font-bold text-text-primary hover:text-primary transition-colors'
                    >
                        LukBot
                    </Link>
                    <nav className='hidden md:flex items-center gap-1' aria-label='Main navigation'>
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    isActive(item.path)
                                        ? 'bg-primary text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
                                )}
                                aria-current={isActive(item.path) ? 'page' : undefined}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className='flex items-center gap-4'>
                    <button
                        onClick={handleProfileClick}
                        className='flex items-center gap-2 p-2 rounded-lg hover:bg-bg-tertiary transition-colors'
                        aria-label='Open profile menu'
                        aria-expanded={isProfileModalOpen}
                    >
                        <Avatar className='w-8 h-8 border border-bg-border'>
                            <AvatarImage
                                src={
                                    user?.avatar
                                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                                        : undefined
                                }
                                alt={user?.username || 'User avatar'}
                            />
                            <AvatarFallback className='bg-primary text-white text-xs'>
                                {user?.username?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </button>

                    <button
                        onClick={handleMobileMenuToggle}
                        className='md:hidden p-2 rounded-lg hover:bg-bg-tertiary transition-colors'
                        aria-label='Toggle mobile menu'
                        aria-expanded={isMobileMenuOpen}
                    >
                        {isMobileMenuOpen ? (
                            <X className='w-5 h-5 text-text-primary' aria-hidden='true' />
                        ) : (
                            <Menu className='w-5 h-5 text-text-primary' aria-hidden='true' />
                        )}
                    </button>
                </div>
            </nav>

            {isMobileMenuOpen && (
                <div className='md:hidden bg-bg-secondary border-b border-bg-border'>
                    <nav className='px-4 py-2 space-y-1' aria-label='Mobile navigation'>
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={handleMobileMenuClose}
                                className={cn(
                                    'block px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    isActive(item.path)
                                        ? 'bg-primary text-white'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
                                )}
                                aria-current={isActive(item.path) ? 'page' : undefined}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            )}

            <ProfileModal
                open={isProfileModalOpen}
                onOpenChange={setIsProfileModalOpen}
            />
        </>
    )
}
