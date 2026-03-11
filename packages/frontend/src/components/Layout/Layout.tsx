import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useGuildStore } from '@/stores/guildStore'

interface LayoutProps {
    children: ReactNode
}

interface RouteCopy {
    title: string
    subtitle: string
}

const ROUTE_COPY: Record<string, RouteCopy> = {
    '/': {
        title: 'Dashboard',
        subtitle: 'Operational overview and key status signals for your server.',
    },
    '/servers': {
        title: 'Servers',
        subtitle: 'Review installation status and manage your eligible communities.',
    },
    '/lastfm': {
        title: 'Last.fm',
        subtitle: 'Control account linking and scrobble attribution behavior.',
    },
}

function getRouteCopy(pathname: string): RouteCopy {
    if (pathname.startsWith('/music/history')) {
        return {
            title: 'Track History',
            subtitle: 'Inspect recent playback and requester activity.',
        }
    }

    if (pathname.startsWith('/music')) {
        return {
            title: 'Music Player',
            subtitle: 'Manage queue, autoplay, and real-time playback controls.',
        }
    }

    return ROUTE_COPY[pathname] ?? {
        title: 'Lucky Dashboard',
        subtitle: 'Configure modules, moderation, and engagement workflows.',
    }
}

function Layout({ children }: LayoutProps) {
    const location = useLocation()
    const { selectedGuild } = useGuildStore()
    const routeCopy = getRouteCopy(location.pathname)

    return (
        <div className='lucky-shell flex min-h-screen'>
            <Sidebar />
            <div className='flex min-w-0 flex-1 flex-col'>
                <header className='sticky top-0 z-20 border-b border-lucky-border bg-lucky-bg-primary/70 backdrop-blur'>
                    <div className='mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-8'>
                        <div className='space-y-1'>
                            <p className='type-meta text-lucky-text-tertiary'>Lucky control center</p>
                            <h1 className='type-title text-lucky-text-primary'>{routeCopy.title}</h1>
                            <p className='type-body-sm text-lucky-text-secondary'>{routeCopy.subtitle}</p>
                        </div>
                        {selectedGuild && (
                            <div className='surface-panel min-w-[220px] px-4 py-2.5'>
                                <p className='type-meta text-lucky-text-tertiary'>Active server</p>
                                <p className='type-body-sm truncate text-lucky-text-primary'>
                                    {selectedGuild.name}
                                </p>
                            </div>
                        )}
                    </div>
                </header>

                <main className='flex-1 min-w-0 overflow-y-auto'>
                    <div className='mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 lg:px-10'>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}

export default Layout
