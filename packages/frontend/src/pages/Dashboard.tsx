import { useNavigate } from 'react-router-dom'
import { FolderKanban, Server } from 'lucide-react'
import Button from '@/components/ui/Button'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function DashboardPage() {
    const navigate = useNavigate()
    const { selectedGuild } = useGuildSelection()
    usePageMetadata({
        title: 'Dashboard - LukBot',
        description: 'Manage your Discord bot servers and settings',
    })

    if (!selectedGuild) {
        return (
            <main className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <div className='w-24 h-24 bg-lukbot-bg-tertiary rounded-2xl flex items-center justify-center mb-4'>
                    <FolderKanban
                        className='w-12 h-12 text-lukbot-text-tertiary'
                        aria-hidden='true'
                    />
                </div>
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lukbot-text-secondary mb-4'>
                    Select a server from the dropdown above to manage it
                </p>
                <Button
                    onClick={() => navigate('/servers')}
                    className='bg-lukbot-red hover:bg-lukbot-red/90'
                >
                    View Your Servers
                </Button>
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <header>
                <h1 className='text-2xl font-bold text-white mb-4'>Dashboard</h1>
            </header>
            <section aria-labelledby='server-grid-heading'>
                <h2 id='server-grid-heading' className='sr-only'>
                    Server Grid
                </h2>
                <ServerGrid />
            </section>
        </main>
    )
}
